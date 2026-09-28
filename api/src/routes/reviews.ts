import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, optionalAuth, loadVendor } from '../auth';
import { HttpError, audit } from '../utils';

export const reviewRouter = Router();

/**
 * Reviews for products, services and stores.
 *
 * A review must be backed by a completed transaction. That rule is implemented
 * once, in `findProof`, and every write path goes through it — an eligibility
 * check that lives in the UI is decoration, because the endpoint is public.
 */

/** How long a buyer may edit their own review. */
const EDIT_WINDOW_DAYS = 30;

/**
 * Finds the transaction that entitles this buyer to review this target, or
 * returns null.
 *
 *   product listing -> a delivered order of theirs containing it
 *   service listing -> a completed booking of theirs for it
 *   store (no listing) -> either of the above with that vendor
 *
 * Returns the vendor too, so the caller never has to trust a vendor_id sent by
 * the client: a buyer could otherwise attach a genuine order to a review aimed
 * at a different store.
 */
async function requiresPurchase(): Promise<boolean> {
  const r = await one<any>(`select reviews_require_purchase from platform_settings where id = true`);
  // Missing settings row means "not configured", and the safe reading of that
  // is the strict one.
  return r?.reviews_require_purchase !== false;
}

async function findProof(buyerId: string, listingId: string | null, vendorId: string | null) {
  const strict = await requiresPurchase();

  if (listingId) {
    const l = await one<any>(`select id, vendor_id, kind, status from listings where id = $1`, [listingId]);
    if (!l) throw new HttpError(404, 'Listing not found');

    if (l.kind === 'service') {
      const b = await one<any>(
        `select id from service_bookings
          where listing_id = $1 and buyer_id = $2 and status = 'completed'
          order by created_at desc limit 1`,
        [listingId, buyerId]
      );
      if (b) return { vendor_id: l.vendor_id, order_id: null, booking_id: b.id, kind: 'service' };
      return strict ? null : { vendor_id: l.vendor_id, order_id: null, booking_id: null, kind: 'service' };
    }

    const o = await one<any>(
      `select o.id from orders o
         join order_items oi on oi.order_id = o.id
        where oi.listing_id = $1 and o.buyer_id = $2 and o.status = 'delivered'
        order by o.created_at desc limit 1`,
      [listingId, buyerId]
    );
    if (o) return { vendor_id: l.vendor_id, order_id: o.id, booking_id: null, kind: 'product' };
    // Policy open: allowed, but with no transaction attached, so the review
    // will read as unverified.
    return strict ? null : { vendor_id: l.vendor_id, order_id: null, booking_id: null, kind: 'product' };
  }

  // Store review: any completed dealing with this vendor qualifies.
  if (!vendorId) throw new HttpError(400, 'A listing or a store is required');
  const v = await one<any>(`select id from vendors where id = $1`, [vendorId]);
  if (!v) throw new HttpError(404, 'Store not found');

  const o = await one<any>(
    `select id from orders where vendor_id = $1 and buyer_id = $2 and status = 'delivered'
      order by created_at desc limit 1`,
    [vendorId, buyerId]
  );
  if (o) return { vendor_id: vendorId, order_id: o.id, booking_id: null, kind: 'store' };

  const b = await one<any>(
    `select id from service_bookings where vendor_id = $1 and buyer_id = $2 and status = 'completed'
      order by created_at desc limit 1`,
    [vendorId, buyerId]
  );
  if (b) return { vendor_id: vendorId, order_id: null, booking_id: b.id, kind: 'store' };
  return strict ? null : { vendor_id: vendorId, order_id: null, booking_id: null, kind: 'store' };
}

/** A vendor rating their own shop is the first thing anyone tries. */
async function assertNotSelf(userId: string, vendorId: string) {
  const own = await one<any>(`select id from vendors where id = $1 and user_id = $2`, [vendorId, userId]);
  if (own) throw new HttpError(403, 'You cannot review your own store');
}

/* ------------------------------------------------------------------ public */

/**
 * GET /reviews?listing_id= | ?vendor_id=
 *
 * Returns the page of reviews plus the summary the detail page needs: average,
 * count and the 1-5 distribution. The distribution comes from the same query as
 * the rows so the bars can never disagree with the list beneath them.
 */
