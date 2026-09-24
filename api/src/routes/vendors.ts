import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db';
import { requireAuth, loadVendor, requireVerifiedVendor } from '../auth';
import { HttpError, audit, slugify, screenProhibited, normalizePhone } from '../utils';
import { distanceKmSql } from '../delivery';

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
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
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
      `insert into vendors (user_id, business_name, slug, description, whatsapp, country, city, address, logo_url, id_document_url, lat, lng, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending') returning *`,
      [req.user!.id, b.business_name.trim(), slug, b.description || null, normalizePhone(b.whatsapp),
       b.country, b.city, b.address || null, b.logo_url || null, b.id_document_url || null,
       b.lat ?? null, b.lng ?? null]
    );
    // Every vendor gets a settings row immediately so joins never miss.
    await query(`insert into vendor_delivery_settings (vendor_id) values ($1) on conflict do nothing`, [vendor.id]);
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
         lat           = coalesce($10, lat),
         lng           = coalesce($11, lng),
         status = case when status = 'rejected' then 'pending'::vendor_status else status end,
         rejection_reason = case when status = 'rejected' then null else rejection_reason end
       where id = $1 returning *`,
      [req.vendor!.id, b.business_name ?? null, b.description ?? null,
       b.whatsapp ? normalizePhone(b.whatsapp) : null, b.country ?? null, b.city ?? null,
       b.address ?? null, b.logo_url ?? null, b.id_document_url ?? null,
       b.lat ?? null, b.lng ?? null]
    );
    await audit(req.user!.id, 'vendor.update', 'vendor', vendor.id);
    res.json({ vendor });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Delivery settings — the vendor owns their own fee                   */
/* ------------------------------------------------------------------ */
const deliverySchema = z.object({
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  delivery_fee: z.number().min(0).max(100000),
  free_delivery_over: z.number().min(0).max(1000000).nullable().optional(),
  delivery_radius_km: z.number().positive().max(500).nullable().optional(),
  pickup_address: z.string().max(300).nullable().optional(),
  delivery_notes: z.string().max(500).nullable().optional(),
}).refine((v) => v.offers_pickup || v.offers_delivery, {
  message: 'Enable at least one of collection or delivery.',
  path: ['offers_pickup'],
});

vendorRouter.get('/me/delivery', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    let s = await one('select * from vendor_delivery_settings where vendor_id = $1', [req.vendor!.id]);
    if (!s) s = await one(
      'insert into vendor_delivery_settings (vendor_id) values ($1) returning *', [req.vendor!.id]);
    res.json({ delivery: s });
  } catch (e) { next(e); }
});

vendorRouter.put('/me/delivery', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const b = deliverySchema.parse(req.body);
    const s = await one(
      `insert into vendor_delivery_settings
         (vendor_id, offers_pickup, offers_delivery, delivery_fee, free_delivery_over,
          delivery_radius_km, pickup_address, delivery_notes, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (vendor_id) do update set
         offers_pickup = excluded.offers_pickup,
         offers_delivery = excluded.offers_delivery,
         delivery_fee = excluded.delivery_fee,
         free_delivery_over = excluded.free_delivery_over,
         delivery_radius_km = excluded.delivery_radius_km,
         pickup_address = excluded.pickup_address,
         delivery_notes = excluded.delivery_notes,
         updated_at = now()
       returning *`,
      [req.vendor!.id, b.offers_pickup, b.offers_delivery, b.delivery_fee,
       b.free_delivery_over ?? null, b.delivery_radius_km ?? null,
       b.pickup_address || null, b.delivery_notes || null]
    );
    await audit(req.user!.id, 'vendor.delivery', 'vendor', req.vendor!.id);
    res.json({ delivery: s });
  } catch (e) { next(e); }
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
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
    const hasGeo = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
    // Optional hard filter, e.g. ?within=25 for "only stores within 25km".
    const within = req.query.within ? Number(req.query.within) : null;

    const dist = hasGeo ? distanceKmSql('$5', '$6') : 'null';

    /* Ordering intent:
       - with coordinates: nearest first, but vendors WITHOUT coordinates still
         appear (sorted after those with), so nobody is hidden. The buyer always
         sees the full directory — proximity only changes the order.
       - without coordinates: fall back to a city-name match boost, then rating.
       The query is wrapped so ORDER BY can use the distance_km alias inside an
       expression; Postgres only permits a bare alias in ORDER BY, not
       `(distance_km is null)`. */
    const order = hasGeo
      ? `(distance_km is null) asc, distance_km asc, rating_avg desc`
      : `($2 <> '' and city ilike $2) desc, rating_avg desc, listing_count desc`;

    const params: any[] = [q, city, limit, offset];
    if (hasGeo) params.push(lat, lng);

    const rows = await query<any>(
      `select * from (
         select v.id, v.business_name, v.slug, v.description, v.city, v.country, v.logo_url,
                v.rating_avg, v.rating_count, v.created_at, v.lat, v.lng,
                (select count(*) from listings l where l.vendor_id = v.id and l.status='active')::int as listing_count,
                coalesce(s.offers_delivery, false) as offers_delivery,
                coalesce(s.offers_pickup, true)    as offers_pickup,
                s.delivery_fee, s.free_delivery_over,
                ${hasGeo ? `case when v.lat is not null and v.lng is not null
                                 then round((${dist})::numeric, 1) end` : 'null'} as distance_km
         from vendors v
         left join vendor_delivery_settings s on s.vendor_id = v.id
         where v.status = 'verified'
           and ($1 = '' or v.business_name ilike '%'||$1||'%' or v.description ilike '%'||$1||'%')
           and ($2 = '' or v.city ilike $2)
           ${hasGeo && within && Number.isFinite(within)
              ? `and v.lat is not null and v.lng is not null and (${dist}) <= ${Number(within)}` : ''}
       ) d
       order by ${order}
       limit $3 offset $4`,
      params
    );
    res.json({ vendors: rows, near: hasGeo });
  } catch (e) {
    next(e);
  }
});

vendorRouter.get('/:slug', async (req, res, next) => {
  try {
    const vendor = await one<any>(
      `select v.id, v.business_name, v.slug, v.description, v.city, v.country, v.whatsapp,
              v.logo_url, v.rating_avg, v.rating_count, v.created_at, v.lat, v.lng,
              coalesce(s.offers_pickup, true)    as offers_pickup,
              coalesce(s.offers_delivery, false) as offers_delivery,
              coalesce(s.delivery_fee, 0)        as delivery_fee,
              s.free_delivery_over, s.pickup_address, s.delivery_notes
       from vendors v
       left join vendor_delivery_settings s on s.vendor_id = v.id
       where v.slug = $1 and v.status = 'verified'`,
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
