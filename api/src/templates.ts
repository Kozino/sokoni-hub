/**
 * Printable documents: buyer receipts and vendor commission statements.
 *
 * Plain server-rendered HTML with inline CSS and an @media print block, rather
 * than a PDF library. The browser version prints to PDF via Ctrl/Cmd+P without
 * a dependency or build step. The compact email-safe receipt renderer below is
 * intentionally separate because mailbox clients do not support browser HTML
 * features such as scripts or large data-URI images.
 */

import { formatMoney } from './billing';
import { sokoniLogoDataUrl } from './sokoniBrand';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const EMERALD = '#006C56';
const DEEP_EMERALD = '#004E40';
const ORANGE = '#FF7A00';

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
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:28px 16px;background:#EEF4F1;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       color:#16231F;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .actions{max-width:780px;margin:0 auto 14px;display:flex;justify-content:flex-end;gap:8px}
  .btn{appearance:none;background:${EMERALD};color:#fff;border:0;padding:10px 18px;border-radius:8px;
       font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 5px rgba(0,78,64,.18)}
  .btn:hover{background:${DEEP_EMERALD}}
  .sheet{max-width:780px;margin:0 auto;background:#fff;padding:42px;
         border:1px solid #D8E6DF;border-radius:14px;box-shadow:0 12px 30px rgba(0,60,45,.10)}
  .head{position:relative;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;
        padding-bottom:22px;margin-bottom:28px;border-bottom:1px solid #D8E6DF}
  .head:after{content:"";position:absolute;left:0;bottom:-1px;width:152px;height:4px;border-radius:4px;
              background:linear-gradient(90deg,${EMERALD} 0 72%,${ORANGE} 72%)}
  .sokoni-logo{display:block;width:205px;height:auto;margin:0 0 10px}
  .brand{font-size:14px;font-weight:800;letter-spacing:.02em;color:${DEEP_EMERALD};margin:0 0 3px}
  .brand-sub{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#71817A;font-weight:700;margin:0 0 10px}
  .muted{color:#62716B;font-size:13px}
  .doctype{text-align:right;min-width:150px}
  .doctype h2{margin:0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${EMERALD};font-weight:800}
  .docnum{font-size:20px;font-weight:800;color:#182B24;margin-top:4px;letter-spacing:.02em}
  .cols{display:flex;flex-wrap:wrap;gap:26px;margin-bottom:28px}
  .col{flex:1;min-width:190px}
  .label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#71817A;font-weight:800;margin-bottom:7px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px}
  th{text-align:left;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:${DEEP_EMERALD};
     background:#F0F7F3;border-bottom:2px solid #CDE2D8;padding:10px;font-weight:800}
  td{padding:11px 10px;border-bottom:1px solid #E7EFEB;vertical-align:top}
  tbody tr:nth-child(even){background:#FBFDFC}
  .r{text-align:right;white-space:nowrap}
  .totals{margin-left:auto;width:min(330px,100%)}
  .totals td{border:none;padding:7px 10px;background:transparent}
  .totals .grand td{border-top:2px solid ${EMERALD};font-weight:800;font-size:17px;padding-top:13px;color:${DEEP_EMERALD}}
  .pill{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.02em}
  .pill-paid{background:#DDF5E7;color:#166534}
  .pill-due{background:#FFF0D8;color:#9A4E00}
  .pill-void{background:#F1F4F2;color:#63736B}
  .note{background:#FFF8EC;border-left:4px solid ${ORANGE};padding:12px 16px;font-size:13px;margin-bottom:20px}
  .foot{margin-top:30px;padding-top:17px;border-top:1px solid #D8E6DF;font-size:12px;color:#62716B}
  .foot strong{color:${DEEP_EMERALD}}
  @media(max-width:620px){
    body{padding:0;background:#fff}.actions{padding:12px 14px;margin:0}.sheet{padding:26px 20px;border:0;border-radius:0;box-shadow:none}
    .head{gap:18px;flex-direction:column}.doctype{text-align:left}.cols{gap:20px}.col{min-width:100%}.sokoni-logo{width:185px}
  }
  @media print{
    body{background:#fff;padding:0}.sheet{box-shadow:none;border:0;border-radius:0;max-width:none;padding:0}.actions{display:none}
    @page{margin:14mm}
  }
</style></head>
<body>
<div class="actions"><button id="print-document" class="btn" type="button">Print / Save as PDF</button></div>
<div class="sheet">${body}</div>
<script>
  (function(){
    var button=document.getElementById('print-document');
    if(button) button.addEventListener('click',function(){ window.print(); });
  }());
</script>
</body></html>`;
}

function header(s: PlatformSettings, docType: string, docNumber: string, extra = '') {
  return `<div class="head">
    <div>
      <img class="sokoni-logo" src="${sokoniLogoDataUrl}" width="205" height="85" alt="Sokoni Hub">
      <p class="brand">${esc(s.business_name || 'Sokoni Hub')}</p>
      <p class="brand-sub">Marketplace ${esc(docType).toLowerCase()}</p>
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

/**
 * Email-safe version of a delivered-order receipt.
 *
 * This deliberately does not reuse receiptHtml(): email clients strip scripts,
 * handle document-level CSS inconsistently, and do not reliably support large
 * data-URI images. Those behaviours can turn an embedded logo into visible
 * base64/HTML source. The browser receipt remains printable; this function is
 * intentionally composed only of small, inline-styled email HTML.
 */
export function receiptEmailHtml(o: ReceiptOrder, s: PlatformSettings): string {
  const cur = o.currency || s.currency;
  const rows = o.items.map((i) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e4ece8;color:#18322a">${esc(i.title)}${i.unit ? ` <span style="color:#6d7e76;font-size:12px">(${esc(i.unit)})</span>` : ''}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e4ece8;text-align:center;color:#18322a">${esc(i.qty)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e4ece8;text-align:right;color:#18322a;white-space:nowrap">${esc(formatMoney(i.line_total, cur))}</td>
    </tr>`).join('');
  const address = [o.delivery_address, o.city, o.country].filter(Boolean).map(esc).join(', ');
  const deliveryLabel = o.fulfilment_mode === 'pickup' ? 'Collection' : 'Delivery';

  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px 12px;background:#edf4f0;font-family:Arial,Helvetica,sans-serif;color:#18322a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #d8e6df;border-radius:12px;overflow:hidden">
      <tr><td style="padding:24px 28px;background:#006c56;color:#ffffff">
        <div style="font-size:25px;line-height:1;font-weight:800;letter-spacing:-.5px">Sokoni<span style="color:#ff9b35">Hub</span></div>
        <div style="margin-top:7px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;opacity:.86">Delivered-order receipt</div>
      </td></tr>
      <tr><td style="padding:29px 28px">
        <h1 style="margin:0 0 9px;font-size:23px;line-height:1.3;color:#004e40">Your order has been delivered</h1>
        <p style="margin:0 0 22px;color:#49645a;line-height:1.55">Thank you for shopping with ${esc(o.business_name)}. Keep this receipt for your records.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f4f8f6;border:1px solid #d8e6df;border-radius:8px">
          <tr><td style="padding:12px 14px;border-bottom:1px solid #d8e6df;color:#6d7e76;font-size:12px">RECEIPT</td><td style="padding:12px 14px;border-bottom:1px solid #d8e6df;text-align:right;font-weight:700">${esc(o.receipt_number)}</td></tr>
          <tr><td style="padding:12px 14px;border-bottom:1px solid #d8e6df;color:#6d7e76;font-size:12px">ORDER</td><td style="padding:12px 14px;border-bottom:1px solid #d8e6df;text-align:right;font-weight:700">${esc(o.code)}</td></tr>
          <tr><td style="padding:12px 14px;color:#6d7e76;font-size:12px">ISSUED</td><td style="padding:12px 14px;text-align:right">${esc(fmtDate(o.receipt_issued_at))}</td></tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 23px">
          <tr><td style="width:50%;padding:0 12px 0 0;vertical-align:top"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#6d7e76">BILLED TO</div><p style="margin:6px 0 0;line-height:1.55"><strong>${esc(o.contact_name)}</strong><br>${esc(o.contact_phone)}${address ? `<br>${address}` : ''}</p></td><td style="width:50%;padding:0 0 0 12px;vertical-align:top"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#6d7e76">SOLD BY</div><p style="margin:6px 0 0;line-height:1.55"><strong>${esc(o.business_name)}</strong>${o.vendor_whatsapp ? `<br>${esc(o.vendor_whatsapp)}` : ''}</p></td></tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 20px">
          <thead><tr><th style="padding:10px 8px;background:#f0f7f3;border-bottom:2px solid #cde2d8;text-align:left;font-size:11px;color:#004e40">ITEM</th><th style="padding:10px 8px;background:#f0f7f3;border-bottom:2px solid #cde2d8;text-align:center;font-size:11px;color:#004e40">QTY</th><th style="padding:10px 8px;background:#f0f7f3;border-bottom:2px solid #cde2d8;text-align:right;font-size:11px;color:#004e40">AMOUNT</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 4px">
          <tr><td style="padding:5px 0;color:#49645a">Subtotal</td><td style="padding:5px 0;text-align:right">${esc(formatMoney(o.subtotal, cur))}</td></tr>
          <tr><td style="padding:5px 0;color:#49645a">${esc(deliveryLabel)}</td><td style="padding:5px 0;text-align:right">${Number(o.delivery_fee) === 0 ? 'Free' : esc(formatMoney(o.delivery_fee, cur))}</td></tr>
          <tr><td style="padding:13px 0 4px;border-top:2px solid #006c56;font-size:17px;font-weight:800;color:#004e40">Total</td><td style="padding:13px 0 4px;border-top:2px solid #006c56;text-align:right;font-size:17px;font-weight:800;color:#004e40">${esc(formatMoney(o.total, cur))}</td></tr>
        </table>
        <p style="margin:24px 0 0;color:#6d7e76;font-size:12px;line-height:1.5">Payment is made directly to the vendor. This receipt confirms that the order was marked delivered.</p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #d8e6df;color:#6d7e76;font-size:12px;line-height:1.45">Sokoni Hub · Doha, Qatar<br>For your security, never share your password, PIN, or verification links.</td></tr>
    </table>
  </body></html>`;
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
