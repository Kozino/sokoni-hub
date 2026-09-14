import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query } from '../db';
import { requireAuth } from '../auth';
import { HttpError, audit } from '../utils';

export const adminRouter = Router();
adminRouter.use(requireAuth('admin'));

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */
adminRouter.get('/overview', async (_req, res, next) => {
  try {
    const [stats] = await query<any>(`
      select
        (select count(*) from users)                                             as users_total,
        (select count(*) from users where role = 'buyer')                        as buyers,
        (select count(*) from users where role = 'vendor')                       as vendors_users,
        (select count(*) from users where created_at > now() - interval '7 days') as users_7d,
        (select count(*) from vendors)                                           as vendors_total,
        (select count(*) from vendors where status = 'pending')                  as vendors_pending,
        (select count(*) from vendors where status = 'verified')                 as vendors_verified,
        (select count(*) from vendors where status = 'rejected')                 as vendors_rejected,
        (select count(*) from vendors where status = 'suspended')                as vendors_suspended,
        (select count(*) from listings where status = 'active')                  as listings_active,
        (select count(*) from listings where kind='product' and status='active') as products_active,
        (select count(*) from listings where kind='service' and status='active') as services_active,
        (select count(*) from orders)                                            as orders_total,
        (select count(*) from orders where created_at > now() - interval '7 days') as orders_7d,
        (select coalesce(sum(total),0) from orders where status <> 'cancelled')  as gmv,
        (select count(*) from complaints where status in ('open','investigating')) as complaints_open,
        (select count(*) from complaints)                                        as complaints_total`);

    const signupTrend = await query<any>(`
      select to_char(d.day,'YYYY-MM-DD') as day,
             count(u.id) filter (where u.role='vendor')::int as vendors,
             count(u.id) filter (where u.role='buyer')::int  as buyers
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') d(day)
      left join users u on date_trunc('day', u.created_at) = d.day
      group by d.day order by d.day`);

    const orderTrend = await query<any>(`
      select to_char(d.day,'YYYY-MM-DD') as day,
             count(o.id)::int as orders,
             coalesce(sum(o.total) filter (where o.status <> 'cancelled'),0)::float as gmv
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') d(day)
      left join orders o on date_trunc('day', o.created_at) = d.day
      group by d.day order by d.day`);

    const byCategory = await query<any>(`
      select c.name, c.kind, count(l.id)::int as listings
      from categories c left join listings l on l.category_id = c.id and l.status='active'
      where c.is_banned = false
      group by c.name, c.kind order by listings desc limit 12`);

    // NOTE: listings and orders are independent one-to-many relations off vendors.
    // Joining both in one query multiplies the rows (fan-out), so each aggregate
    // must be computed in its own scalar subquery.
    const topVendors = await query<any>(`
      select v.business_name, v.city, v.rating_avg,
             (select count(*) from listings l
               where l.vendor_id = v.id and l.status = 'active')::int as listings,
             (select coalesce(sum(o.total),0) from orders o
               where o.vendor_id = v.id and o.status <> 'cancelled')::float as gmv
      from vendors v
      where v.status = 'verified'
      order by gmv desc, listings desc limit 10`);

    const recentActivity = await query<any>(`
      select a.action, a.entity, a.entity_id, a.meta, a.created_at, u.full_name as actor
      from audit_log a left join users u on u.id = a.actor_id
      order by a.created_at desc limit 25`);

    res.json({ stats, signupTrend, orderTrend, byCategory, topVendors, recentActivity });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Vendor verification                                                 */
/* ------------------------------------------------------------------ */
adminRouter.get('/vendors', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim();
    const rows = await query(`
      select v.*, u.full_name as owner_name, u.phone as owner_phone, u.email as owner_email,
             (select count(*) from listings l where l.vendor_id = v.id and l.status <> 'removed')::int as listings,
             (select count(*) from complaints c where c.vendor_id = v.id and c.status in ('open','investigating'))::int as open_complaints
      from vendors v join users u on u.id = v.user_id
      where ($1 = '' or v.status::text = $1)
        and ($2 = '' or v.business_name ilike '%'||$2||'%' or u.phone ilike '%'||$2||'%' or u.full_name ilike '%'||$2||'%')
      order by case v.status when 'pending' then 0 else 1 end, v.created_at desc
      limit 200`, [status, q]);
    res.json({ vendors: rows });
  } catch (e) { next(e); }
});

adminRouter.get('/vendors/:id', async (req, res, next) => {
  try {
    const v = await one<any>(`
      select v.*, u.full_name as owner_name, u.phone as owner_phone, u.email as owner_email
      from vendors v join users u on u.id = v.user_id where v.id = $1`, [req.params.id]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    v.listings = await query('select * from listings where vendor_id = $1 order by created_at desc', [v.id]);
    v.complaints = await query('select * from complaints where vendor_id = $1 order by created_at desc', [v.id]);
    res.json({ vendor: v });
  } catch (e) { next(e); }
});

adminRouter.post('/vendors/:id/verify', async (req, res, next) => {
  try {
    const v = await one<any>(
      `update vendors set status='verified', verified_at=now(), verified_by=$2, rejection_reason=null
       where id=$1 returning *`, [req.params.id, req.user!.id]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    await audit(req.user!.id, 'vendor.verify', 'vendor', v.id, { business_name: v.business_name });
    res.json({ vendor: v });
  } catch (e) { next(e); }
});

adminRouter.post('/vendors/:id/reject', async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
    const v = await one<any>(
      `update vendors set status='rejected', rejection_reason=$2, verified_by=$3 where id=$1 returning *`,
      [req.params.id, b.reason, req.user!.id]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    await query(`update listings set status='paused' where vendor_id=$1 and status='active'`, [v.id]);
    await audit(req.user!.id, 'vendor.reject', 'vendor', v.id, { reason: b.reason });
    res.json({ vendor: v });
  } catch (e) { next(e); }
});

adminRouter.post('/vendors/:id/suspend', async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
    const v = await one<any>(
      `update vendors set status='suspended', rejection_reason=$2 where id=$1 returning *`,
      [req.params.id, b.reason ?? null]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    await query(`update listings set status='paused' where vendor_id=$1 and status='active'`, [v.id]);
    await audit(req.user!.id, 'vendor.suspend', 'vendor', v.id, { reason: b.reason });
    res.json({ vendor: v });
  } catch (e) { next(e); }
});

adminRouter.post('/vendors/:id/reinstate', async (req, res, next) => {
  try {
    const v = await one<any>(
      `update vendors set status='verified', rejection_reason=null, verified_at=now(), verified_by=$2
       where id=$1 returning *`, [req.params.id, req.user!.id]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    await audit(req.user!.id, 'vendor.reinstate', 'vendor', v.id);
    res.json({ vendor: v });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Listing moderation                                                  */
/* ------------------------------------------------------------------ */
adminRouter.get('/listings', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '');
    const rows = await query(`
      select l.*, v.business_name, v.slug as vendor_slug, c.name as category_name
      from listings l join vendors v on v.id = l.vendor_id join categories c on c.id = l.category_id
      where ($1 = '' or l.title ilike '%'||$1||'%' or v.business_name ilike '%'||$1||'%')
        and ($2 = '' or l.status::text = $2)
      order by l.created_at desc limit 300`, [q, status]);
    res.json({ listings: rows });
  } catch (e) { next(e); }
});

adminRouter.post('/listings/:id/remove', async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const l = await one(`update listings set status='removed' where id=$1 returning *`, [req.params.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!.id, 'listing.admin_remove', 'listing', req.params.id, { reason: b.reason });
    res.json({ listing: l });
  } catch (e) { next(e); }
});

adminRouter.post('/listings/:id/restore', async (req, res, next) => {
  try {
    const l = await one(`update listings set status='active' where id=$1 returning *`, [req.params.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!.id, 'listing.admin_restore', 'listing', req.params.id);
    res.json({ listing: l });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */
adminRouter.get('/complaints', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const rows = await query(`
      select c.*, v.business_name, l.title as listing_title, o.code as order_code_ref
      from complaints c
      left join vendors v on v.id = c.vendor_id
      left join listings l on l.id = c.listing_id
      left join orders o on o.id = c.order_id
      where ($1 = '' or c.status::text = $1)
      order by case c.status when 'open' then 0 when 'investigating' then 1 else 2 end, c.created_at desc
      limit 300`, [status]);
    res.json({ complaints: rows });
  } catch (e) { next(e); }
});

adminRouter.patch('/complaints/:id', async (req, res, next) => {
  try {
    const b = z.object({
      status: z.enum(['open', 'investigating', 'resolved', 'dismissed']),
      admin_note: z.string().max(2000).optional(),
    }).parse(req.body);
    const c = await one(
      `update complaints set status=$2::complaint_status, admin_note=coalesce($3, admin_note),
         resolved_at = case when $2::text in ('resolved','dismissed') then now() else null end
       where id=$1 returning *`, [req.params.id, b.status, b.admin_note ?? null]);
    if (!c) throw new HttpError(404, 'Complaint not found');
    await audit(req.user!.id, 'complaint.update', 'complaint', req.params.id, { status: b.status });
    res.json({ complaint: c });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Users / orders / categories                                         */
/* ------------------------------------------------------------------ */
adminRouter.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const role = String(req.query.role || '');
    const rows = await query(`
      select id, full_name, phone, email, role, is_active, created_at from users
      where ($1 = '' or full_name ilike '%'||$1||'%' or phone ilike '%'||$1||'%' or email ilike '%'||$1||'%')
        and ($2 = '' or role::text = $2)
      order by created_at desc limit 300`, [q, role]);
    res.json({ users: rows });
  } catch (e) { next(e); }
});

adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const b = z.object({ is_active: z.boolean().optional(), role: z.enum(['buyer','vendor','admin']).optional() }).parse(req.body);
    if (req.params.id === req.user!.id && b.is_active === false)
      throw new HttpError(400, 'You cannot disable your own account');
    const u = await one(
      `update users set is_active = coalesce($2, is_active), role = coalesce($3::user_role, role)
       where id=$1 returning id, full_name, phone, email, role, is_active`,
      [req.params.id, b.is_active ?? null, b.role ?? null]);
    if (!u) throw new HttpError(404, 'User not found');
    await audit(req.user!.id, 'user.admin_update', 'user', req.params.id, b as any);
    res.json({ user: u });
  } catch (e) { next(e); }
});

