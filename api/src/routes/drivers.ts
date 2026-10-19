import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../db';
import { requireAuth } from '../auth';
import { HttpError } from '../utils';
import { verificationSettings, distanceMetres } from '../deliveryVerification';

export const driverRouter = Router();

const uuid = z.string().uuid();

/** Loads the rider profile and enforces that an admin has approved it. */
async function approvedDriver(userId: string) {
  const d = await one<any>(`select * from drivers where user_id = $1`, [userId]);
  if (!d) throw new HttpError(403, 'No rider profile found for this account.');
  if (d.status === 'suspended') throw new HttpError(403, 'Your rider account is suspended. Contact Sokoni Hub support.');
  if (d.status !== 'approved') throw new HttpError(403, 'Your rider application is still under review.');
  return d;
}

const ACTIVE_STATUSES = ['dispatched_to_driver', 'out_for_delivery', 'driver_arrived'];

const orderSelect = `
  select o.id, o.code, o.status, o.total, o.delivery_fee, o.delivery_address, o.city,
         o.contact_name, o.contact_phone, o.note, o.created_at, o.driver_lat, o.driver_lng,
         o.delivery_proof_url,
         v.business_name, v.address as pickup_address, v.whatsapp as vendor_phone,
         (select coalesce(json_agg(json_build_object('title', i.title, 'qty', i.qty) order by i.title), '[]'::json)
            from order_items i where i.order_id = o.id) as items
  from orders o
  join vendors v on v.id = o.vendor_id`;

// ---------- Profile ----------

driverRouter.get('/me', requireAuth('driver'), async (req, res, next) => {
  try {
    const driver = await one(`select * from drivers where user_id = $1`, [req.user!.id]);
    res.json({ driver, user: req.user });
  } catch (e) { next(e); }
});

const ProfileSchema = z.object({
  vehicle_type: z.enum(['Motorcycle', 'Car', 'Van']).optional(),
  license_plate: z.string().trim().min(2).max(20).optional(),
  bank_name: z.string().trim().min(2).max(100).optional(),
  bank_account_name: z.string().trim().min(2).max(120).optional(),
  bank_iban: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().min(10).max(34))
    .optional(),
});

driverRouter.patch('/me', requireAuth('driver'), async (req, res, next) => {
  try {
    const b = ProfileSchema.parse(req.body);
    const driver = await one(
      `update drivers set
         vehicle_type = coalesce($2, vehicle_type),
         license_plate = coalesce($3, license_plate),
         bank_name = coalesce($4, bank_name),
         bank_account_name = coalesce($5, bank_account_name),
         bank_iban = coalesce($6, bank_iban)
       where user_id = $1
       returning *`,
      [req.user!.id, b.vehicle_type ?? null, b.license_plate ?? null, b.bank_name ?? null, b.bank_account_name ?? null, b.bank_iban ?? null]
    );
    if (!driver) throw new HttpError(404, 'No rider profile found for this account.');
    res.json({ driver });
  } catch (e) { next(e); }
});

// Document keys come from POST /api/uploads?purpose=kyc, which stores private files.
const DocumentsSchema = z.object({
  licence: z.string().startsWith('kyc://').max(300).optional(),
  id_card: z.string().startsWith('kyc://').max(300).optional(),
  vehicle_registration: z.string().startsWith('kyc://').max(300).optional(),
}).refine((v) => Object.keys(v).length > 0, 'Upload at least one document.');

driverRouter.put('/me/documents', requireAuth('driver'), async (req, res, next) => {
  try {
    const b = DocumentsSchema.parse(req.body);
    const driver = await one(
      `update drivers set documents = documents || $2::jsonb where user_id = $1 returning *`,
      [req.user!.id, JSON.stringify(b)]
    );
    if (!driver) throw new HttpError(404, 'No rider profile found for this account.');
    res.json({ driver });
  } catch (e) { next(e); }
});

// ---------- Online status and location ----------

const LocationSchema = z.object({
  is_online: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

driverRouter.post('/status', requireAuth('driver'), async (req, res, next) => {
  try {
    const { is_online, lat, lng } = LocationSchema.parse(req.body);
    await approvedDriver(req.user!.id);
    await query(
      `update drivers
       set is_online = $1, current_lat = coalesce($2, current_lat), current_lng = coalesce($3, current_lng), last_ping_at = now()
       where user_id = $4`,
      [is_online, lat, lng, req.user!.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ---------- Orders ----------

driverRouter.get('/available-orders', requireAuth('driver'), async (req, res, next) => {
  try {
    await approvedDriver(req.user!.id);
    const orders = await query(
      `${orderSelect}
       where o.status = 'dispatched' and o.driver_id is null
       order by o.created_at asc
       limit 25`
    );
    res.json({ orders });
  } catch (e) { next(e); }
});

// The rider's current delivery, if any.
driverRouter.get('/active-order', requireAuth('driver'), async (req, res, next) => {
  try {
    const order = await one(
      `${orderSelect}
       where o.driver_id = $1 and o.status = any($2::order_status[])
       order by o.updated_at desc limit 1`,
      [req.user!.id, ACTIVE_STATUSES]
    );
    res.json({ order });
  } catch (e) { next(e); }
});

driverRouter.get('/orders/:id', requireAuth('driver'), async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);
    const order = await one(`${orderSelect} where o.id = $1 and o.driver_id = $2`, [id, req.user!.id]);
    if (!order) throw new HttpError(404, 'Delivery not found.');
    res.json({ order });
  } catch (e) { next(e); }
});

driverRouter.post('/orders/:id/accept', requireAuth('driver'), async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);
    await approvedDriver(req.user!.id);
    const order = await tx(async (c) => {
      const busy = (await c.query(
        `select id from orders where driver_id = $1 and status = any($2::order_status[]) limit 1`,
        [req.user!.id, ACTIVE_STATUSES]
      )).rows[0];
      if (busy) throw new HttpError(409, 'You already have an active delivery. Finish it first.');

      const o = (await c.query(`select id, status, driver_id from orders where id = $1 for update`, [id])).rows[0];
      if (!o) throw new HttpError(404, 'Delivery not found.');
      if (o.status !== 'dispatched' || o.driver_id) throw new HttpError(409, 'This delivery was already taken.');

      await c.query(
        `update orders set driver_id = $1, status = 'dispatched_to_driver', updated_at = now() where id = $2`,
        [req.user!.id, id]
      );
      return true;
    });
    const full = await one(`${orderSelect} where o.id = $1`, [id]);
    res.json({ success: order, order: full });
  } catch (e) { next(e); }
});

// Pickup confirmed: the rider now has the goods and is heading to the buyer.
driverRouter.post('/orders/:id/pickup', requireAuth('driver'), async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);
    const row = await one(
      `update orders set status = 'out_for_delivery', updated_at = now()
       where id = $1 and driver_id = $2 and status = 'dispatched_to_driver'
       returning id`,
      [id, req.user!.id]
    );
    if (!row) throw new HttpError(409, 'This delivery is not waiting for pickup.');
    res.json({ success: true });
  } catch (e) { next(e); }
});

