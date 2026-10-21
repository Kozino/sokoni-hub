import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, signToken } from '../auth';
import { HttpError, audit, validateUuidParam } from '../utils';
import { restoreOrderStock } from '../orderRecovery';
import { notifyBuyerOfOrder, notifyOnlineDrivers, notifyVendorOfOrder } from '../push';
import { moneyModel } from '../moneyModel';
import { getServiceFeeSettings } from '../serviceFees';
import { generateMonthlyBills } from '../serviceFeeBills';
import { getSchedule, saveScheduleSettings } from '../serviceFeeSchedule';

export const adminRouter = Router();
adminRouter.param('id', validateUuidParam);
adminRouter.use(requireAuth('admin'));

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

adminRouter.get('/subscriptions', requireAuth('admin'), async (req, res, next) => {
  try {
    const rows = await query(`
      select s.*, v.business_name 
      from vendor_subscriptions s 
      join vendors v on v.id = s.vendor_id 
      order by s.created_at desc limit 100
    `);
    res.json({ subscriptions: rows });
  } catch (e) { next(e); }
});

// Rescue a stuck delivery: 'release' puts the job back in the rider pool (rider no-show or
// rider stopped responding); 'cancel' ends the order and returns its stock.
const RecoverSchema = z.object({
  action: z.enum(['release', 'cancel']),
  reason: z.string().trim().min(3).max(300),
});

