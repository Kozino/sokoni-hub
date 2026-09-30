import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, loadVendor } from '../auth';
import { HttpError, audit, validateUuidParam } from '../utils';

export const promotionRouter = Router();
promotionRouter.param('id', validateUuidParam);

/**
 * Paid placement — VIP and Featured stores.
 *
 * Public reads come from the `active_promotions` view, which evaluates the paid
 * window against now(). Nothing here depends on a scheduled job: a placement
 * ends because the clock passed it, not because a cron fired.
 *
 * ROTATION. Slots are finite. When more vendors have paid than there are slots,
 * ordering by anything stable (created_at, name, rating) means the same vendors
 * win every single render and the rest paid for nothing. So the order is keyed
 * on a hash of (vendor id + current time bucket):
 *
 *   - within a bucket the order is identical, so a buyer refreshing the page
 *     does not watch the row reshuffle, and the response stays cacheable;
 *   - across buckets it permutes, so impressions spread across everyone who
 *     paid for the tier.
 *
 * The bucket length is a setting (default 15 minutes) rather than a constant,
 * because the right value depends on traffic: busy sites want it short.
 */
async function settings() {
  return await one<any>(
    `select vip_slots, featured_slots, promotion_rotation_minutes, currency
       from platform_settings where id = true`
  );
}

/* ------------------------------------------------------------------ public */

/**
 * GET /promotions — the landing page carousel.
 *
 * Returns both tiers in one call so the page makes a single request, and
 * always returns the tier so the client cannot render a promoted store
 * without disclosing that it is promoted.
 */
promotionRouter.get('/', async (_req, res, next) => {
  try {
    // One query, not one per tier. Two round-trips for a single carousel is
    // wasteful, and issuing them concurrently only moves the cost onto the
    // connection pool. row_number() ranks inside each tier by the rotation
    // hash and the slot limits are applied from platform_settings in the same
    // statement, so the cap can never disagree with the setting.
    const rows = await query<any>(
      `with cfg as (select vip_slots, featured_slots, promotion_rotation_minutes
                      from platform_settings where id = true),
            ranked as (
              select a.id, a.vendor_id, a.tier, a.business_name, a.slug, a.logo_url,
                     a.city, a.country, a.rating_avg, a.rating_count, a.listing_count,
                     row_number() over (
                       partition by a.tier
                       order by md5(a.vendor_id::text ||
                                floor(extract(epoch from now())
                                      / (greatest(c.promotion_rotation_minutes, 1) * 60))::text)
                     ) as rn
                from active_promotions a cross join cfg c)
       select r.* from ranked r cross join cfg c
        where (r.tier = 'vip'      and r.rn <= c.vip_slots)
           or (r.tier = 'featured' and r.rn <= c.featured_slots)
        order by r.tier desc, r.rn`
    );

    res.json({
      vip: rows.filter((r) => r.tier === 'vip'),
      featured: rows.filter((r) => r.tier === 'featured'),
    });
  } catch (e) { next(e); }
});

/**
 * POST /promotions/track — impression and click counters.
 *
 * Deliberately a separate call from the GET above, rather than incrementing
 * while serving. A public GET that writes on every page view cannot be cached
 * and turns a read path into a write path; measurement is also the client's
 * business, since only the browser knows whether the carousel was actually
 * rendered. This is how ad impressions have always been counted.
 *
 * Unauthenticated by necessity — buyers are not logged in. That makes the
 * counters inflatable by anyone with curl, so they are treated as a relative
 * signal for the vendor's own report, never as a billing input.
 */
