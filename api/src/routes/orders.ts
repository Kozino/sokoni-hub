import { notifyBuyerOfOrder, notifyOnlineDrivers, notifyVendorOfOrder, buyerStatusMessage } from '../push';
import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, optionalAuth, loadVendor } from '../auth';
import { HttpError, audit, randomCode, validateUuidParam } from '../utils';
import { sendMailAsync } from '../mailer';
import { receiptEmailHtml } from '../templates';
import { orderCustomerEmail, orderVendorEmail } from '../transactionalEmail';
import { config } from '../config';
import {
  quoteVendorOrder, cartTotals, round2, DEFAULT_CURRENCY,
  type FulfilmentMode, type VendorDeliverySettings,
} from '../delivery';
import { attributionSchema, resolveOrderSource } from '../lib/attribution';
import { verificationSettings, distanceMetres } from '../deliveryVerification';
import { restoreOrderStock } from '../orderRecovery';
import { releaseVendorFunds } from '../walletSettlement';

export const orderRouter = Router();
orderRouter.param('id', validateUuidParam);

const cartSchema = z.array(
  z.object({
    listing_id: z.string().uuid(),
    qty: z.number().int().min(1).max(10000),
    option: z.string().trim().min(1).max(100).optional(),
  })
).min(1).max(100).refine(items=>new Set(items.map(i=>i.listing_id + '|' + (i.option||''))).size===items.length,'Duplicate cart items');

const checkoutSchema = z.object({
  request_id: z.string().uuid(),
  items: cartSchema,
  contact_name: z.string().min(2).max(120),
  contact_phone: z.string().min(7).max(20),
  contact_email: z.string().trim().email().max(200).optional().or(z.literal('')),
  delivery_address: z.string().min(5).max(300),
  // Pin the customer confirmed on the map at checkout. Both or neither.
  delivery_lat: z.number().min(-90).max(90).optional(),
  delivery_lng: z.number().min(-180).max(180).optional(),
  city: z.string().min(2).max(60),
  country: z.string().min(2).max(60),
  payment_method: z.enum(['cash_on_delivery']).default('cash_on_delivery'),
  fulfilment_mode: z.enum(['pickup', 'delivery']).default('delivery'),
  note: z.string().max(500).optional(),
  attribution: attributionSchema,
});

/**
 * Load cart rows with their vendor and that vendor's delivery settings, and
 * validate availability. Shared by /quote and /checkout so both see exactly
 * the same prices and the same fee rules.
 */
async function loadCart(items: { listing_id: string; qty: number; option?: string }[], c?: PoolClient) {
  const ids = Array.from(new Set(items.map((i) => i.listing_id)));
  const read = async (sql:string,args:any[]) => c ? (await c.query(sql,args)).rows : query<any>(sql,args);
  const rows = await read(
    `select l.*, v.id as vid, v.slug as vendor_slug, v.business_name, v.whatsapp, v.status as vendor_status,
            v.lat as vlat, v.lng as vlng,
            s.offers_pickup, s.offers_delivery, s.delivery_fee as v_delivery_fee,
            s.free_delivery_over, s.delivery_radius_km, s.pickup_address, s.delivery_notes
     from listings l
     join categories cat on cat.id=l.category_id
     join vendors v on v.id = l.vendor_id
     left join vendor_delivery_settings s on s.vendor_id = v.id
     where l.id = any($1::uuid[]) and cat.is_banned=false
     order by l.id ${c ? 'for update of l for share of v,cat' : ''}`,
    [ids]
  );
  if (rows.length !== ids.length) throw new HttpError(400, 'One or more items are no longer available');

  for (const r of rows) {
    // Services are booked through /bookings, not ordered. Rejecting them here
    // is what keeps them out of the orders table, and therefore out of
    // computeStatement() — service work is not commissioned.
    if (r.kind === 'service')
      throw new HttpError(422, `"${r.title}" is a service. Request a booking for it instead of adding it to your cart.`);
    if (r.status !== 'active' || r.vendor_status !== 'verified')
      throw new HttpError(400, `"${r.title}" is no longer available`);
    // Riders navigate to the store's pin and confirm pickup against it. A store
    // without a pin cannot be collected from, so it takes no orders until it sets one.
    if (r.vlat === null || r.vlat === undefined || r.vlng === null || r.vlng === undefined)
      throw new HttpError(422, `${r.business_name} has not set its store location yet, so it cannot take orders. Please try again later.`);
    const want = items.filter((i) => i.listing_id === r.id).reduce((sum, i) => sum + i.qty, 0);
    if (r.quantity !== null && r.quantity < want)
      throw new HttpError(409, `Only ${r.quantity} left of "${r.title}"`);
  }

  const byVendor = new Map<string, any[]>();
  for (const r of rows) {
    const list = byVendor.get(r.vid) ?? [];
    list.push(r);
    byVendor.set(r.vid, list);
  }
  return byVendor;
}

