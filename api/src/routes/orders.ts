import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, optionalAuth, loadVendor } from '../auth';
import { HttpError, audit, randomCode, waLink } from '../utils';
import {
  quoteVendorOrder, cartTotals, round2,
  type FulfilmentMode, type VendorDeliverySettings,
} from '../delivery';

export const orderRouter = Router();

const cartSchema = z.array(
  z.object({ listing_id: z.string().uuid(), qty: z.number().int().positive() })
).min(1);

const checkoutSchema = z.object({
  items: cartSchema,
  contact_name: z.string().min(2).max(120),
  contact_phone: z.string().min(7).max(20),
  delivery_address: z.string().min(5).max(300),
  city: z.string().min(2).max(60),
  country: z.string().min(2).max(60),
  payment_method: z.enum(['cash_on_delivery', 'whatsapp', 'bank_transfer']).default('cash_on_delivery'),
  fulfilment_mode: z.enum(['pickup', 'delivery']).default('delivery'),
  note: z.string().max(500).optional(),
});

/**
 * Load cart rows with their vendor and that vendor's delivery settings, and
 * validate availability. Shared by /quote and /checkout so both see exactly
 * the same prices and the same fee rules.
 */
async function loadCart(items: { listing_id: string; qty: number }[]) {
  const ids = items.map((i) => i.listing_id);
  const rows = await query<any>(
    `select l.*, v.id as vid, v.business_name, v.whatsapp, v.status as vendor_status,
            s.offers_pickup, s.offers_delivery, s.delivery_fee as v_delivery_fee,
            s.free_delivery_over, s.delivery_radius_km, s.pickup_address, s.delivery_notes
     from listings l
     join vendors v on v.id = l.vendor_id
     left join vendor_delivery_settings s on s.vendor_id = v.id
     where l.id = any($1::uuid[])`,
    [ids]
  );
  if (rows.length !== ids.length) throw new HttpError(400, 'One or more items are no longer available');

  for (const r of rows) {
    if (r.status !== 'active' || r.vendor_status !== 'verified')
      throw new HttpError(400, `"${r.title}" is no longer available`);
    const want = items.find((i) => i.listing_id === r.id)!.qty;
    if (r.kind === 'product' && r.quantity !== null && r.quantity < want)
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
    // Services are performed or collected, never delivered.
    const allServices = vItems.every((r) => r.kind === 'service');
    const q = quoteVendorOrder({
      vendor_id: vendorId,
      vendor_name: vItems[0].business_name,
      subtotal,
      currency: vItems[0].currency || 'USD',
      mode: allServices ? 'pickup' : mode,
      settings: settingsOf(vItems[0]),
    });
    if (allServices && mode === 'delivery' && !q.unavailable)
      q.unavailable = 'Services are arranged directly with the provider — no delivery fee.';
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
    const byVendor = await loadCart(b.items);
    const priced = priceCart(byVendor, b.items, b.fulfilment_mode);

    const created = await tx(async (c) => {
      const out: any[] = [];
      for (const { quote, lines, vItems } of priced) {
        const code = randomCode('ORD');
        // total is written explicitly as subtotal + delivery_fee. A CHECK
        // constraint on the table enforces this, so a regression fails loudly.
        const { rows: [order] } = await c.query(
          `insert into orders (code, buyer_id, vendor_id, payment_method, subtotal, delivery_fee, total, currency,
             contact_name, contact_phone, delivery_address, city, country, note, fulfilment_mode)
           values ($1,$2,$3,$4::payment_method,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::fulfilment_mode) returning *`,
          [code, req.user?.id ?? null, quote.vendor_id, b.payment_method,
           quote.subtotal, quote.delivery_fee, quote.total, quote.currency,
           b.contact_name, b.contact_phone,
           b.delivery_address, b.city, b.country, b.note || null, quote.mode]
        );
        for (const { r, qty, line } of lines) {
          await c.query(
            `insert into order_items (order_id, listing_id, title, unit_price, qty, unit, line_total)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [order.id, r.id, r.title, r.price, qty, r.unit, line]
          );
          if (r.kind === 'product' && r.quantity !== null)
            await c.query('update listings set quantity = greatest(quantity - $2, 0) where id = $1', [r.id, qty]);
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
      return out;
    });

    await audit(req.user?.id ?? null, 'order.create', 'order', created.map((o) => o.code).join(','));
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
      `select o.*, v.business_name, v.whatsapp from orders o join vendors v on v.id = o.vendor_id
       where o.code = $1 and regexp_replace(o.contact_phone,'\\D','','g') = regexp_replace($2,'\\D','','g')`,
      [code, phone]
    );
    if (!order) throw new HttpError(404, 'No order found with that code and phone number');
    order.items = await query('select * from order_items where order_id = $1', [order.id]);
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
    const o = await one('update orders set status=$3::order_status where id=$1 and vendor_id=$2 returning *',
      [req.params.id, req.vendor!.id, b.status]);
    if (!o) throw new HttpError(404, 'Order not found');
    await audit(req.user!.id, 'order.status', 'order', req.params.id, { status: b.status });
    res.json({ order: o });
  } catch (e) { next(e); }
});
