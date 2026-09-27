/**
 * Service bookings.
 *
 * Services are not ordered, they are booked. This router never touches the
 * orders table, never decrements stock and never produces a chargeable total,
 * which is precisely why service work is not commissioned: there is no order
 * for computeStatement() to pick up.
 *
 * The flow is: buyer states a preferred time -> row is written -> the UI opens
 * WhatsApp carrying the booking code. The negotiation happens on WhatsApp; the
 * platform keeps the record so admin and vendor both see the demand.
 */

import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db';
import { requireAuth, loadVendor } from '../auth';
import { HttpError, audit, randomCode, waLink, screenProhibited } from '../utils';
import { DEFAULT_CURRENCY } from '../delivery';

export const bookingRouter = Router();

const createSchema = z.object({
  listing_id: z.string().uuid(),
  contact_name: z.string().min(2).max(120),
  contact_phone: z.string().min(7).max(20),
  contact_email: z.string().email().max(160).optional().or(z.literal('')),
  // ISO timestamp. Optional: a buyer may legitimately have no preference and
  // just want the vendor to call.
  preferred_at: z.string().datetime().optional().or(z.literal('')),
  preferred_note: z.string().max(500).optional(),
});

/** Statuses a vendor may set, and the timestamp each one stamps. */
const VENDOR_STATUSES = ['contacted', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;

const updateSchema = z.object({
  status: z.enum(VENDOR_STATUSES).optional(),
  // Set once the vendor and buyer have actually agreed a time.
  scheduled_at: z.string().datetime().nullable().optional(),
  vendor_note: z.string().max(500).nullable().optional(),
  cancel_reason: z.string().max(300).nullable().optional(),
});

const SELECT = `
  select b.*,
         l.title as listing_title, l.slug as listing_slug, l.kind as listing_kind,
         l.duration_mins,
         v.business_name, v.whatsapp as vendor_whatsapp, v.city as vendor_city
    from service_bookings b
    join listings l on l.id = b.listing_id
    join vendors  v on v.id = b.vendor_id
`;

/* ============================== create ============================== */

/**
 * POST /bookings — request a booking.
 *
 * Open to signed-out visitors, exactly like checkout, because forcing an
 * account before a hair appointment loses the booking. buyer_id is attached
 * when a token happens to be present.
 */
bookingRouter.post('/', async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body);

    const bad = await screenProhibited(b.preferred_note, b.contact_name);
    if (bad) throw new HttpError(422, `Your note contains a prohibited term: "${bad}"`);

    const l = await one<any>(
      `select l.id, l.kind, l.status, l.price, l.price_type, l.currency, l.title,
              v.id as vendor_id, v.status as vendor_status, v.whatsapp, v.business_name
         from listings l join vendors v on v.id = l.vendor_id
        where l.id = $1`,
      [b.listing_id]
    );
    if (!l) throw new HttpError(404, 'That listing no longer exists');

    // The whole point of this router. Products go through the cart.
    if (l.kind !== 'service')
      throw new HttpError(422, 'That listing is a product. Add it to your cart instead.');
    // listing_status is ('draft','active','paused','removed') — 'active' is the
    // published state, matching the check in orders.ts.
    if (l.status !== 'active')
      throw new HttpError(409, 'That service is not currently available for booking');
    if (l.vendor_status !== 'verified')
      throw new HttpError(409, 'That provider is not currently accepting bookings');

    // Reject a preferred time in the past — almost always a timezone or
    // date-picker mistake, and it reaches the vendor as noise.
    if (b.preferred_at && new Date(b.preferred_at).getTime() < Date.now() - 60_000)
      throw new HttpError(422, 'Choose a time in the future');

    const code = randomCode('BKG');
    const row = await one<any>(
      `insert into service_bookings
         (code, listing_id, vendor_id, buyer_id, contact_name, contact_phone, contact_email,
          preferred_at, preferred_note, quoted_price, quoted_price_type, currency)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning *`,
      [
        code, l.id, l.vendor_id, req.user?.id ?? null,
        b.contact_name, b.contact_phone, b.contact_email || null,
        b.preferred_at || null, b.preferred_note || null,
        l.price, l.price_type, l.currency || DEFAULT_CURRENCY,
      ]
    );

    // Hand-off text. The code is the thread between the WhatsApp conversation
    // and the record, so the vendor can find it in their dashboard.
    const when = b.preferred_at
      ? new Date(b.preferred_at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
      : 'as soon as you are free';
    const text =
      `Hello ${l.business_name}, I'd like to book "${l.title}".\n` +
      `Preferred time: ${when}\n` +
      (b.preferred_note ? `Note: ${b.preferred_note}\n` : '') +
      `Booking reference: ${code}`;

    res.status(201).json({
      booking: row,
      whatsapp: l.whatsapp ? waLink(l.whatsapp, text) : null,
    });
  } catch (e) { next(e); }
});