promotionRouter.post('/track', async (req, res, next) => {
  try {
    const b = z.object({
      event: z.enum(['impression', 'click']),
      ids: z.array(z.string().uuid()).min(1).max(50),
    }).parse(req.body);

    // One statement for the whole batch: a carousel of 8 must not be 8 writes.
    // Still filtered through active_promotions so a stale or revoked id cannot
    // keep accruing numbers after the placement ended.
    const col = b.event === 'click' ? 'clicks' : 'impressions';
    await query(
      `update vendor_promotions
          set ${col} = ${col} + 1
        where id = any($1::uuid[])
          and id in (select id from active_promotions)`,
      [b.ids]
    );

    // 204: the browser has nothing to do with the result, and this fires on
    // every landing page view.
    res.status(204).end();
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ vendor */

/** GET /promotions/mine — what the vendor is paying for, and what it bought. */
promotionRouter.get('/mine', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const rows = await query<any>(
      `select id, tier, starts_at, ends_at, price_amount, currency, paid_at,
              impressions, clicks, state, days_remaining, revoke_reason
         from promotion_admin
        where vendor_id = $1
        order by starts_at desc`,
      [req.vendor!.id]
    );
    res.json({ promotions: rows });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- admin */

const adminOnly = requireAuth('admin');

/** GET /promotions/admin — every placement, with its derived state. */
promotionRouter.get('/admin', adminOnly, async (req, res, next) => {
  try {
    const p = z.object({
      state: z.enum(['all', 'live', 'scheduled', 'expired', 'revoked', 'suspended']).default('all'),
      tier: z.enum(['all', 'vip', 'featured']).default('all'),
      q: z.string().trim().max(120).optional(),
    }).parse(req.query);

    const where: string[] = ['1=1'];
    const args: any[] = [];
    if (p.state !== 'all') { args.push(p.state); where.push(`state = $${args.length}`); }
    if (p.tier !== 'all') { args.push(p.tier); where.push(`tier = $${args.length}`); }
    if (p.q) { args.push(`%${p.q}%`); where.push(`business_name ilike $${args.length}`); }

    const rows = await query<any>(
      `select * from promotion_admin
        where ${where.join(' and ')}
        order by case state when 'live' then 0 when 'scheduled' then 1 else 2 end,
                 ends_at desc`,
      args
    );
    const s = await settings();
    res.json({ promotions: rows, slots: { vip: s?.vip_slots, featured: s?.featured_slots } });
  } catch (e) { next(e); }
});

/**
 * GET /promotions/admin/availability — how sold out a tier is for a window.
 *
 * Selling a tenth "featured" slot when eight exist is not fraud, it is
 * rotation, but the admin has to know they are doing it before they quote a
 * price. This answers that before the sale, not after the complaint.
 */
promotionRouter.get('/admin/availability', adminOnly, async (req, res, next) => {
  try {
    const p = z.object({
      tier: z.enum(['vip', 'featured']),
      starts_at: z.string(),
      ends_at: z.string(),
    }).parse(req.query);

    const s = await settings();
    const slots = Number(p.tier === 'vip' ? s?.vip_slots : s?.featured_slots) || 0;

    // Overlap test for two half-open intervals: a starts before b ends, and
    // b starts before a ends.
    const row = await one<any>(
      `select count(*)::int as overlapping
         from vendor_promotions p
         join vendors v on v.id = p.vendor_id
        where p.tier = $1
          and p.revoked_at is null
          and v.status = 'verified'
          and p.starts_at < $3::timestamptz
          and p.ends_at   > $2::timestamptz`,
      [p.tier, p.starts_at, p.ends_at]
    );

    const taken = Number(row?.overlapping ?? 0);
    res.json({
      tier: p.tier,
      slots,
      taken,
      free: Math.max(0, slots - taken),
      // Truthful about what oversubscription actually means for the buyer.
      oversubscribed: taken >= slots,
      share_of_time: taken >= slots && taken > 0
        ? Math.round((slots / taken) * 100) / 100
        : 1,
    });
  } catch (e) { next(e); }
});

const grantSchema = z.object({
  vendor_id: z.string().uuid(),
  tier: z.enum(['vip', 'featured']),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  /** Convenience: sell "30 days" without the admin doing date arithmetic. */
  days: z.number().int().min(1).max(730).optional(),
  price_amount: z.number().nonnegative().default(0),
  currency: z.string().length(3).optional(),
  paid: z.boolean().default(false),
  payment_reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
}).refine((v) => v.ends_at !== undefined || v.days !== undefined, {
  message: 'Provide either ends_at or days',
});

/** POST /promotions/admin — sell a placement. */
promotionRouter.post('/admin', adminOnly, async (req, res, next) => {
  try {
    const b = grantSchema.parse(req.body);
    const s = await settings();

    const created = await tx(async (c) => {
      const v = (await c.query(
        `select id, business_name, status from vendors where id = $1`, [b.vendor_id])).rows[0];
      if (!v) throw new HttpError(404, 'Vendor not found');
      // Selling placement to an unverified store would put it on the landing
      // page the moment it is approved, with no further review.
      if (v.status !== 'verified')
        throw new HttpError(400, `${v.business_name} is ${v.status}. Only verified stores can be promoted.`);

      const startsAt = b.starts_at ? new Date(b.starts_at) : new Date();
      if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Invalid start date');

      const endsAt = b.ends_at
        ? new Date(b.ends_at)
        : new Date(startsAt.getTime() + b.days! * 86400_000);
      if (Number.isNaN(endsAt.getTime())) throw new HttpError(400, 'Invalid end date');
      if (endsAt <= startsAt) throw new HttpError(400, 'The end date must be after the start date');

      // Stacking two live placements of the same tier on one vendor is almost
      // always a double-entry, and it would let one vendor hold two slots.
      const clash = (await c.query(
        `select id from vendor_promotions
          where vendor_id = $1 and tier = $2 and revoked_at is null
            and starts_at < $4::timestamptz and ends_at > $3::timestamptz
          limit 1`,
        [b.vendor_id, b.tier, startsAt.toISOString(), endsAt.toISOString()])).rows[0];
      if (clash)
        throw new HttpError(409,
          `${v.business_name} already has a ${b.tier} placement overlapping those dates. Extend it instead of adding a second.`);

      const row = (await c.query(
        `insert into vendor_promotions
           (vendor_id, tier, starts_at, ends_at, price_amount, currency,
            paid_at, payment_reference, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [b.vendor_id, b.tier, startsAt.toISOString(), endsAt.toISOString(),
         b.price_amount, b.currency ?? s?.currency ?? 'QAR',
         b.paid ? new Date().toISOString() : null,
         b.payment_reference ?? null, b.note ?? null, req.user!.id])).rows[0];
      return row;
    });

    await audit(req.user!, 'promotion.grant', 'vendor', b.vendor_id, {
      tier: b.tier, ends_at: created.ends_at, price: b.price_amount,
    });

    const full = await one(`select * from promotion_admin where id = $1`, [created.id]);
    res.status(201).json({ promotion: full });
  } catch (e) { next(e); }
});

/**
 * PATCH /promotions/admin/:id — extend, reprice, or record payment.
 *
 * The window can be moved but the vendor cannot: repointing a paid placement at
 * a different store would erase who actually bought it.
 */
promotionRouter.patch('/admin/:id', adminOnly, async (req, res, next) => {
  try {
    const b = z.object({
      ends_at: z.string().optional(),
      extend_days: z.number().int().min(1).max(730).optional(),
      price_amount: z.number().nonnegative().optional(),
      paid: z.boolean().optional(),
      payment_reference: z.string().trim().max(120).nullable().optional(),
      note: z.string().trim().max(500).nullable().optional(),
    }).parse(req.body);

    const cur = await one<any>(`select * from vendor_promotions where id = $1`, [req.params.id]);
    if (!cur) throw new HttpError(404, 'Promotion not found');
    if (cur.revoked_at) throw new HttpError(400, 'This placement was revoked. Create a new one instead.');

    const sets: string[] = [];
    const args: any[] = [req.params.id];
    const push = (frag: string, val: any) => { args.push(val); sets.push(`${frag} = $${args.length}`); };

    if (b.extend_days !== undefined) {
      // Extend from whichever is later: a lapsed placement restarts from today
      // rather than silently granting days that are already in the past.
      const from = new Date(cur.ends_at) > new Date() ? new Date(cur.ends_at) : new Date();
      push('ends_at', new Date(from.getTime() + b.extend_days * 86400_000).toISOString());
    } else if (b.ends_at !== undefined) {
      const d = new Date(b.ends_at);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid end date');
      if (d <= new Date(cur.starts_at)) throw new HttpError(400, 'The end date must be after the start date');
      push('ends_at', d.toISOString());
    }
    if (b.price_amount !== undefined) push('price_amount', b.price_amount);
    if (b.paid !== undefined) push('paid_at', b.paid ? new Date().toISOString() : null);
    if (b.payment_reference !== undefined) push('payment_reference', b.payment_reference);
    if (b.note !== undefined) push('note', b.note);

    if (!sets.length) throw new HttpError(400, 'Nothing to update');

    await query(`update vendor_promotions set ${sets.join(', ')} where id = $1`, args);
    await audit(req.user!, 'promotion.update', 'vendor', cur.vendor_id, b);

    const full = await one(`select * from promotion_admin where id = $1`, [req.params.id]);
    res.json({ promotion: full });
  } catch (e) { next(e); }
});

/**
 * POST /promotions/admin/:id/revoke — stop a placement early.
 *
 * A reason is mandatory. Pulling paid placement without a recorded reason is
 * exactly the thing that becomes an argument two months later.
 */
promotionRouter.post('/admin/:id/revoke', adminOnly, async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);

    const row = await one<any>(
      `update vendor_promotions
          set revoked_at = now(), revoked_by = $2, revoke_reason = $3
        where id = $1 and revoked_at is null
        returning vendor_id, tier, ends_at`,
      [req.params.id, req.user!.id, b.reason]
    );
    if (!row) throw new HttpError(404, 'Promotion not found, or already revoked');

    await audit(req.user!, 'promotion.revoke', 'vendor', row.vendor_id, {
      tier: row.tier, reason: b.reason,
    });

    const full = await one(`select * from promotion_admin where id = $1`, [req.params.id]);
    res.json({ promotion: full });
  } catch (e) { next(e); }
});

/** GET /promotions/admin/revenue — what placement actually earned. */
promotionRouter.get('/admin/revenue', adminOnly, async (req, res, next) => {
  try {
    const p = z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }).parse(req.query);
    const rows = await query<any>(
      `select to_char(date_trunc('month', starts_at), 'YYYY-MM') as month,
              tier,
              count(*)::int                                      as placements,
              sum(price_amount)                                  as billed,
              sum(price_amount) filter (where paid_at is not null) as collected,
              sum(impressions)::bigint                           as impressions,
              sum(clicks)::bigint                                as clicks
         from vendor_promotions
        where starts_at > now() - ($1 || ' months')::interval
          and revoked_at is null
        group by 1, 2
        order by 1 desc, 2`,
      [p.months]
    );
    const totals = await one<any>(
      `select coalesce(sum(price_amount), 0)                                   as billed,
              coalesce(sum(price_amount) filter (where paid_at is not null), 0) as collected,
              coalesce(sum(price_amount) filter (where paid_at is null), 0)     as outstanding
         from vendor_promotions
        where revoked_at is null and starts_at > now() - ($1 || ' months')::interval`,
      [p.months]
    );
    res.json({ months: rows, totals });
  } catch (e) { next(e); }
});