reviewRouter.get('/', optionalAuth, async (req, res, next) => {
  try {
    const p = z.object({
      listing_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      /** 'store' restricts a vendor read to store-level reviews only. */
      scope: z.enum(['all', 'store']).default('all'),
      sort: z.enum(['recent', 'helpful', 'high', 'low']).default('recent'),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);

    if (!p.listing_id && !p.vendor_id)
      throw new HttpError(400, 'listing_id or vendor_id is required');

    const where: string[] = [`status = 'published'`];
    const args: any[] = [];
    if (p.listing_id) { args.push(p.listing_id); where.push(`listing_id = $${args.length}`); }
    else {
      args.push(p.vendor_id); where.push(`vendor_id = $${args.length}`);
      if (p.scope === 'store') where.push(`listing_id is null`);
    }
    const base = where.join(' and ');

    // Summary over the whole target, before the star filter — a buyer filtering
    // to 1-star must still see the true overall average.
    const summary = await one<any>(
      `select count(*)::int as count,
              coalesce(round(avg(rating)::numeric, 2), 0) as average,
              count(*) filter (where rating = 5)::int as r5,
              count(*) filter (where rating = 4)::int as r4,
              count(*) filter (where rating = 3)::int as r3,
              count(*) filter (where rating = 2)::int as r2,
              count(*) filter (where rating = 1)::int as r1,
              count(*) filter (where verified)::int    as verified_count
         from review_public where ${base}`,
      args
    );

    const filtered = [...where];
    const fargs = [...args];
    if (p.rating) { fargs.push(p.rating); filtered.push(`rating = $${fargs.length}`); }

    const order = p.sort === 'helpful' ? 'helpful_count desc, created_at desc'
      : p.sort === 'high' ? 'rating desc, created_at desc'
      : p.sort === 'low' ? 'rating asc, created_at desc'
      : 'created_at desc';

    fargs.push(p.limit, p.offset);
    const rows = await query<any>(
      `select id, listing_id, rating, title, comment, helpful_count, created_at, edited_at,
              vendor_reply, vendor_replied_at, verified, buyer_name,
              listing_title, listing_slug, listing_kind,
              ${req.user ? `exists (select 1 from review_votes rv
                              where rv.review_id = review_public.id
                                and rv.user_id = '${req.user.id}')` : 'false'} as voted,
              ${req.user ? `buyer_id = '${req.user.id}'` : 'false'} as mine
         from review_public
        where ${filtered.join(' and ')}
        order by ${order}
        limit $${fargs.length - 1} offset $${fargs.length}`,
      fargs
    );

    res.json({
      reviews: rows,
      summary: {
        count: Number(summary?.count ?? 0),
        average: Number(summary?.average ?? 0),
        verified_count: Number(summary?.verified_count ?? 0),
        distribution: {
          5: Number(summary?.r5 ?? 0), 4: Number(summary?.r4 ?? 0), 3: Number(summary?.r3 ?? 0),
          2: Number(summary?.r2 ?? 0), 1: Number(summary?.r1 ?? 0),
        },
      },
    });
  } catch (e) { next(e); }
});

/**
 * GET /reviews/eligibility?listing_id= | ?vendor_id=
 *
 * Lets the page show "Write a review", "You already reviewed this", or an
 * explanation of why not — rather than letting the buyer type six hundred
 * characters and only then discover they are not allowed to post it.
 */
reviewRouter.get('/eligibility', requireAuth(), async (req, res, next) => {
  try {
    const p = z.object({
      listing_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
    }).parse(req.query);
    if (!p.listing_id && !p.vendor_id)
      throw new HttpError(400, 'listing_id or vendor_id is required');

    const existing = await one<any>(
      p.listing_id
        ? `select id, rating, title, comment, created_at from reviews
            where listing_id = $1 and buyer_id = $2`
        : `select id, rating, title, comment, created_at from reviews
            where vendor_id = $1 and buyer_id = $2 and listing_id is null`,
      [p.listing_id ?? p.vendor_id, req.user!.id]
    );
    if (existing) {
      const age = (Date.now() - new Date(existing.created_at).getTime()) / 86400_000;
      return res.json({
        can_review: false, reason: 'already_reviewed',
        existing: { ...existing, editable: age <= EDIT_WINDOW_DAYS },
      });
    }

    const vendorId = p.vendor_id ?? (await one<any>(
      `select vendor_id from listings where id = $1`, [p.listing_id]))?.vendor_id;
    if (vendorId) {
      const own = await one<any>(
        `select id from vendors where id = $1 and user_id = $2`, [vendorId, req.user!.id]);
      if (own) return res.json({ can_review: false, reason: 'own_store' });
    }

    const proof = await findProof(req.user!.id, p.listing_id ?? null, p.vendor_id ?? null);
    res.json(proof
      ? {
          can_review: true,
          basis: proof.booking_id ? 'booking' : proof.order_id ? 'order' : 'open',
          verified: !!(proof.order_id || proof.booking_id),
        }
      : { can_review: false, reason: 'no_purchase' });
  } catch (e) { next(e); }
});

/** POST /reviews — write one. */
reviewRouter.post('/', requireAuth(), async (req, res, next) => {
  try {
    const b = z.object({
      listing_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      rating: z.number().int().min(1).max(5),
      title: z.string().trim().max(120).optional(),
      comment: z.string().trim().max(2000).optional(),
    }).parse(req.body);

    if (!b.listing_id && !b.vendor_id)
      throw new HttpError(400, 'listing_id or vendor_id is required');

    const proof = await findProof(req.user!.id, b.listing_id ?? null, b.vendor_id ?? null);
    if (!proof)
      throw new HttpError(403, b.listing_id
        ? 'You can review this once your order has been delivered, or your booking completed.'
        : 'You can review this store once you have completed an order or a booking with them.');

    // vendor_id comes from the proof, never from the request body.
    await assertNotSelf(req.user!.id, proof.vendor_id);

    const row = await one<any>(
      `insert into reviews (vendor_id, listing_id, buyer_id, rating, title, comment, order_id, booking_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id`,
      [proof.vendor_id, b.listing_id ?? null, req.user!.id, b.rating,
       b.title ?? null, b.comment ?? null, proof.order_id, proof.booking_id]
    );

    const review = await one(`select * from review_public where id = $1`, [row.id]);
    res.status(201).json({ review });
  } catch (e) { next(e); }
});

/** PATCH /reviews/:id — the author edits, within the window. */
reviewRouter.patch('/:id', requireAuth(), async (req, res, next) => {
  try {
    const b = z.object({
      rating: z.number().int().min(1).max(5).optional(),
      title: z.string().trim().max(120).nullable().optional(),
      comment: z.string().trim().max(2000).nullable().optional(),
    }).parse(req.body);

    const cur = await one<any>(`select * from reviews where id = $1`, [req.params.id]);
    if (!cur) throw new HttpError(404, 'Review not found');
    if (cur.buyer_id !== req.user!.id) throw new HttpError(403, 'That is not your review');

    const age = (Date.now() - new Date(cur.created_at).getTime()) / 86400_000;
    if (age > EDIT_WINDOW_DAYS)
      throw new HttpError(400, `Reviews can only be edited within ${EDIT_WINDOW_DAYS} days.`);

    const sets: string[] = ['edited_at = now()'];
    const args: any[] = [req.params.id];
    for (const k of ['rating', 'title', 'comment'] as const) {
      if (b[k] !== undefined) { args.push(b[k]); sets.push(`${k} = $${args.length}`); }
    }
    if (sets.length === 1) throw new HttpError(400, 'Nothing to update');

    await query(`update reviews set ${sets.join(', ')} where id = $1`, args);
    const review = await one(`select * from review_public where id = $1`, [req.params.id]);
    res.json({ review });
  } catch (e) { next(e); }
});

/** DELETE /reviews/:id — the author withdraws it. */
reviewRouter.delete('/:id', requireAuth(), async (req, res, next) => {
  try {
    const cur = await one<any>(`select buyer_id from reviews where id = $1`, [req.params.id]);
    if (!cur) throw new HttpError(404, 'Review not found');
    if (cur.buyer_id !== req.user!.id && req.user!.role !== 'admin')
      throw new HttpError(403, 'That is not your review');
    await query(`delete from reviews where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/**
 * POST /reviews/:id/helpful — toggle a helpful vote.
 *
 * Idempotent per user by the primary key; pressing again withdraws it. A buyer
 * cannot vote for their own review, which would otherwise be free promotion to
 * the top of the "most helpful" sort.
 */
reviewRouter.post('/:id/helpful', requireAuth(), async (req, res, next) => {
  try {
    const r = await one<any>(`select buyer_id from reviews where id = $1 and status = 'published'`,
      [req.params.id]);
    if (!r) throw new HttpError(404, 'Review not found');
    if (r.buyer_id === req.user!.id) throw new HttpError(400, 'You cannot vote for your own review');

    const voted = await tx(async (c) => {
      const del = await c.query(
        `delete from review_votes where review_id = $1 and user_id = $2 returning review_id`,
        [req.params.id, req.user!.id]);
      if (del.rows.length) return false;
      await c.query(`insert into review_votes (review_id, user_id) values ($1,$2)`,
        [req.params.id, req.user!.id]);
      return true;
    });

    const row = await one<any>(`select helpful_count from reviews where id = $1`, [req.params.id]);
    res.json({ voted, helpful_count: Number(row?.helpful_count ?? 0) });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ vendor */

/** GET /reviews/vendor/mine — everything written about this vendor. */
reviewRouter.get('/vendor/mine', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const p = z.object({
      unanswered: z.coerce.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);

    const rows = await query<any>(
      `select id, listing_id, listing_title, listing_kind, rating, title, comment,
              created_at, verified, buyer_name, vendor_reply, vendor_replied_at, status
         from review_public
        where vendor_id = $1 and status = 'published'
          ${p.unanswered ? 'and vendor_reply is null' : ''}
        order by created_at desc limit $2`,
      [req.vendor!.id, p.limit]
    );
    const s = await one<any>(
      `select count(*)::int as total,
              count(*) filter (where vendor_reply is null)::int as unanswered,
              count(*) filter (where rating <= 2)::int          as negative,
              coalesce(round(avg(rating)::numeric, 2), 0)       as average
         from review_public where vendor_id = $1 and status = 'published'`,
      [req.vendor!.id]
    );
    res.json({ reviews: rows, summary: s });
  } catch (e) { next(e); }
});

/** POST /reviews/:id/reply — the vendor's right of response. */
reviewRouter.post('/:id/reply', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const b = z.object({ reply: z.string().trim().min(2).max(1000) }).parse(req.body);
    const row = await one<any>(
      `update reviews set vendor_reply = $3, vendor_replied_at = now()
        where id = $1 and vendor_id = $2 returning id`,
      [req.params.id, req.vendor!.id, b.reply]
    );
    if (!row) throw new HttpError(404, 'Review not found for your store');
    const review = await one(`select * from review_public where id = $1`, [req.params.id]);
    res.json({ review });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- admin */

/** GET /reviews/admin — moderation queue, hidden rows included. */
reviewRouter.get('/admin', requireAuth('admin'), async (req, res, next) => {
  try {
    const p = z.object({
      status: z.enum(['all', 'published', 'hidden']).default('all'),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      q: z.string().trim().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(req.query);

    const where: string[] = ['1=1'];
    const args: any[] = [];
    if (p.status !== 'all') { args.push(p.status); where.push(`status = $${args.length}`); }
    if (p.rating) { args.push(p.rating); where.push(`rating = $${args.length}`); }
    if (p.q) { args.push(`%${p.q}%`); where.push(`(comment ilike $${args.length} or title ilike $${args.length} or business_name ilike $${args.length})`); }
    args.push(p.limit);

    const rows = await query<any>(
      `select id, vendor_id, listing_id, rating, title, comment, status, verified,
              buyer_name, business_name, listing_title, created_at, vendor_reply, helpful_count
         from review_public where ${where.join(' and ')}
        order by created_at desc limit $${args.length}`,
      args
    );
    res.json({ reviews: rows });
  } catch (e) { next(e); }
});

/**
 * POST /reviews/:id/hide  and  /unhide
 *
 * Hiding removes a review from the site and from both averages, but keeps the
 * row and records who did it and why. Deleting would leave no answer to "why
 * did this vendor's rating jump".
 */
reviewRouter.post('/:id/hide', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const row = await one<any>(
      `update reviews set status = 'hidden', hidden_reason = $3, hidden_by = $2, hidden_at = now()
        where id = $1 and status = 'published' returning vendor_id`,
      [req.params.id, req.user!.id, b.reason]
    );
    if (!row) throw new HttpError(404, 'Review not found, or already hidden');
    await audit(req.user!.id, 'review.hide', 'review', req.params.id, { reason: b.reason });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

reviewRouter.post('/:id/unhide', requireAuth('admin'), async (req, res, next) => {
  try {
    const row = await one<any>(
      `update reviews set status = 'published', hidden_reason = null, hidden_by = null, hidden_at = null
        where id = $1 and status = 'hidden' returning vendor_id`,
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'Review not found, or not hidden');
    await audit(req.user!.id, 'review.unhide', 'review', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
