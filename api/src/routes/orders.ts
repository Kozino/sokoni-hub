import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, optionalAuth, loadVendor } from '../auth';
import { HttpError, audit, randomCode, waLink, validateUuidParam } from '../utils';
import { sendMailAsync } from '../mailer';
import { receiptEmailHtml } from '../templates';
import { orderCustomerEmail, orderVendorEmail } from '../transactionalEmail';
import { config } from '../config';
import {
  quoteVendorOrder, cartTotals, round2, DEFAULT_CURRENCY,
  type FulfilmentMode, type VendorDeliverySettings,
} from '../delivery';
import { attributionSchema, resolveOrderSource } from '../lib/attribution';

export const orderRouter = Router();
orderRouter.param('id', validateUuidParam);

const cartSchema = z.array(
  z.object({ listing_id: z.string().uuid(), qty: z.number().int().min(1).max(10000) })
).min(1).max(100).refine(items=>new Set(items.map(i=>i.listing_id)).size===items.length,'Duplicate cart items');

const checkoutSchema = z.object({
  request_id: z.string().uuid(),
  items: cartSchema,
  contact_name: z.string().min(2).max(120),
  contact_phone: z.string().min(7).max(20),
  contact_email: z.string().trim().email().max(200).optional().or(z.literal('')),
  delivery_address: z.string().min(5).max(300),
  city: z.string().min(2).max(60),
  country: z.string().min(2).max(60),
  payment_method: z.enum(['cash_on_delivery', 'whatsapp', 'bank_transfer']).default('cash_on_delivery'),
  fulfilment_mode: z.enum(['pickup', 'delivery']).default('delivery'),
  note: z.string().max(500).optional(),
  attribution: attributionSchema,
});

/**
 * Load cart rows with their vendor and that vendor's delivery settings, and
 * validate availability. Shared by /quote and /checkout so both see exactly
 * the same prices and the same fee rules.
 */
async function loadCart(items: { listing_id: string; qty: number }[], c?: PoolClient) {
  const ids = items.map((i) => i.listing_id);
  const read = async (sql:string,args:any[]) => c ? (await c.query(sql,args)).rows : query<any>(sql,args);
  const rows = await read(
    `select l.*, v.id as vid, v.slug as vendor_slug, v.business_name, v.whatsapp, v.status as vendor_status,
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
    const want = items.find((i) => i.listing_id === r.id)!.qty;
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

/** Price a cart without placing it. Drives the checkout summary. */
function priceCart(byVendor: Map<string, any[]>, items: { listing_id: string; qty: number }[], mode: FulfilmentMode) {
  const quotes = [];
  for (const [vendorId, vItems] of byVendor) {
    let subtotal = 0;
    const lines = vItems.map((r) => {
      const qty = items.find((i) => i.listing_id === r.id)!.qty;
      const line = round2(Number(r.price) * qty);
      subtotal = round2(subtotal + line);
      return { r, qty, line };
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
    const fingerprint=createHash('sha256').update(JSON.stringify({body:b,buyer:req.user?.id??null})).digest('hex');
    const created = await tx(async (c) => {
      await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['checkout:'+b.request_id]);
      const prior=(await c.query('select fingerprint,response from checkout_requests where key=$1',[b.request_id])).rows[0];
      if(prior){if(prior.fingerprint!==fingerprint) throw new HttpError(409,'Checkout key already used for a different request');return prior.response as any[];}
      const byVendor=await loadCart(b.items,c);
      const priced=priceCart(byVendor,b.items,b.fulfilment_mode);
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
             contact_name, contact_phone, contact_email, delivery_address, city, country, note, fulfilment_mode, source)
           values ($1,$2,$3,$4::payment_method,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::fulfilment_mode,$17) returning *`,
          [code, req.user?.id ?? null, quote.vendor_id, b.payment_method,
           quote.subtotal, quote.delivery_fee, quote.total, quote.currency,
           b.contact_name, b.contact_phone, contactEmail,
           b.delivery_address, b.city, b.country, b.note || null, quote.mode, source]
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
        const feeLine = quote.mode === 'pickup'
          ? 'Collection from store'
          : `Delivery: ${quote.currency} ${quote.delivery_fee.toFixed(2)}`;
        const text =
          `New order ${code} from ${b.contact_name}\n` +
          lines.map(({ r, qty }) => `• ${r.title} x${qty}`).join('\n') +
          `\nSubtotal: ${quote.currency} ${quote.subtotal.toFixed(2)}` +
          `\n${feeLine}` +
          `\nTotal: ${quote.currency} ${quote.total.toFixed(2)}\n` +
          (quote.mode === 'pickup'
            ? `Collection${quote.pickup_address ? `: ${quote.pickup_address}` : ''}`
            : `Deliver to: ${b.delivery_address}, ${b.city}`) +
          `\nPayment: ${b.payment_method.replace(/_/g, ' ')}`;
        out.push({ ...order,
          // pg returns numeric columns as strings; coerce so the checkout
          // response has the same shape/types as the quote response.
          subtotal: quote.subtotal, delivery_fee: quote.delivery_fee, total: quote.total,
          items: lines.map(({ r, qty, line }) => ({ title: r.title, qty, line_total: line })),
          vendor: { business_name: vItems[0].business_name, whatsapp: vItems[0].whatsapp },
          whatsapp_url: waLink(vItems[0].whatsapp, text) });
      }
      await c.query('insert into checkout_requests(key,fingerprint,response) values($1,$2,$3)',[b.request_id,fingerprint,JSON.stringify(out)]);
      return out;
    });

    await audit(req.user ?? null, 'order.create', 'order', created.map((o) => o.code).join(','));
    // Notifications are best-effort and deliberately never delay checkout.
    created.forEach((order) => { void emailOrderCreated(order.id); });
    res.status(201).json({ orders: created });
  } catch (e) {
    next(e);
  }
});

