import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../db';
import { requireAuth } from '../auth';

export const driverRouter = Router();

// Driver Auth / Profile
driverRouter.get('/me', requireAuth('driver'), async (req, res, next) => {
  try {
    const driver = await one(`select * from drivers where user_id = $1`, [req.user!.id]);
    res.json({ driver, user: req.user });
  } catch (e) { next(e); }
});

// Update Status (Online/Offline) and Location
const LocationSchema = z.object({
  is_online: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

driverRouter.post('/status', requireAuth('driver'), async (req, res, next) => {
  try {
    const { is_online, lat, lng } = LocationSchema.parse(req.body);
    await query(
      `update drivers 
       set is_online = $1, current_lat = coalesce($2, current_lat), current_lng = coalesce($3, current_lng), last_ping_at = now()
       where user_id = $4`,
      [is_online, lat, lng, req.user!.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Get Available Orders (Broadcast to online drivers)
driverRouter.get('/available-orders', requireAuth('driver'), async (req, res, next) => {
  try {
    const orders = await query(
      `select o.id, o.code, o.total, o.delivery_fee, o.delivery_address, 
              v.business_name, v.address as pickup_address
       from orders o
       join vendors v on v.id = o.vendor_id
       where o.status = 'dispatched' and o.driver_id is null`
    );
    res.json({ orders });
  } catch (e) { next(e); }
});

// Accept Order
driverRouter.post('/orders/:id/accept', requireAuth('driver'), async (req, res, next) => {
  try {
    const success = await tx(async (c) => {
      const o = (await c.query(`select id, status from orders where id = $1 for update`, [req.params.id])).rows[0];
      if (!o || o.status !== 'dispatched') throw new Error('Order no longer available');
      
      await c.query(
        `update orders set driver_id = $1, status = 'dispatched_to_driver' where id = $2`,
        [req.user!.id, req.params.id]
      );
      return true;
    });
    res.json({ success });
  } catch (e) { next(e); }
});

// Update Order Location (Live Tracking)
const OrderLocationSchema = z.object({
  lat: z.number(),
  lng: z.number()
});
driverRouter.post('/orders/:id/location', requireAuth('driver'), async (req, res, next) => {
  try {
    const { lat, lng } = OrderLocationSchema.parse(req.body);
    await query(
      `update orders set driver_lat = $1, driver_lng = $2 where id = $3 and driver_id = $4`,
      [lat, lng, req.params.id, req.user!.id]
    );
    
    // Also update driver's global location
    await query(
      `update drivers set current_lat = $1, current_lng = $2, last_ping_at = now() where user_id = $3`,
      [lat, lng, req.user!.id]
    );

    res.json({ success: true });
  } catch (e) { next(e); }
});

// Complete Order (Proof of Delivery)
const ProofSchema = z.object({
  proof_url: z.string().url()
});
driverRouter.post('/orders/:id/complete', requireAuth('driver'), async (req, res, next) => {
  try {
    const { proof_url } = ProofSchema.parse(req.body);
    await query(
      `update orders 
       set status = 'delivered_pending_verification', delivery_proof_url = $1
       where id = $2 and driver_id = $3`,
      [proof_url, req.params.id, req.user!.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});