const OrderLocationSchema = z.object({ lat: z.number(), lng: z.number() });

driverRouter.post('/orders/:id/location', requireAuth('driver'), async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);
    const { lat, lng } = OrderLocationSchema.parse(req.body);
    await query(
      `update orders set driver_lat = $1, driver_lng = $2 where id = $3 and driver_id = $4`,
      [lat, lng, id, req.user!.id]
    );
    await query(
      `update drivers set current_lat = $1, current_lng = $2, last_ping_at = now() where user_id = $3`,
      [lat, lng, req.user!.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Proof of delivery: photo uploaded to /api/uploads first, then its URL is sent here.
const ProofSchema = z.object({
  proof_url: z.string().url().max(2000),
  // The rider's GPS position at the moment they complete the drop-off.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/**
 * Rider marks the drop-off complete. If the buyer confirmed a pin, the rider
 * must be within the geofence of that pin. The order then waits for the buyer
 * (or the auto-complete window) before it becomes 'delivered' and settles.
 */
driverRouter.post('/orders/:id/complete', requireAuth('driver'), async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);
    const b = ProofSchema.parse(req.body);
    const order = await one<any>(
      `select id, status, delivery_lat, delivery_lng from orders
        where id = $1 and driver_id = $2 and status = any($3::order_status[])`,
      [id, req.user!.id, ['out_for_delivery', 'driver_arrived']]
    );
    if (!order) throw new HttpError(409, 'This delivery cannot be completed right now.');

    let dropDistance: number | null = null;
    if (order.delivery_lat != null && order.delivery_lng != null) {
      if (b.lat === undefined || b.lng === undefined) {
        throw new HttpError(422, 'Turn on location so we can confirm you are at the delivery point, then try again.');
      }
      const { geofence_metres } = await verificationSettings();
      dropDistance = distanceMetres(
        { lat: b.lat, lng: b.lng },
        { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) }
      );
      if (dropDistance > geofence_metres) {
        throw new HttpError(
          422,
          `You are about ${Math.round(dropDistance)} m from the delivery point. Move within ${geofence_metres} m of the pin to complete.`
        );
      }
    }

    const { auto_complete_hours } = await verificationSettings();
    const row = await one<any>(
      `update orders
          set status = 'delivered_pending_verification',
              delivery_proof_url = $1,
              drop_lat = $2, drop_lng = $3, drop_distance_m = $4,
              verify_by = now() + make_interval(hours => $5::int),
              updated_at = now()
        where id = $6
        returning verify_by`,
      [b.proof_url, b.lat ?? null, b.lng ?? null, dropDistance, auto_complete_hours, id]
    );
    if (!row) throw new HttpError(409, 'This delivery cannot be completed right now.');
    res.json({ success: true, verify_by: row.verify_by, awaiting_buyer: true });
  } catch (e) { next(e); }
});

// ---------- Earnings ----------

// Earnings are the delivery fees on orders this rider completed.
// Payout rules are not built yet, so the app labels this as "earned".
driverRouter.get('/earnings', requireAuth('driver'), async (req, res, next) => {
  try {
    const summary = await one(
      `select coalesce(sum(delivery_fee), 0)::float as total,
              count(*)::int as trips,
              coalesce(sum(delivery_fee) filter (where (created_at at time zone 'Asia/Qatar')::date = (now() at time zone 'Asia/Qatar')::date), 0)::float as today,
              count(*) filter (where (created_at at time zone 'Asia/Qatar')::date = (now() at time zone 'Asia/Qatar')::date)::int as trips_today
       from orders
       where driver_id = $1 and status in ('delivered_pending_verification', 'delivered')`,
      [req.user!.id]
    );
    const recent = await query(
      `select o.id, o.code, o.status, o.delivery_fee::float as delivery_fee, o.created_at, v.business_name
       from orders o join vendors v on v.id = o.vendor_id
       where o.driver_id = $1 and o.status in ('delivered_pending_verification', 'delivered')
       order by o.updated_at desc limit 30`,
      [req.user!.id]
    );
    res.json({ summary, recent });
  } catch (e) { next(e); }
});
