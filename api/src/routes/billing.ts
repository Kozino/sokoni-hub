import { Request, Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, loadVendor } from '../auth';
import { HttpError, audit, secretsEqual, validateUuidParam } from '../utils';
import { computeStatement, monthPeriod, formatMoney, type SettleableOrder } from '../billing';
import { receiptHtml, statementHtml, type PlatformSettings } from '../templates';
import { sendMail, emailEnabled } from '../mailer';

export const billingRouter = Router();
billingRouter.param('id', validateUuidParam);

/** Prefixes drive document numbering; the templates never need them. */
type Settings = PlatformSettings & {
  commission_rate: number;
  invoice_prefix: string;
  receipt_prefix: string;
};

/** Singleton settings row, created by migration 003. */
async function settings(): Promise<Settings> {
  const s = await one<any>('select * from platform_settings where id = true');
  if (!s) throw new HttpError(500, 'Platform settings row is missing — run migration 003');
  return { ...s, commission_rate: Number(s.commission_rate) };
}

const html = (res: any, body: string) => res.type('html').send(body);

/* ============================ settings ============================ */

billingRouter.get('/settings', requireAuth('admin'), async (_req, res, next) => {
  try {
    res.json({ settings: await settings() });
  } catch (e) { next(e); }
});

billingRouter.patch('/settings', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = z.object({
      commission_rate: z.number().min(0).max(1).optional(),
      currency: z.string().length(3).optional(),
      business_name: z.string().min(1).max(120).optional(),
      business_address: z.string().max(300).nullable().optional(),
      business_email: z.string().email().nullable().optional(),
      business_phone: z.string().max(40).nullable().optional(),
      cr_number: z.string().max(60).nullable().optional(),
      tax_number: z.string().max(60).nullable().optional(),
      // '' clears the logo; a URL sets it; omitted leaves it untouched.
      logo_url: z.union([z.string().url(), z.literal('')]).nullable().optional(),
      invoice_prefix: z.string().min(1).max(8).optional(),
      receipt_prefix: z.string().min(1).max(8).optional(),
      invoice_footer: z.string().max(500).nullable().optional(),
    }).parse(req.body);

    const s = await one<any>(
      `update platform_settings set
         commission_rate  = coalesce($1, commission_rate),
         currency         = coalesce($2, currency),
         business_name    = coalesce($3, business_name),
         business_address = coalesce($4, business_address),
         business_email   = coalesce($5, business_email),
         business_phone   = coalesce($6, business_phone),
         cr_number        = coalesce($7, cr_number),
         tax_number       = coalesce($8, tax_number),
         -- $9 needs an explicit cast: every branch here is either NULL or a
         -- column reference, so Postgres cannot infer the parameter's type.
         logo_url         = case when $9::text is null then logo_url
                                 when $9::text = ''    then null
                                 else $9::text end,
         invoice_prefix   = coalesce($10, invoice_prefix),
         receipt_prefix   = coalesce($11, receipt_prefix),
         invoice_footer   = coalesce($12, invoice_footer),
         updated_at = now()
       where id = true returning *`,
      [b.commission_rate ?? null, b.currency ?? null, b.business_name ?? null,
       b.business_address ?? null, b.business_email ?? null, b.business_phone ?? null,
       b.cr_number ?? null, b.tax_number ?? null, b.logo_url ?? null,
       b.invoice_prefix ?? null, b.receipt_prefix ?? null, b.invoice_footer ?? null]
    );
    await audit(req.user!, 'billing.settings', 'platform_settings', null, b as any);
    res.json({ settings: s });
  } catch (e) { next(e); }
});

/* ======================= statement generation ===================== */

const periodSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  vendor_id: z.string().uuid().optional(),
}).refine((v) => v.month || (v.period_start && v.period_end),
  { message: 'Provide either month=YYYY-MM or both period_start and period_end' });

/**
 * Preview what a statement run would produce, without writing anything.
 * Lets an admin sanity-check figures before committing them.
 */