/** Public order lookup by code + phone (buyers have no dashboard). */
orderRouter.get('/track', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    const phone = String(req.query.phone || '');
    const order = await one<any>(
      `select o.id, o.code, o.vendor_id, o.status, o.payment_method, o.subtotal,
              o.delivery_fee, o.total, o.currency, o.contact_name, o.contact_phone,
              o.delivery_address, o.city, o.country, o.note, o.fulfilment_mode,
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
    res.json({ order });
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
    const b = z.object({ status: z.enum(['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled']) }).parse(req.body);
    let didChange=false;
    const o=await tx(async c=>{
      const row=(await c.query('select * from orders where id=$1 and vendor_id=$2 for update',[req.params.id,req.vendor!.id])).rows[0];
      if(!row) throw new HttpError(404,'Order not found');
      if(row.status===b.status) return row;
      const allowed: Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:['dispatched','delivered','cancelled'],dispatched:['delivered'],delivered:[],cancelled:[]};
      if(!allowed[row.status]?.includes(b.status)) throw new HttpError(409,'This order status change is not allowed.');
      if(b.status==='cancelled' && !row.stock_restored_at) {
       const items=(await c.query('select listing_id,sum(qty)::int as qty from order_items where order_id=$1 and listing_id is not null group by listing_id order by listing_id',[row.id])).rows;
       for(const item of items) {
        const stock=(await c.query('update listings set quantity=quantity+$2 where id=$1 and quantity is not null returning quantity',[item.listing_id,item.qty])).rows[0];
        if(stock) await c.query(`insert into stock_movements(listing_id,vendor_id,delta,balance_after,reason,order_id,actor_id,note)
         values($1,$2,$3,$4,'return',$5,$6,'Unfulfilled order cancelled')`,[item.listing_id,row.vendor_id,item.qty,stock.quantity,row.id,req.user!.id]);
       }
      }
      didChange=true;
      return (await c.query(`update orders set status=$2::order_status,
       stock_restored_at=case when $2='cancelled' then coalesce(stock_restored_at,now()) else stock_restored_at end
       where id=$1 returning *`,[row.id,b.status])).rows[0];
    });
    await audit(req.user!, 'order.status', 'order', req.params.id, { status: b.status });
    if (didChange) {
      if (b.status === 'delivered') void emailReceipt(o.id);
      else void emailOrderStatus(o.id, b.status);
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