/**
 * Delivery radius (item 6). The store sets a radius in km; a delivery pin beyond it is refused.
 * Returns the message to show the buyer, or null when the pin is in range (or no radius is set).
 */
function outsideDeliveryRadius(r: any, pin: { lat: number; lng: number }): string | null {
  const radiusKm = r.delivery_radius_km === null || r.delivery_radius_km === undefined ? null : Number(r.delivery_radius_km);
  if (radiusKm === null || !Number.isFinite(radiusKm)) return null;
  if (r.vlat === null || r.vlat === undefined || r.vlng === null || r.vlng === undefined) {
    return `${r.business_name} has not set its map location, so delivery is not available. Choose collection instead.`;
  }
  const metres = distanceMetres({ lat: Number(r.vlat), lng: Number(r.vlng) }, pin);
  if (metres > radiusKm * 1000) {
    return `${r.business_name} delivers within ${radiusKm} km. Your delivery point is about ${(metres / 1000).toFixed(1)} km away. Choose collection or a closer address.`;
  }
  return null;
}

const settingsOf = (r: any): VendorDeliverySettings | null =>
  r.offers_pickup === null || r.offers_pickup === undefined
    ? null
    : {
        vendor_id: r.vid,
        offers_pickup: r.offers_pickup,
        offers_delivery: r.offers_delivery,
        delivery_fee: r.v_delivery_fee,
        free_delivery_over: r.free_delivery_over,
        delivery_radius_km: r.delivery_radius_km,
        pickup_address: r.pickup_address,
        delivery_notes: r.delivery_notes,
      };

/**
 * Resolve the price for a cart line from the listing as stored in the database.
 * Strict on purpose: a listing with options must be ordered with a valid option,
 * and an option that does not exist is an error, never a silent fall-back to the
 * base price.
 */
