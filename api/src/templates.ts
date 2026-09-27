/**
 * Printable documents: buyer receipts and vendor commission statements.
 *
 * Plain server-rendered HTML with inline CSS and an @media print block, rather
 * than a PDF library. It renders in any browser, prints to PDF via Ctrl/Cmd+P,
 * attaches to an email, and adds no dependency or build step. If a true PDF
 * byte stream is ever needed, this HTML is what you would feed the renderer.
 */

import { formatMoney } from './billing';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const INDIGO = '#2E3B6E';

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export interface PlatformSettings {
  business_name: string;
  business_address?: string | null;
  business_email?: string | null;
  business_phone?: string | null;
  cr_number?: string | null;
  tax_number?: string | null;
  logo_url?: string | null;
  invoice_footer?: string | null;
  currency: string;
}

function shell(title: string, body: string) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:32px 16px;background:#F3F4F6;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       color:#111827;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:760px;margin:0 auto;background:#fff;padding:40px;
         border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;
        border-bottom:3px solid ${INDIGO};padding-bottom:20px;margin-bottom:24px}
  .logo{max-height:60px;max-width:220px;width:auto;height:auto;display:block;margin-bottom:10px}
  .brand{font-size:22px;font-weight:700;color:${INDIGO};margin:0}
  .muted{color:#6B7280;font-size:13px}
  .doctype{text-align:right}
  .doctype h2{margin:0;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#6B7280;font-weight:600}
  .docnum{font-size:19px;font-weight:700;margin-top:4px}
  .cols{display:flex;flex-wrap:wrap;gap:32px;margin-bottom:28px}
  .col{flex:1;min-width:200px}
  .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6B7280;font-weight:600;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px}
  th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6B7280;
     border-bottom:2px solid #E5E7EB;padding:8px 10px;font-weight:600}
  td{padding:10px;border-bottom:1px solid #F3F4F6;vertical-align:top}
  .r{text-align:right;white-space:nowrap}
  .totals{margin-left:auto;width:min(320px,100%)}
  .totals td{border:none;padding:6px 10px}
  .totals .grand td{border-top:2px solid ${INDIGO};font-weight:700;font-size:16px;padding-top:12px}
  .pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:600}
  .pill-paid{background:#DCFCE7;color:#166534}
  .pill-due{background:#FEF3C7;color:#92400E}
  .pill-void{background:#F3F4F6;color:#6B7280}
  .note{background:#F9FAFB;border-left:3px solid ${INDIGO};padding:12px 16px;font-size:13px;margin-bottom:20px}
  .foot{margin-top:28px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280}
  .actions{max-width:760px;margin:0 auto 16px;text-align:right}
  .btn{background:${INDIGO};color:#fff;border:0;padding:9px 18px;border-radius:8px;
       font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
  @media print{
    body{background:#fff;padding:0}
    .sheet{box-shadow:none;border-radius:0;max-width:none;padding:0}
    .actions{display:none}
    @page{margin:18mm}
  }
</style></head>
<body>
<div class="actions"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet">${body}</div>
</body></html>`;
}

function header(s: PlatformSettings, docType: string, docNumber: string, extra = '') {
  return `<div class="head">
    <div>
      ${s.logo_url
        ? `<img class="logo" src="${esc(s.logo_url)}" alt="${esc(s.business_name)}">`
        : ''}
      <p class="brand">${esc(s.business_name)}</p>
      <div class="muted">
        ${s.business_address ? esc(s.business_address) + '<br>' : ''}
        ${s.business_phone ? esc(s.business_phone) + '<br>' : ''}
        ${s.business_email ? esc(s.business_email) + '<br>' : ''}
        ${s.cr_number ? 'CR: ' + esc(s.cr_number) + '<br>' : ''}
        ${s.tax_number ? 'TRN: ' + esc(s.tax_number) : ''}
      </div>
    </div>
    <div class="doctype">
      <h2>${esc(docType)}</h2>
      <div class="docnum">${esc(docNumber)}</div>
      ${extra}
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- receipt */

export interface ReceiptOrder {
  code: string; receipt_number: string; receipt_issued_at: string | Date;
  created_at: string | Date; status: string; payment_method: string;
  fulfilment_mode: string; currency: string;
  subtotal: number | string; delivery_fee: number | string; total: number | string;
  contact_name: string; contact_phone: string; delivery_address: string;
  city: string; country: string; note?: string | null;
  business_name: string; vendor_whatsapp?: string | null; pickup_address?: string | null;
  items: { title: string; qty: number; unit_price: number | string; unit?: string | null; line_total: number | string }[];
}

export function receiptHtml(o: ReceiptOrder, s: PlatformSettings): string {
  const cur = o.currency || s.currency;
  const collected = o.status === 'delivered';

  const rows = o.items.map((i) => `<tr>
      <td>${esc(i.title)}${i.unit ? ` <span class="muted">(${esc(i.unit)})</span>` : ''}</td>
      <td class="r">${esc(i.qty)}</td>
      <td class="r">${esc(formatMoney(i.unit_price, cur))}</td>
      <td class="r">${esc(formatMoney(i.line_total, cur))}</td>
    </tr>`).join('');

  const body = `
    ${header(s, 'Receipt', o.receipt_number, `<div class="muted" style="margin-top:6px">${esc(fmtDate(o.receipt_issued_at))}</div>
      <div style="margin-top:8px"><span class="pill ${collected ? 'pill-paid' : 'pill-due'}">${collected ? 'Completed' : esc(o.status)}</span></div>`)}

    <div class="cols">
      <div class="col">
        <div class="label">Billed to</div>
        <strong>${esc(o.contact_name)}</strong><br>
        <span class="muted">${esc(o.contact_phone)}</span><br>
        <span class="muted">${esc(o.delivery_address)}<br>${esc(o.city)}, ${esc(o.country)}</span>
      </div>
      <div class="col">
        <div class="label">Sold by</div>
        <strong>${esc(o.business_name)}</strong><br>
        ${o.vendor_whatsapp ? `<span class="muted">${esc(o.vendor_whatsapp)}</span><br>` : ''}
        ${o.fulfilment_mode === 'pickup' && o.pickup_address ? `<span class="muted">Collect: ${esc(o.pickup_address)}</span>` : ''}
      </div>
      <div class="col">
        <div class="label">Order</div>
        <strong>${esc(o.code)}</strong><br>
        <span class="muted">Placed ${esc(fmtDate(o.created_at))}<br>
        ${esc(o.payment_method.replace(/_/g, ' '))}<br>
        ${o.fulfilment_mode === 'pickup' ? 'Collection' : 'Delivery'}</span>
      </div>
    </div>

    <table>
      <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Subtotal</td><td class="r">${esc(formatMoney(o.subtotal, cur))}</td></tr>
      <tr><td>${o.fulfilment_mode === 'pickup' ? 'Collection' : 'Delivery'}</td>
          <td class="r">${Number(o.delivery_fee) === 0 ? 'Free' : esc(formatMoney(o.delivery_fee, cur))}</td></tr>
      <tr class="grand"><td>Total</td><td class="r">${esc(formatMoney(o.total, cur))}</td></tr>
    </table>

    ${o.note ? `<div class="note"><strong>Note:</strong> ${esc(o.note)}</div>` : ''}

    <div class="foot">
      Sold by ${esc(o.business_name)} via ${esc(s.business_name)}. Payment is made
      directly to the vendor. Keep this receipt as proof of purchase.
      ${s.invoice_footer ? '<br>' + esc(s.invoice_footer) : ''}
    </div>`;

  return shell(`Receipt ${o.receipt_number}`, body);
}

/* -------------------------------------------------------------- statement */

export interface StatementDoc {
  number: string | null; status: string;
  period_start: string; period_end: string; currency: string;
  order_count: number;
  goods_subtotal: number | string; delivery_total: number | string; gross_sales: number | string;
  commission_rate: number | string; commission_base: number | string; commission_amount: number | string;
  collected_by_vendor: number | string; collected_by_platform: number | string;
  net_due_to_platform: number | string; net_due_to_vendor: number | string;
  issued_at?: string | Date | null; paid_at?: string | Date | null;
  payment_reference?: string | null; notes?: string | null;
  business_name: string; vendor_city?: string | null; vendor_whatsapp?: string | null;
  orders: { code: string; created_at: string | Date; total: number | string; commission_amount: number | string }[];
}

export function statementHtml(st: StatementDoc, s: PlatformSettings): string {
  const cur = st.currency || s.currency;
  const ratePct = (Number(st.commission_rate) * 100).toFixed(2).replace(/\.00$/, '');
  // Goods the vendor sold that are NOT commissionable — service work from
  // orders placed before services moved to bookings. Zero for every ordinary
  // statement, in which case the extra rows are omitted entirely. Without them
  // a mixed statement shows 'Goods 250' and 'Commission @ 10%  10.00', which
  // reads as an arithmetic error rather than a deliberate exclusion.
  const excludedServices =
    Math.round((Number(st.goods_subtotal) - Number(st.commission_base)) * 100) / 100;
  const toPlatform = Number(st.net_due_to_platform) > 0;
  const toVendor = Number(st.net_due_to_vendor) > 0;

  const pill = st.status === 'paid' ? '<span class="pill pill-paid">Paid</span>'
    : st.status === 'void' ? '<span class="pill pill-void">Void</span>'
    : `<span class="pill pill-due">${st.status === 'draft' ? 'Draft' : 'Outstanding'}</span>`;

  const rows = st.orders.map((o) => `<tr>
      <td>${esc(o.code)}</td>
      <td class="muted">${esc(fmtDate(o.created_at))}</td>
      <td class="r">${esc(formatMoney(o.total, cur))}</td>
      <td class="r">${esc(formatMoney(o.commission_amount, cur))}</td>
    </tr>`).join('');

  const settlement = toPlatform
    ? `<tr class="grand"><td>Due to ${esc(s.business_name)}</td><td class="r">${esc(formatMoney(st.net_due_to_platform, cur))}</td></tr>`
    : toVendor
      ? `<tr class="grand"><td>Payable to ${esc(st.business_name)}</td><td class="r">${esc(formatMoney(st.net_due_to_vendor, cur))}</td></tr>`
      : `<tr class="grand"><td>Balance</td><td class="r">${esc(formatMoney(0, cur))}</td></tr>`;

  const body = `
    ${header(s, 'Statement', st.number || 'DRAFT', `<div class="muted" style="margin-top:6px">${esc(fmtDate(st.period_start))} – ${esc(fmtDate(st.period_end))}</div>
      <div style="margin-top:8px">${pill}</div>`)}

    <div class="cols">
      <div class="col">
        <div class="label">Vendor</div>
        <strong>${esc(st.business_name)}</strong><br>
        <span class="muted">${st.vendor_city ? esc(st.vendor_city) + '<br>' : ''}${st.vendor_whatsapp ? esc(st.vendor_whatsapp) : ''}</span>
      </div>
      <div class="col">
        <div class="label">Period</div>
        ${esc(fmtDate(st.period_start))} – ${esc(fmtDate(st.period_end))}<br>
        <span class="muted">${esc(st.order_count)} completed order${st.order_count === 1 ? '' : 's'}</span>
      </div>
      <div class="col">
        <div class="label">Commission rate</div>
        <strong>${esc(ratePct)}%</strong><br>
        <span class="muted">charged on goods only</span>
      </div>
    </div>

    ${st.orders.length ? `<table>
      <thead><tr><th>Order</th><th>Date</th><th class="r">Order total</th><th class="r">Commission</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="note">No completed orders in this period.</div>'}

    <table class="totals">
      <tr><td>Goods</td><td class="r">${esc(formatMoney(st.goods_subtotal, cur))}</td></tr>
      <tr><td>Delivery <span class="muted">(vendor's own)</span></td><td class="r">${esc(formatMoney(st.delivery_total, cur))}</td></tr>
      <tr><td>Gross sales</td><td class="r">${esc(formatMoney(st.gross_sales, cur))}</td></tr>
      ${excludedServices > 0 ? `
      <tr><td>Service work <span class="muted">(never commissioned)</span></td><td class="r">− ${esc(formatMoney(excludedServices, cur))}</td></tr>
      <tr><td>Commission base</td><td class="r">${esc(formatMoney(st.commission_base, cur))}</td></tr>` : ''}
      <tr><td>Commission @ ${esc(ratePct)}%</td><td class="r">− ${esc(formatMoney(st.commission_amount, cur))}</td></tr>
      <tr><td>Collected by vendor</td><td class="r">${esc(formatMoney(st.collected_by_vendor, cur))}</td></tr>
      ${Number(st.collected_by_platform) > 0 ? `<tr><td>Collected by platform</td><td class="r">${esc(formatMoney(st.collected_by_platform, cur))}</td></tr>` : ''}
      ${settlement}
    </table>

    ${toPlatform ? `<div class="note">
      The vendor collected payment directly from buyers, so commission for this period
      is payable to ${esc(s.business_name)}.
      ${st.payment_reference ? `<br><strong>Reference:</strong> ${esc(st.payment_reference)}` : ''}
    </div>` : ''}
    ${st.notes ? `<div class="note">${esc(st.notes)}</div>` : ''}

    <div class="foot">
      ${st.issued_at ? `Issued ${esc(fmtDate(st.issued_at))}. ` : ''}
      ${st.paid_at ? `Settled ${esc(fmtDate(st.paid_at))}. ` : ''}
      Covers delivered orders only; cancelled and in-progress orders are excluded and
      will appear on a later statement once complete.
      ${s.invoice_footer ? '<br>' + esc(s.invoice_footer) : ''}
    </div>`;

  return shell(`Statement ${st.number || 'draft'}`, body);
}
