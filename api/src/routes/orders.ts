import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, optionalAuth, loadVendor } from '../auth';
import { HttpError, audit, randomCode, waLink } from '../utils';

export const orderRouter = Router();

const checkoutSchema = z.object({
  items: z.array(z.object({ listing_id: z.string().uuid(), qty: z.number().int().positive() })).min(1),
  contact_name: z.string().min(2).max(120),
  contact_phone: z.string().min(7).max(20),
  delivery_address: z.string().min(5).max(300),
  city: z.string().min(2).max(60),
  country: z.string().min(2).max(60),
  payment_method: z.enum(['cash_on_delivery', 'whatsapp', 'bank_transfer']).default('cash_on_delivery'),
  note: z.string().max(500).optional(),
});

/**
 * Checkout. A cart may contain items from several vendors — we split into
 * one order per vendor (standard multi-vendor behaviour) and return them all.
 */
orderRouter.post('/checkout', optionalAuth, async (req, res, next) => {
  try {
    const b = checkoutSchema.parse(req.body);
    const ids = b.items.map((i) => i.listing_id);
    const rows = await query<any>(
      `select l.*, v.id as vid, v.business_name, v.whatsapp, v.status as vendor_status
       from listings l join vendors v on v.id = l.vendor_id
       where l.id = any($1::uuid[])`,
      [ids]
    );
    if (rows.length !== ids.length) throw new HttpError(400, 'One or more items are no longer available');

    for (const r of rows) {
      if (r.status !== 'active' || r.vendor_status !== 'verified')
        throw new HttpError(400, `"${r.title}" is no longer available`);
      const want = b.items.find((i) => i.listing_id === r.id)!.qty;
      if (r.kind === 'product' && r.quantity !== null && r.quantity < want)
        throw new HttpError(409, `Only ${r.quantity} left of "${r.title}"`);
    }

    const byVendor = new Map<string, any[]>();
    for (const r of rows) {
      const list = byVendor.get(r.vid) ?? [];
      list.push(r);
      byVendor.set(r.vid, list);
    }

    const created = await tx(async (c) => {
      const out: any[] = [];
      for (const [vendorId, items] of byVendor) {
        let subtotal = 0;
        const lines = items.map((r) => {
          const qty = b.items.find((i) => i.listing_id === r.id)!.qty;
          const line = Number(r.price) * qty;
          subtotal += line;
          return { r, qty, line };
        });
        const code = randomCode('ORD');
        const { rows: [order] } = await c.query(
          `insert into orders (code, buyer_id, vendor_id, payment_method, subtotal, total, currency,
             contact_name, contact_phone, delivery_address, city, country, note)
           values ($1,$2,$3,$4::payment_method,$5,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
          [code, req.user?.id ?? null, vendorId, b.payment_method, subtotal,
           items[0].currency || 'USD', b.contact_name, b.contact_phone,
           b.delivery_address, b.city, b.country, b.note || null]
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
        const text =
          `New order ${code} from ${b.contact_name}\n` +
          lines.map(({ r, qty }) => `• ${r.title} x${qty}`).join('\n') +
          `\nTotal: ${items[0].currency || 'USD'} ${subtotal.toFixed(2)}\n` +
          `Deliver to: ${b.delivery_address}, ${b.city}\nPayment: ${b.payment_method.replace(/_/g, ' ')}`;
        out.push({ ...order, items: lines.map(({ r, qty, line }) => ({ title: r.title, qty, line_total: line })),
          vendor: { business_name: items[0].business_name, whatsapp: items[0].whatsapp },
          whatsapp_url: waLink(items[0].whatsapp, text) });
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
