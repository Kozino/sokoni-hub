import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db';
import { requireAuth, loadVendor, requireVerifiedVendor } from '../auth';
import { HttpError, audit, slugify, screenProhibited } from '../utils';

export const listingRouter = Router();

/* ------------------------------------------------------------------ */
/* Public browse / search                                              */
/* ------------------------------------------------------------------ */
listingRouter.get('/', async (req, res, next) => {
  try {
    const q        = String(req.query.q || '').trim();
    const kind     = String(req.query.kind || '').trim();      // product | service
    const category = String(req.query.category || '').trim();  // slug
    const city     = String(req.query.city || '').trim();
    const min      = req.query.min ? Number(req.query.min) : null;
    const max      = req.query.max ? Number(req.query.max) : null;
    const sort     = String(req.query.sort || 'newest');
    const limit    = Math.min(Number(req.query.limit) || 24, 60);
    const offset   = Number(req.query.offset) || 0;

    const order =
      sort === 'price_asc'  ? 'l.price asc'
      : sort === 'price_desc' ? 'l.price desc'
      : sort === 'popular'    ? 'l.views desc'
      : 'l.created_at desc';

    const sql = `
      select l.*, c.name as category_name, c.slug as category_slug,
             v.business_name, v.slug as vendor_slug, v.city as vendor_city,
             v.country as vendor_country, v.rating_avg, v.whatsapp
      from listings l
      join vendors v on v.id = l.vendor_id
      join categories c on c.id = l.category_id
      where l.status = 'active' and v.status = 'verified' and c.is_banned = false
        and ($1 = '' or l.title ilike '%'||$1||'%' or l.description ilike '%'||$1||'%' or v.business_name ilike '%'||$1||'%')
        and ($2 = '' or l.kind::text = $2)
        and ($3 = '' or c.slug = $3)
        and ($4 = '' or v.city ilike $4)
        and ($5::numeric is null or l.price >= $5)
        and ($6::numeric is null or l.price <= $6)
      order by ${order}
      limit $7 offset $8`;
    const rows = await query<any>(sql, [q, kind, category, city, min, max, limit, offset]);

    const [{ count }] = await query<any>(
      `select count(*)::int as count
       from listings l join vendors v on v.id = l.vendor_id join categories c on c.id = l.category_id
       where l.status='active' and v.status='verified' and c.is_banned=false
         and ($1 = '' or l.title ilike '%'||$1||'%' or l.description ilike '%'||$1||'%' or v.business_name ilike '%'||$1||'%')
         and ($2 = '' or l.kind::text = $2)
         and ($3 = '' or c.slug = $3)
         and ($4 = '' or v.city ilike $4)
         and ($5::numeric is null or l.price >= $5)
         and ($6::numeric is null or l.price <= $6)`,
      [q, kind, category, city, min, max]
    );
    res.json({ listings: rows, total: count, limit, offset });
  } catch (e) {
    next(e);
  }
});

listingRouter.get('/cities', async (_req, res, next) => {
  try {
    const rows = await query(
      `select distinct v.city from vendors v where v.status='verified' and v.city is not null order by 1`
    );
    res.json({ cities: rows.map((r: any) => r.city) });
  } catch (e) { next(e); }
});

