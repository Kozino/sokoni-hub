import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db';
import { requireAuth, loadVendor, requireVerifiedVendor } from '../auth';
import { HttpError, audit, slugify, screenProhibited, normalizePhone } from '../utils';

export const vendorRouter = Router();

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */
const onboardSchema = z.object({
  business_name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  whatsapp: z.string().min(7).max(20),
  country: z.string().min(2).max(60),
  city: z.string().min(2).max(60),
  address: z.string().max(300).optional(),
  logo_url: z.string().url().optional().nullable(),
  id_document_url: z.string().url().optional().nullable(),
});

vendorRouter.post('/onboard', requireAuth('vendor', 'buyer'), async (req, res, next) => {
  try {
    const b = onboardSchema.parse(req.body);
    const bad = await screenProhibited(b.business_name, b.description);
    if (bad)
      throw new HttpError(422, `Prohibited category detected ("${bad}"). Cosmetics and medicine are not allowed on this platform.`);

    const existing = await one('select id from vendors where user_id = $1', [req.user!.id]);
    if (existing) throw new HttpError(409, 'You already have a vendor profile');

    let slug = slugify(b.business_name);
    if (await one('select id from vendors where slug = $1', [slug])) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const vendor = await one<any>(
      `insert into vendors (user_id, business_name, slug, description, whatsapp, country, city, address, logo_url, id_document_url, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') returning *`,
      [req.user!.id, b.business_name.trim(), slug, b.description || null, normalizePhone(b.whatsapp),
       b.country, b.city, b.address || null, b.logo_url || null, b.id_document_url || null]
    );
    await query(`update users set role = 'vendor' where id = $1 and role <> 'admin'`, [req.user!.id]);
    await audit(req.user!.id, 'vendor.onboard', 'vendor', vendor.id, { business_name: vendor.business_name });
    res.status(201).json({ vendor, message: 'Submitted. An admin will review your store shortly.' });
  } catch (e) {
    next(e);
  }
});

vendorRouter.get('/me', requireAuth('vendor', 'admin'), loadVendor, async (req, res, next) => {
  try {
    const vendor = await one('select * from vendors where id = $1', [req.vendor!.id]);
    res.json({ vendor });
  } catch (e) {
    next(e);
  }
});

