import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db';
import { optionalAuth, requireAuth, loadVendor } from '../auth';
import { HttpError, audit, randomCode } from '../utils';

export const complaintRouter = Router();

const schema = z.object({
  subject: z.string().min(3).max(160),
  body: z.string().min(10).max(3000),
  vendor_id: z.string().uuid().optional().nullable(),
  listing_id: z.string().uuid().optional().nullable(),
  order_code: z.string().max(40).optional().nullable(),
  reporter_name: z.string().max(120).optional(),
  reporter_phone: z.string().max(20).optional(),
});

complaintRouter.post('/', optionalAuth, async (req, res, next) => {
  try {
    const b = schema.parse(req.body);
    if (!req.user && !b.reporter_phone) throw new HttpError(400, 'Please provide a phone number so we can reach you');
    let orderId: string | null = null;
    if (b.order_code) {
      const o = await one<any>('select id from orders where code = $1', [b.order_code]);
      orderId = o?.id ?? null;
    }
    const c = await one<any>(
      `insert into complaints (code, reporter_id, reporter_name, reporter_phone, vendor_id, listing_id, order_id, subject, body)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [randomCode('CMP'), req.user?.id ?? null, b.reporter_name ?? req.user?.full_name ?? null,
       b.reporter_phone ?? req.user?.phone ?? null, b.vendor_id ?? null, b.listing_id ?? null,
       orderId, b.subject, b.body]
    );
    await audit(req.user?.id ?? null, 'complaint.create', 'complaint', c.id);
    res.status(201).json({ complaint: c, message: `Complaint logged. Reference ${c.code}.` });
  } catch (e) { next(e); }
});

complaintRouter.get('/track/:code', async (req, res, next) => {
  try {
    const c = await one('select code, subject, status, admin_note, created_at, resolved_at from complaints where code = $1',
      [req.params.code]);
    if (!c) throw new HttpError(404, 'Complaint not found');
    res.json({ complaint: c });
  } catch (e) { next(e); }
});

/** Complaints filed against the logged-in vendor. */
complaintRouter.get('/vendor', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const rows = await query(
      `select code, subject, body, status, admin_note, created_at, resolved_at
       from complaints where vendor_id = $1 order by created_at desc`,
      [req.vendor!.id]
    );
    res.json({ complaints: rows });
  } catch (e) { next(e); }
});