/* ============================== buyer ============================== */

/** GET /bookings/mine — a signed-in buyer's own bookings. */
bookingRouter.get('/mine', requireAuth('buyer', 'vendor', 'admin'), async (req, res, next) => {
  try {
    const rows = await query(`${SELECT} where b.buyer_id = $1 order by b.created_at desc limit 100`, [req.user!.id]);
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

/**
 * GET /bookings/track?code=&phone= — public look-up, mirroring order tracking.
 * Phone is required so a guessed code alone reveals nothing.
 */
bookingRouter.get('/track', async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const phone = String(req.query.phone || '').replace(/[^\d]/g, '');
    if (!code || !phone) throw new HttpError(400, 'Booking code and phone number are both required');
    const row = await one<any>(
      `${SELECT} where upper(b.code) = $1 and regexp_replace(b.contact_phone, '[^0-9]', '', 'g') like '%' || $2`,
      [code, phone]
    );
    if (!row) throw new HttpError(404, 'No booking found with that code and phone number');
    res.json({ booking: row });
  } catch (e) { next(e); }
});

/** POST /bookings/:id/cancel — buyer pulls out. Only before it is completed. */
bookingRouter.post('/:id/cancel', requireAuth('buyer', 'vendor', 'admin'), async (req, res, next) => {
  try {
    const reason = z.object({ reason: z.string().max(300).optional() }).parse(req.body).reason;
    const bk = await one<any>('select * from service_bookings where id = $1', [req.params.id]);
    if (!bk) throw new HttpError(404, 'Booking not found');
    if (bk.buyer_id !== req.user!.id && req.user!.role !== 'admin')
      throw new HttpError(403, 'That is not your booking');
    if (bk.status === 'completed') throw new HttpError(409, 'That booking is already completed');

    const row = await one<any>(
      `update service_bookings set status = 'cancelled', cancel_reason = $2, updated_at = now()
        where id = $1 returning *`,
      [bk.id, reason ?? 'Cancelled by buyer']
    );
    await audit(req.user!.id, 'booking.cancel', 'service_booking', bk.id, { reason });
    res.json({ booking: row });
  } catch (e) { next(e); }
});

/* ============================== vendor ============================== */

/** GET /bookings/vendor — the provider's inbox. */
bookingRouter.get('/vendor', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const rows = await query(
      `${SELECT} where b.vendor_id = $1 and ($2 = '' or b.status = $2::booking_status)
        order by b.created_at desc limit 200`,
      [req.vendor!.id, status]
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

/** GET /bookings/vendor/counts — for the dashboard badge. */
bookingRouter.get('/vendor/counts', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const r = await one<any>(
      `select count(*) filter (where status = 'new')       as new,
              count(*) filter (where status = 'confirmed') as confirmed,
              count(*)                                     as total
         from service_bookings where vendor_id = $1`,
      [req.vendor!.id]
    );
    res.json({ new: Number(r.new), confirmed: Number(r.confirmed), total: Number(r.total) });
  } catch (e) { next(e); }
});

/**
 * PATCH /bookings/:id — vendor works the booking.
 *
 * Status transitions stamp their own timestamps so response time and
 * completion rate are measurable without a separate event table.
 */
bookingRouter.patch('/:id', requireAuth('vendor', 'admin'), loadVendor, async (req, res, next) => {
  try {
    const b = updateSchema.parse(req.body);
    const bk = await one<any>('select * from service_bookings where id = $1', [req.params.id]);
    if (!bk) throw new HttpError(404, 'Booking not found');
    if (req.user!.role !== 'admin' && bk.vendor_id !== req.vendor!.id)
      throw new HttpError(403, 'That booking belongs to another provider');

    if (b.scheduled_at && new Date(b.scheduled_at).getTime() < Date.now() - 60_000)
      throw new HttpError(422, 'A scheduled time cannot be in the past');
    if (b.status === 'confirmed' && !(b.scheduled_at || bk.scheduled_at))
      throw new HttpError(422, 'Set the agreed date and time before confirming');

    const row = await one<any>(
      `update service_bookings set
         status        = coalesce($2::booking_status, status),
         scheduled_at  = case when $3::text is null then scheduled_at
                              when $3::text = ''    then null
                              else $3::timestamptz end,
         vendor_note   = coalesce($4::text, vendor_note),
         cancel_reason = coalesce($5::text, cancel_reason),
         contacted_at  = case when $2::text in ('contacted','confirmed') and contacted_at is null
                              then now() else contacted_at end,
         completed_at  = case when $2::text = 'completed' then now() else completed_at end,
         updated_at    = now()
       where id = $1 returning *`,
      [
        bk.id, b.status ?? null,
        b.scheduled_at === undefined ? null : (b.scheduled_at ?? ''),
        b.vendor_note ?? null, b.cancel_reason ?? null,
      ]
    );
    await audit(req.user!.id, 'booking.update', 'service_booking', bk.id, { status: b.status });
    res.json({ booking: row });
  } catch (e) { next(e); }
});

/** POST /bookings/:id/seen — stamps first_viewed_at, for response-time stats. */
bookingRouter.post('/:id/seen', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    await query(
      `update service_bookings set first_viewed_at = now()
        where id = $1 and vendor_id = $2 and first_viewed_at is null`,
      [req.params.id, req.vendor!.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ============================== admin ============================== */

/** GET /bookings/admin — everything, with the filters admin actually needs. */
bookingRouter.get('/admin', requireAuth('admin'), async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const vendor = String(req.query.vendor_id || '');
    const rows = await query(
      `${SELECT}
        where ($1 = '' or b.status = $1::booking_status)
          and ($2 = '' or b.vendor_id = $2::uuid)
        order by b.created_at desc limit 500`,
      [status, vendor]
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

/**
 * GET /bookings/admin/stats — demand per vendor.
 *
 * This is the evidence base for charging service vendors a fee: how many
 * bookings the platform sent them, and how fast they responded.
 */
bookingRouter.get('/admin/stats', requireAuth('admin'), async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const rows = await query(
      `select v.id as vendor_id, v.business_name, v.city,
              count(b.*)                                          as bookings,
              count(b.*) filter (where b.status = 'completed')     as completed,
              count(b.*) filter (where b.status = 'cancelled')     as cancelled,
              count(b.*) filter (where b.status = 'no_show')       as no_shows,
              count(b.*) filter (where b.first_viewed_at is null
                                   and b.status = 'new')           as unseen,
              round(avg(extract(epoch from (b.first_viewed_at - b.created_at)) / 3600)::numeric, 1)
                                                                   as avg_response_hours
         from vendors v
         join service_bookings b on b.vendor_id = v.id
        where b.created_at >= now() - ($1 || ' days')::interval
        group by v.id, v.business_name, v.city
        order by bookings desc`,
      [String(days)]
    );
    res.json({ days, vendors: rows });
  } catch (e) { next(e); }
});