function resolveOption(r: any, option?: string): { unitPrice: number; optionName?: string } {
  let opts: any[] = [];
  try {
    const raw = typeof r.options === 'string' ? JSON.parse(r.options) : r.options;
    opts = Array.isArray(raw) ? raw : [];
  } catch { opts = []; }

  if (opts.length === 0) {
    if (option) throw new HttpError(400, `"${r.title}" no longer has the option "${option}". Please remove it from your cart and add it again.`);
    return { unitPrice: Number(r.price) };
  }
  if (!option) throw new HttpError(400, `Please choose a size/option for "${r.title}".`);

  const o = opts.find((x: any) => x?.name === option);
  if (!o) throw new HttpError(400, `The option "${option}" is no longer available for "${r.title}". Please remove it from your cart and add it again.`);

  // Same rule as the listing page: an option without its own price uses the base price.
  const unitPrice = Number(o.price || r.price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new HttpError(400, `"${r.title}" (${option}) has no valid price.`);
  return { unitPrice, optionName: o.name };
}

/** Price a cart without placing it. Drives the checkout summary. */
function priceCart(byVendor: Map<string, any[]>, items: { listing_id: string; qty: number; option?: string }[], mode: FulfilmentMode) {
  const quotes = [];
  for (const [vendorId, vItems] of byVendor) {

    let subtotal = 0;
    const vendorItems = items.filter(i => vItems.some(v => v.id === i.listing_id));
    const lines = vendorItems.map((i) => {
      const r = vItems.find(v => v.id === i.listing_id)!;
      const { unitPrice, optionName } = resolveOption(r, i.option);
      const title = optionName ? `${r.title} (${optionName})` : r.title;
      const line = round2(unitPrice * i.qty);
      subtotal = round2(subtotal + line);
      return { r: { ...r, price: unitPrice, title }, qty: i.qty, line, option: optionName };
    });

    // Every row here is a product: loadCart() rejects services outright, so the
    // old "all services => force pickup, suppress the fee" special case is gone.
    const q = quoteVendorOrder({
      vendor_id: vendorId,
      vendor_name: vItems[0].business_name,
      subtotal,
      currency: vItems[0].currency || DEFAULT_CURRENCY,
      mode,
      settings: settingsOf(vItems[0]),
    });
    quotes.push({ quote: q, lines, vItems });
  }
  return quotes;
}

/**
 * POST /orders/quote — what the buyer will be charged, before committing.
 * Same code path as checkout, so the figures always agree.
 */
orderRouter.post('/quote', async (req, res, next) => {
  try {
    const b = z.object({
      items: cartSchema,
      fulfilment_mode: z.enum(['pickup', 'delivery']).default('delivery'),
    }).parse(req.body);

    const byVendor = await loadCart(b.items);
    const priced = priceCart(byVendor, b.items, b.fulfilment_mode);
    const quotes = priced.map((p) => p.quote);
    res.json({ vendors: quotes, ...cartTotals(quotes) });
  } catch (e) {
    next(e);
  }
});

/**
 * Checkout. A cart may contain items from several vendors — we split into
 * one order per vendor (standard multi-vendor behaviour) and return them all.
 */
orderRouter.post('/checkout', optionalAuth, async (req, res, next) => {
  try {
    const b = checkoutSchema.parse(req.body);
    if ((b.delivery_lat === undefined) !== (b.delivery_lng === undefined)) {
      throw new HttpError(422, 'Confirm the delivery location on the map before placing your order.');
    }
    const fingerprint=createHash('sha256').update(JSON.stringify({body:b,buyer:req.user?.id??null})).digest('hex');
    const created = await tx(async (c) => {
      await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['checkout:'+b.request_id]);
      const prior=(await c.query('select fingerprint,response from checkout_requests where key=$1',[b.request_id])).rows[0];
      if(prior){if(prior.fingerprint!==fingerprint) throw new HttpError(409,'Checkout key already used for a different request');return prior.response as any[];}
      const byVendor=await loadCart(b.items,c);
      const priced=priceCart(byVendor,b.items,b.fulfilment_mode);
      const deliveryQuotes = priced.filter((p) => p.quote.mode === 'delivery');
      if (deliveryQuotes.length && b.delivery_lat === undefined) {
        throw new HttpError(422, 'Confirm the delivery location on the map before placing your order.');
      }
      if (b.delivery_lat !== undefined && b.delivery_lng !== undefined) {
        for (const { vItems } of deliveryQuotes) {
          const problem = outsideDeliveryRadius(vItems[0], { lat: b.delivery_lat, lng: b.delivery_lng });
          if (problem) throw new HttpError(422, problem);
        }
      }
      // Snapshot the address supplied at checkout. A guest can opt in, while a
      // signed-in buyer falls back to their verified account email.
      const accountEmail = req.user?.id
        ? (await c.query('select email from users where id=$1', [req.user.id])).rows[0]?.email
        : null;
      const contactEmail = b.contact_email || accountEmail || null;
      const out: any[] = [];
      for (const { quote, lines, vItems } of priced) {
        // Short enough to read in a mobile dashboard, while 64 random bits
        // still make a collision extraordinarily unlikely for order volume.
        const code = randomCode('ORD', 8);
        // Which channel actually brought this buyer to this vendor. A shared
        // link/QR only counts for the vendor it names — every other vendor in
        // a multi-vendor cart still gets 'marketplace'.
        const source = resolveOrderSource(b.attribution, vItems[0].vendor_slug);
        // total is written explicitly as subtotal + delivery_fee. A CHECK
        // constraint on the table enforces this, so a regression fails loudly.
        const { rows: [order] } = await c.query(
          `insert into orders (code, buyer_id, vendor_id, payment_method, subtotal, delivery_fee, total, currency,
             contact_name, contact_phone, contact_email, delivery_address, city, country, note, fulfilment_mode, source,
             delivery_lat, delivery_lng)
           values ($1,$2,$3,$4::payment_method,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::fulfilment_mode,$17,$18,$19) returning *`,
          [code, req.user?.id ?? null, quote.vendor_id, b.payment_method,
           quote.subtotal, quote.delivery_fee, quote.total, quote.currency,
           b.contact_name, b.contact_phone, contactEmail,
           b.delivery_address, b.city, b.country, b.note || null, quote.mode, source,
           quote.mode === 'delivery' ? (b.delivery_lat ?? null) : null,
           quote.mode === 'delivery' ? (b.delivery_lng ?? null) : null]
        );
        for (const { r, qty, line } of lines) {
          await c.query(
            // kind is snapshotted like title and unit_price: it decides whether
            // the line is commissionable, and must not change if the vendor
            // later edits or deletes the listing.
            `insert into order_items (order_id, listing_id, title, unit_price, qty, unit, line_total, kind)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [order.id, r.id, r.title, r.price, qty, r.unit, line, r.kind]
          );
          if (r.quantity !== null) {
            // returning: the ledger records the balance that was actually
            // written, not one recomputed afterwards from a re-read that a
            // concurrent sale could already have moved.
            const upd = await c.query(
              'update listings set quantity = quantity - $2 where id = $1 and quantity >= $2 returning quantity',
              [r.id, qty]
            );
            if (!upd.rowCount) throw new HttpError(409,'Stock changed. Please check your cart.');
            const after = Number(upd.rows[0].quantity);
            const moved = after - Number(r.quantity);
            // The row is locked and the conditional decrement must succeed;
            // ledger movement is exactly the quantity reserved by this order.
            if (moved !== 0) {
              await c.query(
                `insert into stock_movements
                   (listing_id, vendor_id, delta, balance_after, reason, order_id, actor_id)
                 values ($1,$2,$3,$4,'sale',$5,$6)`,
                [r.id, quote.vendor_id, moved, after, order.id, req.user?.id ?? null]
              );
            }
          }
        }
        out.push({ ...order,
          // pg returns numeric columns as strings; coerce so the checkout
          // response has the same shape/types as the quote response.
          subtotal: quote.subtotal, delivery_fee: quote.delivery_fee, total: quote.total,
          items: lines.map(({ r, qty, line }) => ({ title: r.title, qty, line_total: line })),
          vendor: { business_name: vItems[0].business_name } });
      }
      await c.query('insert into checkout_requests(key,fingerprint,response) values($1,$2,$3)',[b.request_id,fingerprint,JSON.stringify(out)]);
      return out;
    });

    await audit(req.user ?? null, 'order.create', 'order', created.map((o) => o.code).join(','));
    // Notifications are best-effort and deliberately never delay checkout.
    created.forEach((order) => { void emailOrderCreated(order.id); void pushNewOrder(order.id, order.code); });
    res.status(201).json({ orders: created });
  } catch (e) {
    next(e);
  }
});

/** Public order lookup by code + phone (buyers have no dashboard). */
orderRouter.get('/track', async (req, res, next) => {
  try {
    await finalizeDueOrders().catch(() => 0);
    const code = String(req.query.code || '');
    const phone = String(req.query.phone || '');
    const order = await one<any>(
      `select o.id, o.code, o.vendor_id, o.status, o.payment_method, o.subtotal,
              o.delivery_fee, o.total, o.currency, o.contact_name, o.contact_phone, o.payment_status, o.paid_at,
              o.delivery_address, o.city, o.country, o.note, o.fulfilment_mode,
              o.driver_lat, o.driver_lng, o.delivery_proof_url, o.delivery_lat, o.delivery_lng, o.driver_id,
              o.verify_by, o.disputed_at, o.dispute_reason, o.delivered_at, o.completed_by,
              o.created_at, o.updated_at, v.business_name, v.whatsapp
         from orders o join vendors v on v.id = o.vendor_id
        where o.code = $1 and regexp_replace(o.contact_phone,'\\D','','g') = regexp_replace($2,'\\D','','g')`,
      [code, phone]
    );
    if (!order) throw new HttpError(404, 'No order found with that code and phone number');
    order.items = await query(
      'select id, listing_id, title, unit_price, qty, unit, line_total from order_items where order_id = $1',
      [order.id]
    );
    // Rider details for the buyer. The phone is shared only while the rider is
    // actually on this delivery; it is hidden once the order is finished.
    if (order.driver_id && order.status !== 'cancelled') {
      const rider = await one<any>(
        `select u.full_name as name, u.phone, d.vehicle_type, d.license_plate
           from drivers d join users u on u.id = d.user_id
          where d.user_id = $1`,
        [order.driver_id]
      );
      if (rider) {
        const onTheWay = ['dispatched_to_driver', 'driver_arrived', 'out_for_delivery'].includes(order.status);
        order.driver = { name: rider.name, vehicle_type: rider.vehicle_type, license_plate: rider.license_plate, phone: onTheWay ? rider.phone : null };
      }
    }
    delete order.driver_id;
    res.json({ order });
  } catch (e) { next(e); }
});

/**
 * Completes orders whose buyer confirmation window has passed without a problem
 * report. Atomic, so several server instances can run it safely.
 */
export async function finalizeDueOrders(): Promise<number> {
  const rows = await query<{ id: string }>(
    `update orders set status = 'delivered', delivered_at = now(), completed_by = 'auto', updated_at = now()
      where status = 'delivered_pending_verification' and disputed_at is null and verify_by <= now()
      returning id`
  );
  for (const r of rows) {
    await tx((c) => releaseVendorFunds(c, r.id));
    void emailReceipt(r.id);
  }
  return rows.length;
}

const phoneMatch = (table: string) => `regexp_replace(${table}.contact_phone,'\\D','','g') = regexp_replace($2,'\\D','','g')`;

/** Buyer confirms they received the order. Requires the order code and the checkout phone, like tracking. */
orderRouter.post('/track/confirm', async (req, res, next) => {
  try {
    const b = z.object({ code: z.string().trim().min(3).max(40), phone: z.string().min(7).max(20) }).parse(req.body);
    const row = await one<{ id: string }>(
      `update orders set status = 'delivered', delivered_at = now(), buyer_confirmed_at = now(),
              completed_by = 'buyer', updated_at = now()
        where code = $1 and status = 'delivered_pending_verification' and disputed_at is null
          and ${phoneMatch('orders')}
        returning id`,
      [b.code, b.phone]
    );
    if (row) {
      await tx((c) => releaseVendorFunds(c, row.id));
      void emailReceipt(row.id);
      return res.json({ ok: true, status: 'delivered' });
    }
    const o = await one<{ status: string; disputed_at: string | null }>(
      `select status, disputed_at from orders where code = $1 and ${phoneMatch('orders')}`,
      [b.code, b.phone]
    );
    if (!o) throw new HttpError(404, 'No order found with that code and phone number');
    if (o.disputed_at) throw new HttpError(409, 'A problem is already open for this order. Our team is reviewing it.');
    throw new HttpError(409, 'This order is not waiting for confirmation.');
  } catch (e) { next(e); }
});

/** Buyer reports a problem during the confirmation window. Holds the order out of settlement. */
orderRouter.post('/track/report', async (req, res, next) => {
  try {
    const b = z.object({
      code: z.string().trim().min(3).max(40),
      phone: z.string().min(7).max(20),
      reason: z.string().trim().min(5).max(500),
    }).parse(req.body);
    const row = await one<{ id: string }>(
      `update orders set disputed_at = now(), dispute_reason = $3, updated_at = now()
        where code = $1 and status = 'delivered_pending_verification' and disputed_at is null
          and ${phoneMatch('orders')}
        returning id`,
      [b.code, b.phone, b.reason]
    );
    if (row) return res.json({ ok: true });
    const o = await one<{ status: string; disputed_at: string | null }>(
      `select status, disputed_at from orders where code = $1 and ${phoneMatch('orders')}`,
      [b.code, b.phone]
    );
    if (!o) throw new HttpError(404, 'No order found with that code and phone number');
    if (o.disputed_at) throw new HttpError(409, 'You have already reported a problem with this order.');
    throw new HttpError(409, 'This order can no longer be reported.');
  } catch (e) { next(e); }
});

/**
 * Buyer cancels an order before a rider has accepted it (item 13). Once the store has
 * dispatched it, or a rider has accepted it, the buyer must contact the store.
 * Reserved stock goes back to the listings.
 */
orderRouter.post('/track/cancel', async (req, res, next) => {
  try {
    const b = z.object({ code: z.string().trim().min(3).max(40), phone: z.string().min(7).max(20) }).parse(req.body);
    const orderId = await tx(async (c) => {
      const row = (await c.query(
        `select * from orders where code = $1 and ${phoneMatch('orders')} for update`,
        [b.code, b.phone],
      )).rows[0];
      if (!row) throw new HttpError(404, 'No order found with that code and phone number');
      if (row.status === 'cancelled') throw new HttpError(409, 'This order is already cancelled.');
      if (!['pending', 'confirmed'].includes(row.status) || row.driver_id) {
        throw new HttpError(409, 'This order can no longer be cancelled. Contact the store to cancel it.');
      }
      await restoreOrderStock(c, row, null, 'Order cancelled by buyer');
      await c.query(`update orders set status = 'cancelled', updated_at = now() where id = $1`, [row.id]);
      return row.id as string;
    });
    await audit(null, 'order.cancel_buyer', 'order', orderId, { code: b.code });
    void notifyVendorOfOrder(orderId, { title: 'Order cancelled', body: `Order ${b.code} was cancelled by the buyer.`, data: { orderId } });
    void emailOrderStatus(orderId, 'cancelled');
    res.json({ ok: true, status: 'cancelled' });
  } catch (e) { next(e); }
});

orderRouter.get('/mine', requireAuth(), async (req, res, next) => {
  try {
    const rows = await query(
      `select o.*, v.business_name, v.slug as vendor_slug from orders o
       join vendors v on v.id = o.vendor_id where o.buyer_id = $1 order by o.created_at desc`,
      [req.user!.id]
    );
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

/* ---------------- vendor side ---------------- */
orderRouter.get('/vendor', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const rows = await query<any>(
      `select o.* from orders o where o.vendor_id = $1 and ($2 = '' or o.status::text = $2)
       order by o.created_at desc limit 200`,
      [req.vendor!.id, status]
    );
    for (const o of rows) o.items = await query('select * from order_items where order_id = $1', [o.id]);
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

orderRouter.patch('/vendor/:id/status', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const b = z.object({ status: z.enum(['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled']), reason: z.string().trim().min(5).max(300).optional() }).parse(req.body);
    if(b.status==='cancelled' && !b.reason) throw new HttpError(422,'Tell the buyer why you are cancelling this order.');
    let didChange=false;
    const o=await tx(async c=>{
      const row=(await c.query('select * from orders where id=$1 and vendor_id=$2 for update',[req.params.id,req.vendor!.id])).rows[0];
      if(!row) throw new HttpError(404,'Order not found');
      if(row.status===b.status) return row;
      // A store marking an order delivered starts the buyer confirmation window; it does not settle the order.
      if(row.status==='delivered_pending_verification' && b.status==='delivered') return row;
      // A confirmed order must be dispatched before it can be delivered, except store collection (no rider, no dispatch step).
      const allowed: Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:row.fulfilment_mode==='pickup'?['dispatched','delivered','cancelled']:['dispatched','cancelled'],dispatched:['delivered','cancelled'],delivered:[],cancelled:[]};
      if(!allowed[row.status]?.includes(b.status)) throw new HttpError(409,'This order status change is not allowed.');
      // Once a rider is assigned, only the rider's GPS-checked proof of delivery can complete the order.
      if(b.status==='delivered' && row.driver_id) throw new HttpError(409,'A rider is delivering this order. It completes when the rider submits proof of delivery.');
      if(row.status==='dispatched' && b.status==='cancelled' && row.driver_id) throw new HttpError(409,'A rider has already accepted this order. Ask support to reassign it before cancelling.');
      if(b.status==='cancelled' && !row.stock_restored_at) {
       const items=(await c.query('select listing_id,sum(qty)::int as qty from order_items where order_id=$1 and listing_id is not null group by listing_id order by listing_id',[row.id])).rows;
       for(const item of items) {
        const stock=(await c.query('update listings set quantity=quantity+$2 where id=$1 and quantity is not null returning quantity',[item.listing_id,item.qty])).rows[0];
        if(stock) await c.query(`insert into stock_movements(listing_id,vendor_id,delta,balance_after,reason,order_id,actor_id,note)
         values($1,$2,$3,$4,'return',$5,$6,'Unfulfilled order cancelled')`,[item.listing_id,row.vendor_id,item.qty,stock.quantity,row.id,req.user!.id]);
       }
      }
      didChange=true;
      const target = b.status === 'delivered' ? 'delivered_pending_verification' : b.status;
      const { auto_complete_hours } = await verificationSettings();
      return (await c.query(`update orders set status=$2::order_status,
       verify_by=case when $2='delivered_pending_verification' then now() + make_interval(hours => $3::int) else verify_by end,
       stock_restored_at=case when $2='cancelled' then coalesce(stock_restored_at,now()) else stock_restored_at end
       where id=$1 returning *`,[row.id,target,auto_complete_hours])).rows[0];
    });
    await audit(req.user!, 'order.status', 'order', req.params.id, { status: b.status, ...(b.reason ? { reason: b.reason } : {}) });
    if (didChange) {
      // The receipt is sent when the order is finally delivered (buyer, auto or admin), not here.
      if (b.status !== 'delivered') void emailOrderStatus(o.id, b.status);
      void pushOrderStatus(o.id, o.status);
    }
    res.json({ order: o });
  } catch (e) { next(e); }
});


async function notificationOrder(orderId: string) {
  return one<any>(
    `select o.*, v.business_name, v.user_id as vendor_user_id,
            coalesce(nullif(o.contact_email,''),buyer.email) as customer_email,
            vendor_user.email as vendor_email
       from orders o
       join vendors v on v.id=o.vendor_id
       left join users buyer on buyer.id=o.buyer_id
       join users vendor_user on vendor_user.id=v.user_id
      where o.id=$1`,
    [orderId],
  );
}

async function emailOrderCreated(orderId: string) {
  try {
    const order = await notificationOrder(orderId);
    if (!order) return;
    const track = `${config.appUrl}/track`;
    if (order.customer_email) {
      sendMailAsync({
        to: order.customer_email,
        subject: `Order received — ${order.code}`,
        html: orderCustomerEmail(order, track),
        kind: 'order_confirmation',
        entityId: order.id,
      });
    }
    if (order.vendor_email) {
      sendMailAsync({
        to: order.vendor_email,
        subject: `New order — ${order.code}`,
        html: orderVendorEmail(order, `${config.appUrl}/vendor/orders`),
        kind: 'vendor_order_alert',
        entityId: order.id,
      });
    }
  } catch (error) { console.error('[order email]', (error as Error).message); }
}

async function emailOrderStatus(orderId: string, status: string) {
  try {
    const order = await notificationOrder(orderId);
    if (!order?.customer_email) return;
    sendMailAsync({
      to: order.customer_email,
      subject: `Order ${status.replace(/_/g, ' ')} — ${order.code}`,
      html: orderCustomerEmail({ ...order, status }, `${config.appUrl}/track`),
      kind: 'order_status',
      entityId: order.id,
    });
  } catch (error) { console.error('[order status email]', (error as Error).message); }
}

async function pushNewOrder(orderId: string, code: string) {
  await notifyVendorOfOrder(orderId, { title: 'New order', body: `Order ${code} is waiting for you.`, data: { orderId } });
}

async function pushOrderStatus(orderId: string, status: string) {
  try {
    const order = await one<{ code: string; fulfilment_mode: string }>('select code, fulfilment_mode from orders where id = $1', [orderId]);
    const isCollection = order?.fulfilment_mode === 'pickup';
    const msg = isCollection && status === 'dispatched'
      ? { title: 'Ready to collect', body: `Your order is ready to collect from the store${order?.code ? ` (${order.code})` : ''}.`, data: { status } }
      : buyerStatusMessage(status, order?.code);
    if (msg) await notifyBuyerOfOrder(orderId, { ...msg, data: { ...msg.data, orderId } });
    // Only delivery orders are rider jobs.
    if (status === 'dispatched' && !isCollection) await notifyOnlineDrivers({ title: 'New delivery job', body: 'An order is ready for pickup near you.', data: { orderId } });
  } catch (error) { console.error('[order push]', (error as Error).message); }
}

/**
 * Email the buyer their receipt once an order is delivered.
 *
 * Fire-and-forget and fully guarded: a guest checkout has no account and
 * therefore no email, and a mail failure must never turn a successful status
 * update into an error. Allocates the receipt number if it has not been
 * issued yet, so the emailed document matches what the buyer later downloads.
 */
async function emailReceipt(orderId: string) {
  try {
    const cfg = await one<any>('select * from platform_settings where id = true');
    if (!cfg) return;

    const o = await one<any>(
      `select o.*, v.business_name, v.whatsapp as vendor_whatsapp, s.pickup_address,
              coalesce(nullif(o.contact_email,''),u.email) as email
       from orders o
       join vendors v on v.id = o.vendor_id
       left join vendor_delivery_settings s on s.vendor_id = v.id
       left join users u on u.id = o.buyer_id
       where o.id = $1`, [orderId]);
    if (!o?.email) return;   // no opted-in guest email or signed-in buyer email

    if (!o.receipt_number) {
      const up = await one<any>(
        `update orders set receipt_number = next_document_number('receipt', $2), receipt_issued_at = now()
         where id = $1 and receipt_number is null returning receipt_number, receipt_issued_at`,
        [orderId, cfg.receipt_prefix]);
      Object.assign(o, up ?? await one<any>(
        'select receipt_number, receipt_issued_at from orders where id=$1', [orderId]));
    }
    o.items = await query('select * from order_items where order_id = $1', [orderId]);

    sendMailAsync({
      to: o.email,
      subject: `Your receipt ${o.receipt_number} — ${o.business_name}`,
      html: receiptEmailHtml(o, cfg),
      kind: 'receipt',
      entityId: orderId,
    });
  } catch (e) {
    console.error('[receipt email]', (e as Error).message);
  }
}