billingRouter.post('/statements/preview', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = periodSchema.parse(req.body);
    const { period_start, period_end } = resolvePeriod(b);
    const rate = (await settings()).commission_rate;
    const groups = await settleableOrders(period_start, period_end, b.vendor_id);
    res.json({
      period_start, period_end, commission_rate: rate,
      vendors: groups.map((g) => ({
        vendor_id: g.vendor_id, business_name: g.business_name,
        ...computeStatement(g.orders, rate),
      })),
    });
  } catch (e) { next(e); }
});

/**
 * Generate draft statements for a period.
 *
 * Only DELIVERED orders are settled — an order still in flight, or cancelled,
 * has not earned anything yet. Orders already attached to a statement are
 * skipped via the unique constraint on statement_orders.order_id, so running
 * this twice cannot double-bill.
 */
billingRouter.post('/statements/generate', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = periodSchema.parse(req.body);
    const { period_start, period_end } = resolvePeriod(b);
    const cfg = await settings();
    const groups = await settleableOrders(period_start, period_end, b.vendor_id);
    if (!groups.length) throw new HttpError(404, 'No settleable orders found for that period');

    const created = await tx(async (c) => {
      const out: any[] = [];
      for (const g of groups) {
        const t = computeStatement(g.orders, cfg.commission_rate);
        const { rows: [st] } = await c.query(
          `insert into vendor_statements
             (vendor_id, period_start, period_end, currency, order_count,
              goods_subtotal, delivery_total, gross_sales,
              commission_rate, commission_base, commission_amount,
              collected_by_vendor, collected_by_platform,
              net_due_to_platform, net_due_to_vendor, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
          [g.vendor_id, period_start, period_end, g.currency, t.order_count,
           t.goods_subtotal, t.delivery_total, t.gross_sales,
           t.commission_rate, t.commission_base, t.commission_amount,
           t.collected_by_vendor, t.collected_by_platform,
           t.net_due_to_platform, t.net_due_to_vendor, req.user!.id]
        );
        for (const l of t.lines) {
          await c.query(
            `insert into statement_orders (statement_id, order_id, gross, commission_amount)
             values ($1,$2,$3,$4)`,
            [st.id, l.order_id, l.gross, l.commission_amount]
          );
        }
        out.push({ ...st, business_name: g.business_name });
      }
      return out;
    });

    await audit(req.user!, 'billing.statements.generate', 'vendor_statement',
      created.map((s) => s.id).join(','), { period_start, period_end, count: created.length });
    res.status(201).json({ statements: created });
  } catch (e) {
    // The partial unique index fires when a live statement already covers the period.
    if ((e as any)?.code === '23505')
      return next(new HttpError(409,
        'A statement already exists for that vendor and period. Void it first to regenerate.'));
    next(e);
  }
});

function resolvePeriod(b: z.infer<typeof periodSchema>) {
  if (b.month) {
    const [y, m] = b.month.split('-').map(Number);
    return monthPeriod(y, m);
  }
  return { period_start: b.period_start!, period_end: b.period_end! };
}

/** Delivered, not-yet-settled orders in a period, grouped by vendor. */
async function settleableOrders(from: string, to: string, vendorId?: string) {
  const rows = await query<any>(
    `select o.id, o.vendor_id, o.subtotal, o.delivery_fee, o.total, o.currency,
            o.funds_collected_by, v.business_name,
            -- Commission base: product lines only. Service work is never
            -- commissioned (service vendors pay a fee before approval), and
            -- orders predating migration 005 can still contain service lines.
            -- A NULL kind is a line whose listing was deleted before 007 could
            -- record it; treated as a product, which is the behaviour that was
            -- already in effect rather than a guess that cuts our own revenue.
            coalesce((
              select sum(oi.line_total) from order_items oi
               where oi.order_id = o.id
                 and (oi.kind is distinct from 'service')
            ), 0) as goods_subtotal
     from orders o
     join vendors v on v.id = o.vendor_id
     left join statement_orders so on so.order_id = o.id
     where o.status = 'delivered'
       and so.order_id is null
       and o.created_at >= $1::date
       and o.created_at < ($2::date + interval '1 day')
       and ($3::uuid is null or o.vendor_id = $3::uuid)
     order by v.business_name, o.created_at`,
    [from, to, vendorId ?? null]
  );

  type Group = { vendor_id: string; business_name: string; currency: string; orders: SettleableOrder[] };
  const byVendor = new Map<string, Group>();
  for (const r of rows) {
    const g: Group = byVendor.get(r.vendor_id) ?? {
      vendor_id: r.vendor_id, business_name: r.business_name, currency: r.currency || 'QAR', orders: [],
    };
    g.orders.push({
      id: r.id,
      subtotal: Number(r.subtotal),
      delivery_fee: Number(r.delivery_fee),
      total: Number(r.total),
      funds_collected_by: r.funds_collected_by,
      goods_subtotal: Number(r.goods_subtotal),
    });
    byVendor.set(r.vendor_id, g);
  }
  return [...byVendor.values()];
}

/* ========================= statement listing ====================== */

billingRouter.get('/statements', requireAuth('admin'), async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const vendorId = String(req.query.vendor_id || '');
    const rows = await query(
      `select s.*, v.business_name from vendor_statements s
       join vendors v on v.id = s.vendor_id
       where ($1 = '' or s.status::text = $1)
         and ($2 = '' or s.vendor_id = $2::uuid)
       order by s.period_start desc, v.business_name limit 200`,
      [status, vendorId]
    );
    res.json({ statements: rows });
  } catch (e) { next(e); }
});

/** A vendor's own statements. */
billingRouter.get('/my/statements', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const rows = await query(
      `select * from vendor_statements
       where vendor_id = $1 and status <> 'draft'
       order by period_start desc`,
      [req.vendor!.id]
    );
    res.json({ statements: rows });
  } catch (e) { next(e); }
});

/** Full statement with its order lines. Admin, or the vendor it belongs to. */
async function loadStatement(id: string) {
  const st = await one<any>(
    `select s.*, v.business_name, v.city as vendor_city, v.whatsapp as vendor_whatsapp, v.user_id
     from vendor_statements s join vendors v on v.id = s.vendor_id where s.id = $1`,
    [id]
  );
  if (!st) throw new HttpError(404, 'Statement not found');
  st.orders = await query(
    `select o.code, o.created_at, so.gross as total, so.commission_amount
     from statement_orders so join orders o on o.id = so.order_id
     where so.statement_id = $1 order by o.created_at`,
    [id]
  );
  return st;
}

function assertCanView(st: any, user: { id: string; role: string }) {
  if (user.role === 'admin') return;
  if (user.role === 'vendor' && st.user_id === user.id && st.status !== 'draft') return;
  throw new HttpError(403, 'Not allowed to view this statement');
}

billingRouter.get('/statements/:id', requireAuth(), async (req, res, next) => {
  try {
    const st = await loadStatement(req.params.id);
    assertCanView(st, req.user!);
    res.json({ statement: st });
  } catch (e) { next(e); }
});

billingRouter.get('/statements/:id/document', requireAuth(), async (req, res, next) => {
  try {
    const st = await loadStatement(req.params.id);
    assertCanView(st, req.user!);
    html(res, statementHtml(st, await settings()));
  } catch (e) { next(e); }
});

/* ====================== statement state changes =================== */

billingRouter.post('/statements/:id/issue', requireAuth('admin'), async (req, res, next) => {
  try {
    const cfg = await settings();
    const st = await tx(async (c) => {
      const { rows: [cur] } = await c.query('select * from vendor_statements where id=$1 for update', [req.params.id]);
      if (!cur) throw new HttpError(404, 'Statement not found');
      if (cur.status !== 'draft') throw new HttpError(409, `Statement is already ${cur.status}`);
      const { rows: [num] } = await c.query('select next_document_number($1,$2) as n', ['invoice', cfg.invoice_prefix]);
      const { rows: [updated] } = await c.query(
        `update vendor_statements set status='issued', number=$2, issued_at=now(), updated_at=now()
         where id=$1 returning *`,
        [req.params.id, num.n]
      );
      return updated;
    });
    await audit(req.user!, 'billing.statement.issue', 'vendor_statement', st.id, { number: st.number });
    res.json({ statement: st });
  } catch (e) { next(e); }
});

billingRouter.post('/statements/:id/pay', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = z.object({
      payment_reference: z.string().min(1).max(120),
      paid_at: z.string().datetime().optional(),
    }).parse(req.body);

    const st = await one<any>(
      `update vendor_statements
         set status='paid', payment_reference=$2, paid_at=coalesce($3::timestamptz, now()), updated_at=now()
       where id=$1 and status='issued' returning *`,
      [req.params.id, b.payment_reference, b.paid_at ?? null]
    );
    if (!st) throw new HttpError(409, 'Statement not found, or not in the issued state');
    await audit(req.user!, 'billing.statement.pay', 'vendor_statement', st.id, b as any);
    res.json({ statement: st });
  } catch (e) { next(e); }
});

/**
 * Void a statement and release its orders so the period can be regenerated.
 * Paid statements are never voided — reverse them with an adjusting entry
 * instead, so the audit trail stays intact.
 */
billingRouter.post('/statements/:id/void', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const st = await tx(async (c) => {
      const { rows: [cur] } = await c.query('select * from vendor_statements where id=$1 for update', [req.params.id]);
      if (!cur) throw new HttpError(404, 'Statement not found');
      if (cur.status === 'paid') throw new HttpError(409, 'A paid statement cannot be voided');
      await c.query('delete from statement_orders where statement_id=$1', [req.params.id]);
      const { rows: [updated] } = await c.query(
        `update vendor_statements set status='void', notes=coalesce($2, notes), order_count=0, updated_at=now()
         where id=$1 returning *`,
        [req.params.id, b.reason ?? null]
      );
      return updated;
    });
    await audit(req.user!, 'billing.statement.void', 'vendor_statement', st.id, b as any);
    res.json({ statement: st });
  } catch (e) { next(e); }
});

/* ============================= receipts =========================== */

/**
 * Buyer receipt, looked up the same way as order tracking: code + phone.
 * Buyers have no dashboard, so this must work for guests. The receipt number
 * is allocated on first view and then never changes.
 */
billingRouter.get('/receipt', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    const phone = String(req.query.phone || '');
    if (!code || !phone) throw new HttpError(400, 'code and phone are required');

    const o = await one<any>(
      `select o.*, v.business_name, v.whatsapp as vendor_whatsapp, s.pickup_address
       from orders o
       join vendors v on v.id = o.vendor_id
       left join vendor_delivery_settings s on s.vendor_id = v.id
       where o.code = $1
         and regexp_replace(o.contact_phone,'\\D','','g') = regexp_replace($2,'\\D','','g')`,
      [code, phone]
    );
    if (!o) throw new HttpError(404, 'No order found with that code and phone number');

    if (!o.receipt_number) {
      const cfg = await settings();
      const updated = await one<any>(
        `update orders
           set receipt_number = next_document_number('receipt', $2), receipt_issued_at = now()
         where id = $1 and receipt_number is null
         returning receipt_number, receipt_issued_at`,
        [o.id, cfg.receipt_prefix]
      );
      // If two requests raced, the loser re-reads the winner's number.
      if (updated) Object.assign(o, updated);
      else Object.assign(o, await one<any>('select receipt_number, receipt_issued_at from orders where id=$1', [o.id]));
    }

    o.items = await query('select * from order_items where order_id = $1', [o.id]);

    if (String(req.query.format || 'html') === 'json') return res.json({ receipt: o });
    html(res, receiptHtml(o, await settings()));
  } catch (e) { next(e); }
});


/* ============================ emailing ============================ */

/** Vendor's contact email, via the owning user account. */
async function vendorEmail(vendorId: string): Promise<{ email: string | null; name: string }> {
  const r = await one<any>(
    `select u.email, v.business_name from vendors v join users u on u.id = v.user_id where v.id = $1`,
    [vendorId]
  );
  return { email: r?.email ?? null, name: r?.business_name ?? 'Vendor' };
}

billingRouter.post('/statements/:id/send', requireAuth('admin'), async (req, res, next) => {
  try {
    const st = await loadStatement(req.params.id);
    if (st.status === 'draft') throw new HttpError(409, 'Issue the statement before emailing it');
    const cfg = await settings();
    const { email } = await vendorEmail(st.vendor_id);
    if (!email) throw new HttpError(422, 'That vendor has no email address on their account');

    const owed = Number(st.net_due_to_platform) > 0;
    const amount = formatMoney(owed ? st.net_due_to_platform : st.net_due_to_vendor, st.currency);
    const r = await sendMail({
      to: email,
      subject: `${cfg.business_name} statement ${st.number} — ${amount}`,
      html: statementHtml(st, cfg),
      kind: 'statement',
      entityId: st.id,
    });
    if (r.ok) await query('update vendor_statements set emailed_at = now() where id = $1', [st.id]);
    await audit(req.user!, 'billing.statement.email', 'vendor_statement', st.id, { to: email, status: r.status });
    if (!r.ok) throw new HttpError(502, `Email not sent: ${r.error}`);
    res.json({ sent: true, to: email });
  } catch (e) { next(e); }
});

/** Who received what, for the admin to check a send actually happened. */
billingRouter.get('/email-log', requireAuth('admin'), async (req, res, next) => {
  try {
    const entity = String(req.query.entity_id || '');
    const rows = await query(
      `select * from email_log where ($1 = '' or entity_id = $1::uuid)
       order by created_at desc limit 100`, [entity]
    );
    res.json({ emails: rows, enabled: emailEnabled });
  } catch (e) { next(e); }
});

/* ======================== payout batches ========================== */
/*
 * Money cannot move automatically without a payment rail. What is automated
 * here is everything either side of the transfer: who to pay, how much, a
 * bank-ready export, and marking many statements settled under one reference.
 */

/** Statements issued and still unpaid, with the vendor's bank details. */
billingRouter.get('/payouts/outstanding', requireAuth('admin'), async (_req, res, next) => {
  try {
    const rows = await query(
      `select s.id, s.number, s.currency, s.period_start, s.period_end,
              s.net_due_to_vendor, s.net_due_to_platform,
              v.business_name, v.bank_name, v.bank_account_name, v.bank_iban, u.email, u.phone
       from vendor_statements s
       join vendors v on v.id = s.vendor_id
       join users u on u.id = v.user_id
       where s.status = 'issued'
       order by s.net_due_to_vendor desc, v.business_name`
    );
    const toVendors = rows.filter((r: any) => Number(r.net_due_to_vendor) > 0);
    const toPlatform = rows.filter((r: any) => Number(r.net_due_to_platform) > 0);
    res.json({
      pay_out: toVendors,
      collect_in: toPlatform,
      pay_out_total: toVendors.reduce((a: number, r: any) => a + Number(r.net_due_to_vendor), 0),
      collect_in_total: toPlatform.reduce((a: number, r: any) => a + Number(r.net_due_to_platform), 0),
    });
  } catch (e) { next(e); }
});

/** CSV for a bank bulk-transfer upload. */
billingRouter.get('/payouts/export.csv', requireAuth('admin'), async (_req, res, next) => {
  try {
    const rows = await query<any>(
      `select s.number, s.currency, s.net_due_to_vendor,
              v.business_name, v.bank_name, v.bank_account_name, v.bank_iban
       from vendor_statements s join vendors v on v.id = s.vendor_id
       where s.status = 'issued' and s.net_due_to_vendor > 0
       order by v.business_name`
    );
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['statement', 'vendor', 'account_name', 'bank', 'iban', 'currency', 'amount'];
    const csv = [header.join(',')]
      .concat(rows.map((r) => [r.number, r.business_name, r.bank_account_name, r.bank_name,
                               r.bank_iban, r.currency, Number(r.net_due_to_vendor).toFixed(2)]
        .map(cell).join(',')))
      .join('\n');
    res.type('text/csv').attachment(`sokoni-payouts-${new Date().toISOString().slice(0, 10)}.csv`).send(csv);
  } catch (e) { next(e); }
});

/** Mark several statements paid under one bank reference. */
billingRouter.post('/payouts/batch', requireAuth('admin'), async (req, res, next) => {
  try {
    const b = z.object({
      statement_ids: z.array(z.string().uuid()).min(1),
      reference: z.string().min(1).max(120),
      note: z.string().max(300).optional(),
    }).parse(req.body);

    const out = await tx(async (c) => {
      const { rows: found } = await c.query(
        `select id, currency, net_due_to_vendor, net_due_to_platform
         from vendor_statements where id = any($1::uuid[]) and status = 'issued' for update`,
        [b.statement_ids]
      );
      if (!found.length) throw new HttpError(409, 'None of those statements are in the issued state');
      const total = found.reduce(
        (a: number, r: any) => a + Number(r.net_due_to_vendor) + Number(r.net_due_to_platform), 0);

      const { rows: [batch] } = await c.query(
        `insert into payout_batches (reference, note, total, currency, count, created_by)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [b.reference, b.note ?? null, total.toFixed(2), found[0].currency, found.length, req.user!.id]
      );
      await c.query(
        `update vendor_statements
           set status='paid', paid_at=now(), payment_reference=$2, payout_batch_id=$3, updated_at=now()
         where id = any($1::uuid[]) and status='issued'`,
        [found.map((r: any) => r.id), b.reference, batch.id]
      );
      return { batch, settled: found.length, skipped: b.statement_ids.length - found.length };
    });

    await audit(req.user!, 'billing.payout.batch', 'payout_batch', out.batch.id,
      { reference: b.reference, settled: out.settled });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

/* ========================== scheduled run ========================= */
/**
 * Monthly statement run, for an external scheduler (cron-job.org, GitHub
 * Actions, Render cron). Authenticated with CRON_SECRET rather than a user
 * token, since no human is present.
 *
 *   curl -X POST .../api/billing/cron/run-statements \
 *        -H "x-cron-secret: $CRON_SECRET"
 *
 * Defaults to the month just ended. Safe to call repeatedly: the unique index
 * on (vendor, period) means a second run for the same month is reported as
 * skipped rather than duplicating anything.
 */
function requireCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured on the server');
  const given = String(req.get('x-cron-secret') || (req.get('authorization') || '').replace(/^Bearer /i, ''));
  if (!secretsEqual(secret, given)) throw new HttpError(401, 'Bad cron secret');
}

billingRouter.post('/cron/run-statements', async (req, res, next) => {
  try {
    requireCronSecret(req);

    const b = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      issue: z.boolean().default(true),
      email: z.boolean().default(true),
    }).parse(req.body ?? {});

    // Default to last month, so a run on the 1st settles the month just ended.
    const now = new Date();
    const d = b.month
      ? { y: Number(b.month.slice(0, 4)), m: Number(b.month.slice(5, 7)) }
      : { y: now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(),
          m: now.getUTCMonth() === 0 ? 12 : now.getUTCMonth() };
    const { period_start, period_end } = monthPeriod(d.y, d.m);

    const cfg = await settings();
    const groups = await settleableOrders(period_start, period_end);
    const result = { period_start, period_end, generated: 0, issued: 0, emailed: 0, skipped: 0, errors: [] as string[] };

    for (const g of groups) {
      try {
        const t = computeStatement(g.orders, cfg.commission_rate);
        const st = await tx(async (c) => {
          const { rows: [row] } = await c.query(
            `insert into vendor_statements
               (vendor_id, period_start, period_end, currency, order_count,
                goods_subtotal, delivery_total, gross_sales,
                commission_rate, commission_base, commission_amount,
                collected_by_vendor, collected_by_platform,
                net_due_to_platform, net_due_to_vendor)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
            [g.vendor_id, period_start, period_end, g.currency, t.order_count,
             t.goods_subtotal, t.delivery_total, t.gross_sales, t.commission_rate,
             t.commission_base, t.commission_amount, t.collected_by_vendor,
             t.collected_by_platform, t.net_due_to_platform, t.net_due_to_vendor]
          );
          for (const l of t.lines)
            await c.query(
              `insert into statement_orders (statement_id, order_id, gross, commission_amount) values ($1,$2,$3,$4)`,
              [row.id, l.order_id, l.gross, l.commission_amount]);
          if (b.issue) {
            const { rows: [num] } = await c.query('select next_document_number($1,$2) as n', ['invoice', cfg.invoice_prefix]);
            const { rows: [iss] } = await c.query(
              `update vendor_statements set status='issued', number=$2, issued_at=now() where id=$1 returning *`,
              [row.id, num.n]);
            return iss;
          }
          return row;
        });
        result.generated++;
        if (b.issue) result.issued++;

        if (b.email && b.issue && emailEnabled) {
          const full = await loadStatement(st.id);
          const { email } = await vendorEmail(g.vendor_id);
          if (email) {
            const r = await sendMail({
              to: email,
              subject: `${cfg.business_name} statement ${st.number}`,
              html: statementHtml(full, cfg),
              kind: 'statement', entityId: st.id,
            });
            if (r.ok) {
              await query('update vendor_statements set emailed_at = now() where id = $1', [st.id]);
              result.emailed++;
            }
          }
        }
      } catch (e: any) {
        if (e?.code === '23505') result.skipped++;          // already settled this period
        else result.errors.push(`${g.business_name}: ${e.message}`);
      }
    }

    await audit(null, 'billing.cron.run', 'vendor_statement', null, result as any);
    res.json(result);
  } catch (e) { next(e); }
});

/**
 * Daily housekeeping for short-lived security and idempotency records. This is
 * deliberately a separate cron target from monthly statement generation: it
 * should run daily, while the statement job normally runs once per month.
 */
billingRouter.post('/cron/purge-security-data', async (req, res, next) => {
  try {
    requireCronSecret(req);

    // Limit every delete to a small batch. It makes this endpoint safe to run
    // frequently on a busy database; repeated calls steadily drain any backlog
    // without a long table lock. Expired sessions are no longer valid, revoked
    // sessions get a short troubleshooting window, and checkout retries only
    // require a short idempotency retention period.
    const [sessions] = await query<{ deleted: number }>(`
      with doomed as (
        select id from auth_sessions
         where expires_at < now()
            or revoked_at < now() - interval '7 days'
         limit 10000
      ), deleted as (
        delete from auth_sessions s using doomed d where s.id = d.id returning s.id
      ) select count(*)::int as deleted from deleted`);
    const [rateLimits] = await query<{ deleted: number }>(`
      with doomed as (
        select key from security_rate_limits where resets_at < now() limit 10000
      ), deleted as (
        delete from security_rate_limits r using doomed d where r.key = d.key returning r.key
      ) select count(*)::int as deleted from deleted`);
    const [checkoutRequests] = await query<{ deleted: number }>(`
      with doomed as (
        select key from checkout_requests
         where created_at < now() - interval '7 days'
         limit 10000
      ), deleted as (
        delete from checkout_requests r using doomed d where r.key = d.key returning r.key
      ) select count(*)::int as deleted from deleted`);

    const result = {
      auth_sessions: sessions?.deleted ?? 0,
      security_rate_limits: rateLimits?.deleted ?? 0,
      checkout_requests: checkoutRequests?.deleted ?? 0,
    };
    await audit(null, 'security.cron.purge', 'ephemeral_data', null, result);
    res.json(result);
  } catch (e) { next(e); }
});