listingRouter.get('/:id', async (req, res, next) => {
  try {
    const l = await one<any>(
      `select l.*, c.name as category_name, c.slug as category_slug,
              v.business_name, v.slug as vendor_slug, v.whatsapp, v.city as vendor_city,
              v.country as vendor_country, v.rating_avg, v.rating_count, v.logo_url as vendor_logo
       from listings l join vendors v on v.id = l.vendor_id join categories c on c.id = l.category_id
       where l.id = $1 and l.status = 'active' and v.status = 'verified'`,
      [req.params.id]
    );
    if (!l) throw new HttpError(404, 'Listing not found');
    await query('update listings set views = views + 1 where id = $1', [l.id]);
    const related = await query(
      `select l.id, l.title, l.price, l.currency, l.images, l.kind
       from listings l where l.category_id = $1 and l.id <> $2 and l.status='active' limit 6`,
      [l.category_id, l.id]
    );
    res.json({ listing: l, related });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Vendor CRUD                                                         */
/* ------------------------------------------------------------------ */
const listingSchema = z.object({
  category_id: z.string().uuid(),
  kind: z.enum(['product', 'service']),
  title: z.string().min(3).max(140),
  description: z.string().max(4000).optional(),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  quantity: z.number().int().nonnegative().optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
  weight_kg: z.number().nonnegative().optional().nullable(),
  volume_l: z.number().nonnegative().optional().nullable(),
  duration_mins: z.number().int().positive().optional().nullable(),
  service_area: z.string().max(200).optional().nullable(),
  price_type: z.enum(['fixed', 'from', 'hourly', 'per_kg']).optional(),
  images: z.array(z.string().url()).max(6).optional(),
  status: z.enum(['draft', 'active', 'paused']).optional(),
});

listingRouter.get('/mine/all', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const rows = await query(
      `select l.*, c.name as category_name from listings l join categories c on c.id = l.category_id
       where l.vendor_id = $1 and l.status <> 'removed' order by l.created_at desc`,
      [req.vendor!.id]
    );
    res.json({ listings: rows });
  } catch (e) { next(e); }
});

listingRouter.post('/', requireAuth('vendor'), loadVendor, requireVerifiedVendor, async (req, res, next) => {
  try {
    const b = listingSchema.parse(req.body);
    const cat = await one<any>('select * from categories where id = $1', [b.category_id]);
    if (!cat) throw new HttpError(400, 'Invalid category');
    if (cat.is_banned) throw new HttpError(422, 'Cosmetics and medicine may not be listed on this platform.');
    if (cat.kind !== b.kind) throw new HttpError(400, `Category "${cat.name}" is for ${cat.kind}s`);

    const bad = await screenProhibited(b.title, b.description);
    if (bad) throw new HttpError(422, `Listing rejected: prohibited item detected ("${bad}"). Cosmetics and medicine are not allowed.`);

    if (b.kind === 'product' && (b.quantity === undefined || b.quantity === null))
      throw new HttpError(400, 'Quantity is required for products');

    let slug = slugify(b.title);
    if (await one('select id from listings where vendor_id=$1 and slug=$2', [req.vendor!.id, slug]))
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const l = await one<any>(
      `insert into listings (vendor_id, category_id, kind, title, slug, description, price, currency,
         quantity, unit, weight_kg, volume_l, duration_mins, service_area, price_type, images, status)
       values ($1,$2,$3::listing_kind,$4,$5,$6,$7,coalesce($8,'USD'),$9,$10,$11,$12,$13,$14,coalesce($15,'fixed'),
               coalesce($16,'[]')::jsonb, coalesce($17::listing_status,'active'))
       returning *`,
      [req.vendor!.id, b.category_id, b.kind, b.title.trim(), slug, b.description || null, b.price,
       b.currency ?? null, b.kind === 'product' ? b.quantity ?? 0 : null, b.unit ?? null,
       b.weight_kg ?? null, b.volume_l ?? null, b.kind === 'service' ? b.duration_mins ?? null : null,
       b.service_area ?? null, b.price_type ?? null, JSON.stringify(b.images ?? []), b.status ?? null]
    );
    await audit(req.user!.id, 'listing.create', 'listing', l.id, { title: l.title });
    res.status(201).json({ listing: l });
  } catch (e) {
    next(e);
  }
});

listingRouter.patch('/:id', requireAuth('vendor'), loadVendor, requireVerifiedVendor, async (req, res, next) => {
  try {
    const b = listingSchema.partial().parse(req.body);
    const owned = await one('select id from listings where id=$1 and vendor_id=$2', [req.params.id, req.vendor!.id]);
    if (!owned) throw new HttpError(404, 'Listing not found');
    const bad = await screenProhibited(b.title, b.description);
    if (bad) throw new HttpError(422, `Prohibited item detected ("${bad}").`);
    if (b.category_id) {
      const cat = await one<any>('select * from categories where id=$1', [b.category_id]);
      if (!cat || cat.is_banned) throw new HttpError(422, 'Invalid or prohibited category');
    }
    const l = await one<any>(
      `update listings set
        category_id = coalesce($3, category_id), title = coalesce($4, title),
        description = coalesce($5, description), price = coalesce($6, price),
        currency = coalesce($7, currency), quantity = coalesce($8, quantity),
        unit = coalesce($9, unit), weight_kg = coalesce($10, weight_kg),
        volume_l = coalesce($11, volume_l), duration_mins = coalesce($12, duration_mins),
        service_area = coalesce($13, service_area), price_type = coalesce($14, price_type),
        images = coalesce($15::jsonb, images), status = coalesce($16::listing_status, status)
       where id = $1 and vendor_id = $2 returning *`,
      [req.params.id, req.vendor!.id, b.category_id ?? null, b.title ?? null, b.description ?? null,
       b.price ?? null, b.currency ?? null, b.quantity ?? null, b.unit ?? null, b.weight_kg ?? null,
       b.volume_l ?? null, b.duration_mins ?? null, b.service_area ?? null, b.price_type ?? null,
       b.images ? JSON.stringify(b.images) : null, b.status ?? null]
    );
    await audit(req.user!.id, 'listing.update', 'listing', l.id);
    res.json({ listing: l });
  } catch (e) {
    next(e);
  }
});

listingRouter.patch('/:id/stock', requireAuth('vendor'), loadVendor, requireVerifiedVendor, async (req, res, next) => {
  try {
    const b = z.object({ quantity: z.number().int().nonnegative() }).parse(req.body);
    const l = await one('update listings set quantity=$3 where id=$1 and vendor_id=$2 returning *',
      [req.params.id, req.vendor!.id, b.quantity]);
    if (!l) throw new HttpError(404, 'Listing not found');
    res.json({ listing: l });
  } catch (e) { next(e); }
});

listingRouter.delete('/:id', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const l = await one(`update listings set status='removed' where id=$1 and vendor_id=$2 returning id`,
      [req.params.id, req.vendor!.id]);
    if (!l) throw new HttpError(404, 'Listing not found');
    await audit(req.user!.id, 'listing.delete', 'listing', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