adminRouter.post('/orders/:id/recover', async (req, res, next) => {
  try {
    const b = RecoverSchema.parse(req.body);
    const releasable = ['dispatched_to_driver', 'driver_arrived'];
    const cancellable = ['dispatched', 'dispatched_to_driver', 'driver_arrived'];
    const result = await tx(async (c) => {
      const row = (await c.query('select * from orders where id = $1 for update', [req.params.id])).rows[0];
      if (!row) throw new HttpError(404, 'Order not found');
      if (b.action === 'release') {
        if (!releasable.includes(row.status)) throw new HttpError(409, 'Only an order with an assigned rider can be released.');
        await c.query(`update orders set driver_id = null, status = 'dispatched', updated_at = now() where id = $1`, [row.id]);
      } else {
        if (!cancellable.includes(row.status)) throw new HttpError(409, 'This order can no longer be cancelled from here.');
        await restoreOrderStock(c, row, req.user!.id);
        await c.query(`update orders set status = 'cancelled', driver_id = null, updated_at = now() where id = $1`, [row.id]);
      }
      return row;
    });
    await audit(req.user!, 'order.recover', 'order', result.id, { action: b.action, reason: b.reason, from: result.status });
    if (b.action === 'release') {
      void notifyOnlineDrivers({ title: 'Delivery job released', body: 'A delivery job is waiting for a rider.', data: { orderId: result.id } });
    } else {
      void notifyBuyerOfOrder(result.id, { title: 'Order cancelled', body: 'Your order was cancelled. Sorry about that.', data: { orderId: result.id } });
      void notifyVendorOfOrder(result.id, { title: 'Order cancelled', body: 'An order was cancelled by Sokoni Hub support.', data: { orderId: result.id } });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

adminRouter.post('/subscriptions/:id/approve', requireAuth('admin'), async (req, res, next) => {
  try {
    await tx(async c => {
      const row = (await c.query('select * from vendor_subscriptions where id=$1 for update', [req.params.id])).rows[0];
      if (!row) throw new HttpError(404, 'Not found');
      if (row.status !== 'pending') throw new HttpError(400, 'Already processed');
      
      await c.query('update vendor_subscriptions set status=$1, reviewed_by=$2 where id=$3', ['approved', req.user!.id, req.params.id]);
      
      await c.query(`update vendors set plan=$1, plan_expires_at = greatest(now(), coalesce(plan_expires_at, now())) + interval '1 month' * $2 where id=$3`, [row.plan, row.months, row.vendor_id]);
    });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

adminRouter.post('/subscriptions/:id/reject', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = z.object({ note: z.string().optional() }).parse(req.body);
    await query('update vendor_subscriptions set status=$1, admin_note=$2, reviewed_by=$3 where id=$4 and status=$5', ['rejected', b.note || null, req.user!.id, req.params.id, 'pending']);
    res.json({ ok: true });
  } catch(e) { next(e); }
});


adminRouter.put('/plan-limits', requireAuth('admin'), async (req, res, next) => {
  try {
    const { limits, prices } = z.object({ limits: z.record(z.any()), prices: z.record(z.any()) }).parse(req.body);
    await query(`
      insert into system_settings (key, value, updated_at) 
      values ('plan_limits', $1, now()) 
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `, [JSON.stringify(limits)]);
    await query(`
      insert into system_settings (key, value, updated_at) 
      values ('plan_prices', $1, now()) 
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `, [JSON.stringify(prices)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

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
        (select count(*) from users u where u.role = 'vendor'
           and not exists (select 1 from vendors v where v.user_id = u.id))      as vendors_incomplete,
        (select count(*) from listings where status = 'active')                  as listings_active,
        (select count(*) from listings where status = 'pending_review')         as listings_pending,
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
      select a.action, a.entity, a.entity_id, a.meta, a.created_at,
             u.full_name as actor, i.full_name as impersonated_by
      from audit_log a
      left join users u on u.id = a.actor_id
      left join users i on i.id = a.impersonated_by
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

/**
 * People who registered as vendors but never submitted their store, so they
 * have no vendors row and don't appear in the verification queue.
 * Must stay ABOVE '/vendors/:id' or Express will treat "incomplete" as an id.
 */
adminRouter.get('/vendors/incomplete', async (_req, res, next) => {
  try {
    const rows = await query(`
      select u.id, u.full_name, u.phone, u.email, u.is_active, u.created_at
      from users u
      where u.role = 'vendor'
        and not exists (select 1 from vendors v where v.user_id = u.id)
      order by u.created_at desc limit 200`);
    res.json({ users: rows });
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
    const current = await one<any>('select id, id_document_url from vendors where id=$1', [req.params.id]);
    if (!current) throw new HttpError(404, 'Vendor not found');
    if (!current.id_document_url) throw new HttpError(409, 'This store has no CR or business-registration licence. Ask the vendor to upload it before verifying.');
    const v = await one<any>(
      `update vendors set status='verified', verified_at=now(), verified_by=$2, rejection_reason=null
       where id=$1 returning *`, [req.params.id, req.user!.id]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    await audit(req.user!, 'vendor.verify', 'vendor', v.id, { business_name: v.business_name });
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
    await audit(req.user!, 'vendor.reject', 'vendor', v.id, { reason: b.reason });
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
    await audit(req.user!, 'vendor.suspend', 'vendor', v.id, { reason: b.reason });
    res.json({ vendor: v });
  } catch (e) { next(e); }
});

adminRouter.post('/vendors/:id/reinstate', async (req, res, next) => {
  try {
    const v = await one<any>(
      `update vendors set status='verified', rejection_reason=null, verified_at=now(), verified_by=$2
       where id=$1 returning *`, [req.params.id, req.user!.id]);
    if (!v) throw new HttpError(404, 'Vendor not found');
    await audit(req.user!, 'vendor.reinstate', 'vendor', v.id);
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
      order by case l.status when 'pending_review' then 0 else 1 end, l.created_at desc limit 300`, [q, status]);
    res.json({ listings: rows });
  } catch (e) { next(e); }
});

adminRouter.post('/listings/:id/approve', async (req, res, next) => {
  try {
    const l = await one<any>(
      `update listings set status='active', rejection_reason=null, reviewed_by=$2,
         first_approved_at = coalesce(first_approved_at, now())
       where id=$1 returning *`, [req.params.id, req.user!.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!, 'listing.approve', 'listing', l.id, { title: l.title });
    res.json({ listing: l });
  } catch (e) { next(e); }
});

adminRouter.post('/listings/:id/reject', async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
    const l = await one<any>(
      `update listings set status='rejected', rejection_reason=$2, reviewed_by=$3 where id=$1 returning *`,
      [req.params.id, b.reason, req.user!.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!, 'listing.reject', 'listing', l.id, { reason: b.reason });
    res.json({ listing: l });
  } catch (e) { next(e); }
});

adminRouter.post('/listings/:id/remove', async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const l = await one(`update listings set status='removed' where id=$1 returning *`, [req.params.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!, 'listing.admin_remove', 'listing', req.params.id, { reason: b.reason });
    res.json({ listing: l });
  } catch (e) { next(e); }
});

adminRouter.post('/listings/:id/restore', async (req, res, next) => {
  try {
    const l = await one(`update listings set status='active' where id=$1 returning *`, [req.params.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!, 'listing.admin_restore', 'listing', req.params.id);
    res.json({ listing: l });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */
adminRouter.get('/complaints', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const rows = await query<any>(`
      select c.*, v.business_name, l.title as listing_title, o.code as order_code_ref
      from complaints c
      left join vendors v on v.id = c.vendor_id
      left join listings l on l.id = c.listing_id
      left join orders o on o.id = c.order_id
      where ($1 = '' or c.status::text = $1)
      order by case c.status when 'open' then 0 when 'investigating' then 1 else 2 end, c.created_at desc
      limit 300`, [status]);
    if (rows.length) {
      const ids = rows.map((c) => c.id);
      const messages = await query<any>(
        `select id, complaint_id, author_role, author_name, body, created_at
         from complaint_messages where complaint_id = any($1::uuid[]) order by created_at asc`,
        [ids]
      );
      for (const c of rows) c.messages = messages.filter((m) => m.complaint_id === c.id);
    }
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
    await audit(req.user!, 'complaint.update', 'complaint', req.params.id, { status: b.status });
    res.json({ complaint: c });
  } catch (e) { next(e); }
});

/** Admin replies on the same thread the vendor sees — for follow-up questions before ruling. */
adminRouter.post('/complaints/:id/messages', async (req, res, next) => {
  try {
    const b = z.object({ body: z.string().min(2).max(2000) }).parse(req.body);
    const c = await one<any>('select id from complaints where id = $1', [req.params.id]);
    if (!c) throw new HttpError(404, 'Complaint not found');
    const m = await one(
      `insert into complaint_messages (complaint_id, author_role, author_id, author_name, body)
       values ($1,'admin',$2,$3,$4) returning id, complaint_id, author_role, author_name, body, created_at`,
      [c.id, req.user!.id, req.user!.full_name, b.body]
    );
    await audit(req.user!, 'complaint.admin_reply', 'complaint', c.id);
    res.status(201).json({ message: m });
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
       where id=$1 and deleted_at is null and not exists(select 1 from account_deletion_requests d where d.user_id=users.id and d.status='processing') returning id, full_name, phone, email, role, is_active`,
      [req.params.id, b.is_active ?? null, b.role ?? null]);
    if (!u) throw new HttpError(404, 'User not found');
    await audit(req.user!, 'user.admin_update', 'user', req.params.id, b as any);
    res.json({ user: u });
  } catch (e) { next(e); }
});

/**
 * "View as": issue a short-lived session for a buyer or vendor so the admin can
 * open their account directly. Admins cannot be impersonated, the token lasts
 * one hour, carries the admin's id, and every use is written to the audit log.
 * Response shape matches /auth/login so the frontend can reuse its handler.
 */
adminRouter.post('/users/:id/impersonate', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) throw new HttpError(400, 'You are already this user');
    const target = await one<any>(
      'select id, full_name, phone, email, role, is_active from users where id = $1',
      [req.params.id]);
    if (!target) throw new HttpError(404, 'User not found');
    if (target.role === 'admin') throw new HttpError(403, 'You cannot view as another admin');
    if (!target.is_active) throw new HttpError(403, 'This account is disabled. Enable it first.');

    const vendor = await one(
      'select id, status, business_name, slug from vendors where user_id = $1', [target.id]);

    await audit(req.user!, 'user.impersonate', 'user', target.id,
      { role: target.role, phone: target.phone });

    res.json({
      token: await signToken(target.id, target.role, { expiresIn: '1h', impersonatedBy: req.user!.id, parentSessionId: req.user!.session_id }),
      user: target,
      vendor,
    });
  } catch (e) { next(e); }
});

adminRouter.post('/users/admin', async (req, res, next) => {
  try {
    const b = z.object({
      full_name: z.string().min(2), phone: z.string().min(7),
      email: z.string().email().optional(), password: z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72,'Password must be at most 72 UTF-8 bytes'),
    }).parse(req.body);
    const hash = await bcrypt.hash(b.password, 10);
    const u = await one(
      `insert into users (full_name, phone, email, password_hash, role) values ($1,$2,$3,$4,'admin')
       returning id, full_name, phone, email, role`,
      [b.full_name, b.phone.replace(/\D/g, ''), b.email ?? null, hash]);
    await audit(req.user!, 'user.create_admin', 'user', (u as any).id);
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
      select a.*, u.full_name as actor, i.full_name as impersonated_by_name
      from audit_log a
      left join users u on u.id = a.actor_id
      left join users i on i.id = a.impersonated_by
      order by a.created_at desc limit $1`, [Math.min(Number(req.query.limit) || 100, 500)]);
    res.json({ events: rows });
  } catch (e) { next(e); }
});

// --- Wallet & Payouts ---
adminRouter.get('/payouts', async (req, res, next) => {
  try {
    const payouts = await query(
      `select p.*, v.business_name, v.whatsapp 
       from payouts p 
       join vendors v on v.id = p.vendor_id 
       order by p.created_at desc limit 200`
    );
    res.json({ payouts });
  } catch (e) { next(e); }
});

adminRouter.post('/payouts/:id/mark-paid', async (req, res, next) => {
  try {
    const p = await one(`select * from payouts where id = $1`, [req.params.id]);
    if (!p) throw new Error('Payout not found');
    if (p.status === 'paid') throw new Error('Already paid');
    
    await query(`update payouts set status = 'paid', paid_at = now() where id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Delivery verification & disputes                                    */
/* ------------------------------------------------------------------ */

adminRouter.get('/orders/disputes', async (_req, res, next) => {
  try {
    const disputes = await query(
      `select o.id, o.code, o.status, o.total, o.currency, o.delivery_address, o.contact_name, o.contact_phone,
              o.dispute_reason, o.disputed_at, o.verify_by, o.delivery_proof_url, o.drop_distance_m,
              o.drop_lat, o.drop_lng, o.delivery_lat, o.delivery_lng, o.created_at,
              v.business_name, du.full_name as driver_name, du.phone as driver_phone
         from orders o
         join vendors v on v.id = o.vendor_id
         left join users du on du.id = o.driver_id
        where o.status = 'delivered_pending_verification' and o.disputed_at is not null
        order by o.disputed_at asc`
    );
    res.json({ disputes });
  } catch (e) { next(e); }
});

/**
 * Admin decision on a reported order.
 *  - release: the buyer's problem is not upheld; the order completes and settles.
 *  - cancel:  the order is cancelled and its stock is returned. Refunds are handled
 *             outside the app, since cash on delivery is not held by the platform.
 */
adminRouter.post('/orders/:id/resolve', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const b = z.object({ action: z.enum(['release', 'cancel']), note: z.string().trim().max(500).optional() }).parse(req.body);
    await tx(async (c) => {
      const row = (await c.query(
        `select id, vendor_id, status, disputed_at from orders where id = $1 for update`, [id]
      )).rows[0];
      if (!row) throw new HttpError(404, 'Order not found');
      if (row.status !== 'delivered_pending_verification' || !row.disputed_at) {
        throw new HttpError(409, 'Only reported orders waiting for review can be resolved.');
      }
      if (b.action === 'release') {
        await c.query(
          `update orders set status = 'delivered', delivered_at = now(), completed_by = 'admin', updated_at = now() where id = $1`,
          [id]
        );
      } else {
        const items = (await c.query(
          `select listing_id, sum(qty)::int as qty from order_items where order_id = $1 and listing_id is not null
            group by listing_id order by listing_id`, [id]
        )).rows;
        for (const item of items) {
          const stock = (await c.query(
            `update listings set quantity = quantity + $2 where id = $1 and quantity is not null returning quantity`,
            [item.listing_id, item.qty]
          )).rows[0];
          if (stock) {
            await c.query(
              `insert into stock_movements(listing_id, vendor_id, delta, balance_after, reason, order_id, actor_id, note)
               values ($1, $2, $3, $4, 'return', $5, $6, 'Reported order cancelled by admin')`,
              [item.listing_id, row.vendor_id, item.qty, stock.quantity, id, req.user!.id]
            );
          }
        }
        await c.query(
          `update orders set status = 'cancelled', stock_restored_at = coalesce(stock_restored_at, now()), updated_at = now() where id = $1`,
          [id]
        );
      }
    });
    await audit(req.user!, 'order.resolve', 'order', id, { action: b.action, note: b.note || null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/delivery-verification', async (_req, res, next) => {
  try {
    const row = await one<any>(`select value from system_settings where key = 'delivery_verification'`);
    res.json({ settings: row?.value ?? { auto_complete_hours: 24, geofence_metres: 150 } });
  } catch (e) { next(e); }
});

adminRouter.put('/delivery-verification', async (req, res, next) => {
  try {
    const b = z.object({
      auto_complete_hours: z.number().int().min(1).max(168),
      geofence_metres: z.number().int().min(30).max(1000),
    }).parse(req.body);
    await query(
      `insert into system_settings (key, value, updated_at) values ('delivery_verification', $1, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(b)]
    );
    await audit(req.user!, 'settings.delivery_verification', 'system_settings', 'delivery_verification', b);
    res.json({ ok: true, settings: b });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Drivers                                                            */
/* ------------------------------------------------------------------ */

adminRouter.get('/drivers', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const q = status ? `where d.status = $1` : ``;
    const params = status ? [status] : [];
    
    const drivers = await query(
      `select d.id, d.user_id, d.status, d.vehicle_type, d.license_plate, d.is_online,
              d.bank_name, d.bank_account_name, d.bank_iban, d.documents,
              u.full_name, u.phone, u.email, d.created_at
       from drivers d
       join users u on u.id = d.user_id
       ${q}
       order by d.created_at desc`,
      params
    );
    res.json({ drivers });
  } catch (e) { next(e); }
});

adminRouter.post('/drivers/:id/approve', async (req, res, next) => {
  try {
    await query(`update drivers set status = 'approved' where id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

adminRouter.post('/drivers/:id/suspend', async (req, res, next) => {
  try {
    await query(`update drivers set status = 'suspended', is_online = false where id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

/**
 * Cash and fee reconciliation for riders (item 5).
 * cash held    = cash collected on delivery - cash remitted
 * fees owed    = delivery fees earned - fees paid out
 * Entries are created automatically when a rider completes an order. Remittances and fee payouts
 * are recorded here by an admin, and can never take a balance below zero.
 */
adminRouter.get('/driver-cash', async (req, res, next) => {
  try {
    const rows = await query<any>(
      `select d.id as driver_id, d.user_id, d.status, u.full_name, u.phone,
              coalesce(sum(l.amount) filter (where l.kind = 'cash_collected'), 0)::float as cash_collected,
              coalesce(sum(l.amount) filter (where l.kind = 'remittance'), 0)::float as remitted,
              coalesce(sum(l.amount) filter (where l.kind = 'fee_earned'), 0)::float as fees_earned,
              coalesce(sum(l.amount) filter (where l.kind = 'fee_paid'), 0)::float as fees_paid
         from drivers d
         join users u on u.id = d.user_id
         left join driver_ledger l on l.driver_user_id = d.user_id
        group by d.id, d.user_id, d.status, u.full_name, u.phone
        order by u.full_name`
    );
    const drivers = rows.map((r) => ({
      driver_id: r.driver_id,
      user_id: r.user_id,
      status: r.status,
      full_name: r.full_name,
      phone: r.phone,
      cash_collected: round2(r.cash_collected),
      remitted: round2(r.remitted),
      cash_held: round2(r.cash_collected - r.remitted),
      fees_earned: round2(r.fees_earned),
      fees_paid: round2(r.fees_paid),
      fees_owed: round2(r.fees_earned - r.fees_paid),
    }));
    const entries = await query(
      `select l.id, l.kind, l.amount, l.note, l.order_id, l.created_at, u.full_name as driver_name,
              o.code as order_code
         from driver_ledger l
         join users u on u.id = l.driver_user_id
         left join orders o on o.id = l.order_id
        order by l.created_at desc limit 200`
    );
    res.json({ drivers, entries });
  } catch (e) { next(e); }
});

const CashEntrySchema = z.object({
  kind: z.enum(['remittance', 'fee_paid']),
  amount: z.number().positive().max(100000),
  note: z.string().trim().min(3).max(300),
});

adminRouter.post('/driver-cash/:driverId/entries', async (req, res, next) => {
  try {
    const driverId = z.string().uuid().parse(req.params.driverId);
    const b = CashEntrySchema.parse(req.body);
    const amount = round2(b.amount);
    await tx(async (c) => {
      const d = (await c.query('select user_id from drivers where id = $1 for update', [driverId])).rows[0];
      if (!d) throw new HttpError(404, 'Rider not found');
      const bal = (await c.query(
        `select (coalesce(sum(amount) filter (where kind = 'cash_collected'), 0) - coalesce(sum(amount) filter (where kind = 'remittance'), 0))::numeric as cash_held,
                (coalesce(sum(amount) filter (where kind = 'fee_earned'), 0) - coalesce(sum(amount) filter (where kind = 'fee_paid'), 0))::numeric as fee_owed
           from driver_ledger where driver_user_id = $1`,
        [d.user_id]
      )).rows[0];
      if (b.kind === 'remittance' && amount > Number(bal.cash_held) + 0.001) {
        throw new HttpError(409, `The rider holds only ${round2(Number(bal.cash_held)).toFixed(2)} in cash.`);
      }
      if (b.kind === 'fee_paid' && amount > Number(bal.fee_owed) + 0.001) {
        throw new HttpError(409, `Only ${round2(Number(bal.fee_owed)).toFixed(2)} in fees is owed to this rider.`);
      }
      await c.query(
        `insert into driver_ledger (driver_user_id, kind, amount, note, created_by) values ($1, $2, $3, $4, $5)`,
        [d.user_id, b.kind, amount, b.note, req.user!.id]
      );
    });
    await audit(req.user!, 'driver_cash.entry', 'driver', driverId, { kind: b.kind, amount, note: b.note });
    res.status(201).json({ success: true });
  } catch (e) { next(e); }
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Admin switches for commission and monthly plans (QC item 2). Takes effect immediately. */
adminRouter.get('/money-model', async (_req, res, next) => {
  try {
    res.json(await moneyModel());
  } catch (e) { next(e); }
});

const MoneyModelSchema = z.object({ commission_enabled: z.boolean(), subscription_enabled: z.boolean() })
  .refine((m) => m.commission_enabled !== m.subscription_enabled, {
    message: 'Choose one mode: commission per order, or monthly subscription.',
  });

adminRouter.put('/money-model', async (req, res, next) => {
  try {
    const b = MoneyModelSchema.parse(req.body);
    await query(
      `insert into system_settings (key, value, updated_at) values ('money_model', $1, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(b)]
    );
    await audit(req.user!, 'money_model.update', 'settings', 'money_model', b);
    res.json(await moneyModel());
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Service booking fees and service plans                              */
/* ------------------------------------------------------------------ */

const ServiceFeesSchema = z.object({
  fee_enabled: z.boolean(),
  amount: z.number().min(0).max(10000),
  charge_on: z.enum(['every_booking', 'new_clients']),
  waive_for_plan: z.boolean(),
  plan_enabled: z.boolean(),
  due_days: z.number().int().min(1).max(90),
  payment_instructions: z.string().max(1000).default(''),
});

/** Current fee rules, the fee ledger, and totals. */
adminRouter.get('/service-fees', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const allowed = ['due', 'paid', 'waived', 'void'];
    const filter = allowed.includes(status) ? status : null;
    const rows = await query(
      `select f.id, f.amount, f.currency, f.status, f.charge_on, f.created_at, f.paid_at, f.payment_reference,
              b.code as booking_code, v.business_name, v.id as vendor_id
         from service_booking_fees f
         join service_bookings b on b.id = f.booking_id
         join vendors v on v.id = f.vendor_id
        where ($1::text is null or f.status = $1::text)
        order by f.created_at desc limit 300`,
      [filter],
    );
    const totals = await one<any>(
      `select coalesce(sum(amount) filter (where status='due'),0)::float as due,
              coalesce(sum(amount) filter (where status='paid'),0)::float as paid,
              count(*) filter (where status='due')::int as due_count
         from service_booking_fees`,
    );
    res.json({ rules: await getServiceFeeSettings(), fees: rows, totals });
  } catch (e) { next(e); }
});

/** Save the fee rules. Takes effect for bookings made from now on. */
adminRouter.put('/service-fees', async (req, res, next) => {
  try {
    const b = ServiceFeesSchema.parse(req.body);
    await query(
      `insert into system_settings (key, value, updated_at) values ('service_fees', $1, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(b)],
    );
    await audit(req.user!, 'service_fees.update', 'settings', 'service_fees', b);
    res.json({ rules: await getServiceFeeSettings() });
  } catch (e) { next(e); }
});

/** Mark a due fee as paid, with the bank or cash reference. */
adminRouter.post('/service-fees/:id/paid', async (req, res, next) => {
  try {
    const reference = z.string().max(120).optional().parse(req.body?.reference) || null;
    const row = await one<any>(
      `update service_booking_fees set status='paid', paid_at=now(), payment_reference=$2
        where id=$1 and status='due' returning *`,
      [req.params.id, reference],
    );
    if (!row) throw new HttpError(409, 'Only a due fee can be marked as paid.');
    await audit(req.user!, 'service_fees.paid', 'service_booking_fees', req.params.id, { reference });
    res.json({ fee: row });
  } catch (e) { next(e); }
});

/** Waive a due fee, for example as a goodwill gesture. */
adminRouter.post('/service-fees/:id/waive', async (req, res, next) => {
  try {
    const row = await one<any>(
      `update service_booking_fees set status='waived' where id=$1 and status='due' returning *`,
      [req.params.id],
    );
    if (!row) throw new HttpError(409, 'Only a due fee can be waived.');
    await audit(req.user!, 'service_fees.waive', 'service_booking_fees', req.params.id, {});
    res.json({ fee: row });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* Monthly service fee bills                                           */
/* ------------------------------------------------------------------ */

/** Issue the bills for a closed month. Idempotent: a vendor is never billed twice for the same month. */
adminRouter.post('/service-fee-bills/generate', async (req, res, next) => {
  try {
    const { month } = z.object({ month: z.string() }).parse(req.body);
    const result = await generateMonthlyBills(month);
    await audit(req.user!, 'service_fee_bills.generate', 'settings', month, result);
    res.json({ month, ...result });
  } catch (e) { next(e); }
});

/** Bills, filtered by status, with the vendor name and the transfer details. */
adminRouter.get('/service-fee-bills', async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim();
    const allowed = ['open', 'submitted', 'paid', 'void'];
    const filter = allowed.includes(status) ? status : null;
    const rows = await query(
      `select b.id, b.period_start, b.period_end, b.amount, b.status, b.due_date, b.payment_method,
              b.payment_reference, b.receipt_url, b.submitted_at, b.paid_at, b.paid_from_wallet, b.admin_note,
              v.business_name, v.id as vendor_id,
              (select count(*)::int from service_booking_fees f where f.bill_id = b.id) as fee_count
         from service_fee_bills b join vendors v on v.id = b.vendor_id
        where ($1::text is null or b.status = $1::text)
        order by case b.status when 'submitted' then 0 when 'open' then 1 else 2 end, b.period_start desc
        limit 300`,
      [filter],
    );
    const totals = await one<any>(
      `select coalesce(sum(amount) filter (where status='open'),0)::float as open,
              coalesce(sum(amount) filter (where status='submitted'),0)::float as submitted,
              count(*) filter (where status='submitted')::int as submitted_count
         from service_fee_bills`,
    );
    res.json({ bills: rows, totals });
  } catch (e) { next(e); }
});

/** Confirm a bill as paid: a submitted transfer, or a transfer the admin received without a submission. */
adminRouter.post('/service-fee-bills/:id/confirm', async (req, res, next) => {
  try {
    const reference = z.string().trim().max(120).optional().parse(req.body?.reference) || null;
    const bill = await tx(async (c) => {
      const row = (await c.query(
        `update service_fee_bills set status = 'paid', paid_at = now(), paid_from_wallet = false,
                payment_method = coalesce(payment_method, 'bank_transfer'),
                payment_reference = coalesce($2, payment_reference), reviewed_by = $3
          where id = $1 and status in ('open', 'submitted') returning *`,
        [req.params.id, reference, req.user!.id],
      )).rows[0];
      if (!row) throw new HttpError(409, 'Only an open or submitted bill can be confirmed.');
      await c.query(
        `update service_booking_fees set status = 'paid', paid_at = now() where bill_id = $1 and status = 'billed'`,
        [row.id],
      );
      return row;
    });
    await audit(req.user!, 'service_fee_bills.confirm', 'service_fee_bills', req.params.id, { reference });
    res.json({ bill });
  } catch (e) { next(e); }
});

/** Send a submitted transfer back to the vendor, with a reason. The bill is open again. */
adminRouter.post('/service-fee-bills/:id/reject', async (req, res, next) => {
  try {
    const note = z.string().trim().min(3).max(500).parse(req.body?.note);
    const row = await one<any>(
      `update service_fee_bills set status = 'open', admin_note = $2, reviewed_by = $3,
              receipt_url = null, payment_reference = null, submitted_at = null
        where id = $1 and status = 'submitted' returning *`,
      [req.params.id, note, req.user!.id],
    );
    if (!row) throw new HttpError(409, 'Only a submitted bill can be sent back.');
    await audit(req.user!, 'service_fee_bills.reject', 'service_fee_bills', req.params.id, { note });
    res.json({ bill: row });
  } catch (e) { next(e); }
});

/** The monthly bill schedule: ON or OFF, the day and hour, and the last run. */
adminRouter.get('/service-fee-bills/schedule', async (_req, res, next) => {
  try {
    res.json({ schedule: await getSchedule() });
  } catch (e) { next(e); }
});

const ScheduleSchema = z.object({
  enabled: z.boolean(),
  day_of_month: z.number().int().min(1).max(28),
  hour: z.number().int().min(0).max(23),
});

adminRouter.put('/service-fee-bills/schedule', async (req, res, next) => {
  try {
    const b = ScheduleSchema.parse(req.body);
    const schedule = await saveScheduleSettings(b);
    await audit(req.user!, 'service_fee_bills.schedule', 'settings', 'service_fee_bill_schedule', b);
    res.json({ schedule });
  } catch (e) { next(e); }
});