vendorRouter.patch('/me', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const b = onboardSchema.partial().parse(req.body);
    const bad = await screenProhibited(b.business_name, b.description);
    if (bad) throw new HttpError(422, `Prohibited content detected ("${bad}").`);
    const vendor = await one<any>(
      `update vendors set
         business_name = coalesce($2, business_name),
         description   = coalesce($3, description),
         whatsapp      = coalesce($4, whatsapp),
         country       = coalesce($5, country),
         city          = coalesce($6, city),
         address       = coalesce($7, address),
         logo_url      = coalesce($8, logo_url),
         id_document_url = coalesce($9, id_document_url),
         status = case when status = 'rejected' then 'pending'::vendor_status else status end,
         rejection_reason = case when status = 'rejected' then null else rejection_reason end
       where id = $1 returning *`,
      [req.vendor!.id, b.business_name ?? null, b.description ?? null,
       b.whatsapp ? normalizePhone(b.whatsapp) : null, b.country ?? null, b.city ?? null,
       b.address ?? null, b.logo_url ?? null, b.id_document_url ?? null]
    );
    await audit(req.user!.id, 'vendor.update', 'vendor', vendor.id);
    res.json({ vendor });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Vendor dashboard stats                                              */
/* ------------------------------------------------------------------ */
vendorRouter.get('/dashboard', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const vid = req.vendor!.id;
    const [stats] = await query<any>(
      `select
         (select count(*) from listings where vendor_id = $1 and status <> 'removed')            as listings_total,
         (select count(*) from listings where vendor_id = $1 and status = 'active')              as listings_active,
         (select count(*) from listings where vendor_id = $1 and kind = 'product' and status='active') as products_active,
         (select count(*) from listings where vendor_id = $1 and kind = 'service' and status='active') as services_active,
         (select coalesce(sum(views),0) from listings where vendor_id = $1)                      as total_views,
         (select count(*) from listings where vendor_id = $1 and kind='product' and coalesce(quantity,0) = 0 and status='active') as out_of_stock,
         (select count(*) from listings where vendor_id = $1 and kind='product' and quantity between 1 and 5 and status='active') as low_stock,
         (select count(*) from orders where vendor_id = $1)                                      as orders_total,
         (select count(*) from orders where vendor_id = $1 and status = 'pending')               as orders_pending,
         (select count(*) from orders where vendor_id = $1 and status = 'delivered')             as orders_delivered,
         (select coalesce(sum(total),0) from orders where vendor_id = $1 and status = 'delivered') as revenue_delivered,
         (select coalesce(sum(total),0) from orders where vendor_id = $1 and status not in ('cancelled')) as revenue_pipeline,
         (select count(*) from complaints where vendor_id = $1 and status in ('open','investigating')) as open_complaints`,
      [vid]
    );

    const salesTrend = await query<any>(
      `select to_char(d.day,'YYYY-MM-DD') as day,
              coalesce(sum(o.total) filter (where o.status <> 'cancelled'),0)::float as revenue,
              count(o.id) filter (where o.status <> 'cancelled')::int as orders
       from generate_series(current_date - interval '29 days', current_date, interval '1 day') d(day)
       left join orders o on o.vendor_id = $1 and date_trunc('day', o.created_at) = d.day
       group by d.day order by d.day`,
      [vid]
    );

    const topListings = await query<any>(
      `select l.id, l.title, l.kind, l.views, l.price, l.quantity, l.unit,
              coalesce(sum(oi.qty),0)::int as units_sold,
              coalesce(sum(oi.line_total),0)::float as revenue
       from listings l
       left join order_items oi on oi.listing_id = l.id
       left join orders o on o.id = oi.order_id and o.status <> 'cancelled'
       where l.vendor_id = $1 and l.status <> 'removed'
       group by l.id order by revenue desc, l.views desc limit 8`,
      [vid]
    );

    const byStatus = await query<any>(
      `select status, count(*)::int as count from orders where vendor_id = $1 group by status`,
      [vid]
    );

    const recentOrders = await query<any>(
      `select id, code, status, total, currency, contact_name, city, payment_method, created_at
       from orders where vendor_id = $1 order by created_at desc limit 10`,
      [vid]
    );

    res.json({ stats, salesTrend, topListings, byStatus, recentOrders, vendor: req.vendor });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Public vendor directory                                             */
/* ------------------------------------------------------------------ */
vendorRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();
    const limit = Math.min(Number(req.query.limit) || 24, 60);
    const offset = Number(req.query.offset) || 0;
    const rows = await query<any>(
      `select v.id, v.business_name, v.slug, v.description, v.city, v.country, v.logo_url,
              v.rating_avg, v.rating_count, v.created_at,
              (select count(*) from listings l where l.vendor_id = v.id and l.status='active')::int as listing_count
       from vendors v
       where v.status = 'verified'
         and ($1 = '' or v.business_name ilike '%'||$1||'%' or v.description ilike '%'||$1||'%')
         and ($2 = '' or v.city ilike $2)
       order by v.rating_avg desc, listing_count desc
       limit $3 offset $4`,
      [q, city, limit, offset]
    );
    res.json({ vendors: rows });
  } catch (e) {
    next(e);
  }
});

vendorRouter.get('/:slug', async (req, res, next) => {
  try {
    const vendor = await one<any>(
      `select id, business_name, slug, description, city, country, whatsapp, logo_url,
              rating_avg, rating_count, created_at
       from vendors where slug = $1 and status = 'verified'`,
      [req.params.slug]
    );
    if (!vendor) throw new HttpError(404, 'Store not found');
    const listings = await query(
      `select * from listings where vendor_id = $1 and status = 'active' order by created_at desc`,
      [vendor.id]
    );
    const reviews = await query(
      `select r.rating, r.comment, r.created_at, u.full_name
       from reviews r join users u on u.id = r.buyer_id
       where r.vendor_id = $1 order by r.created_at desc limit 20`,
      [vendor.id]
    );
    res.json({ vendor, listings, reviews });
  } catch (e) {
    next(e);
  }
});

/* Reviews */
vendorRouter.post('/:id/reviews', requireAuth(), async (req, res, next) => {
  try {
    const b = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(600).optional() }).parse(req.body);
    const r = await one(
      `insert into reviews (vendor_id, buyer_id, rating, comment) values ($1,$2,$3,$4)
       on conflict (vendor_id, buyer_id) do update set rating = excluded.rating, comment = excluded.comment
       returning *`,
      [req.params.id, req.user!.id, b.rating, b.comment || null]
    );
    res.status(201).json({ review: r });
  } catch (e) {
    next(e);
  }
});

export { requireVerifiedVendor };