adminRouter.post('/users/admin', async (req, res, next) => {
  try {
    const b = z.object({
      full_name: z.string().min(2), phone: z.string().min(7),
      email: z.string().email().optional(), password: z.string().min(8),
    }).parse(req.body);
    const hash = await bcrypt.hash(b.password, 10);
    const u = await one(
      `insert into users (full_name, phone, email, password_hash, role) values ($1,$2,$3,$4,'admin')
       returning id, full_name, phone, email, role`,
      [b.full_name, b.phone.replace(/\D/g, ''), b.email ?? null, hash]);
    await audit(req.user!.id, 'user.create_admin', 'user', (u as any).id);
    res.status(201).json({ user: u });
  } catch (e) { next(e); }
});

adminRouter.get('/orders', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim();
    const rows = await query(`
      select o.*, v.business_name from orders o join vendors v on v.id = o.vendor_id
      where ($1 = '' or o.status::text = $1)
        and ($2 = '' or o.code ilike '%'||$2||'%' or o.contact_name ilike '%'||$2||'%' or o.contact_phone ilike '%'||$2||'%')
      order by o.created_at desc limit 300`, [status, q]);
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

adminRouter.get('/categories', async (_req, res, next) => {
  try {
    res.json({ categories: await query('select * from categories order by sort, name') });
  } catch (e) { next(e); }
});

adminRouter.post('/categories', async (req, res, next) => {
  try {
    const b = z.object({
      name: z.string().min(2), slug: z.string().min(2),
      kind: z.enum(['product','service']), is_banned: z.boolean().optional(), sort: z.number().optional(),
    }).parse(req.body);
    const c = await one(
      `insert into categories (name, slug, kind, is_banned, sort) values ($1,$2,$3::listing_kind,coalesce($4,false),coalesce($5,100))
       returning *`, [b.name, b.slug, b.kind, b.is_banned ?? null, b.sort ?? null]);
    res.status(201).json({ category: c });
  } catch (e) { next(e); }
});

adminRouter.patch('/categories/:id', async (req, res, next) => {
  try {
    const b = z.object({ name: z.string().optional(), is_banned: z.boolean().optional(), sort: z.number().optional() }).parse(req.body);
    const c = await one(
      `update categories set name=coalesce($2,name), is_banned=coalesce($3,is_banned), sort=coalesce($4,sort)
       where id=$1 returning *`, [req.params.id, b.name ?? null, b.is_banned ?? null, b.sort ?? null]);
    res.json({ category: c });
  } catch (e) { next(e); }
});

adminRouter.get('/audit', async (req, res, next) => {
  try {
    const rows = await query(`
      select a.*, u.full_name as actor from audit_log a left join users u on u.id = a.actor_id
      order by a.created_at desc limit $1`, [Math.min(Number(req.query.limit) || 100, 500)]);
    res.json({ events: rows });
  } catch (e) { next(e); }
});
