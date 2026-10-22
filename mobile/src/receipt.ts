/**
 * Builds the HTML for a PDF order receipt. Pure function: no network, no native modules, so it can be previewed in
 * any browser. Every value comes from the order the API returned; empty values simply drop their row.
 */
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from './config';
import { fullDateTime, money } from './format';
import { RECEIPT_LOGO } from './receiptLogo';
import type { Order, OrderLine } from './types';

export type ReceiptInput = {
  order: Order;
  items: OrderLine[];
  sellerName: string;
  sellerPhone?: string | null;
  buyerName: string;
  buyerPhone: string;
  generatedAt?: Date;
};

const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const digits = (value?: string | null) => String(value ?? '').replace(/\D/g, '');
const prettyPhone = (value?: string | null) => {
  const d = digits(value);
  return d.length === 11 && d.startsWith('974') ? `+974 ${d.slice(3, 7)} ${d.slice(7)}` : d ? `+${d}` : '';
};

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending: { label: 'Awaiting seller', fg: '#B45F06', bg: '#FFF2DF' },
  confirmed: { label: 'Seller preparing', fg: '#B45F06', bg: '#FFF0E2' },
  dispatched: { label: 'Seller preparing', fg: '#B45F06', bg: '#FFF0E2' },
  dispatched_to_driver: { label: 'Rider assigned', fg: '#05663F', bg: '#E1F7E9' },
  driver_arrived: { label: 'Rider at the store', fg: '#05663F', bg: '#E1F7E9' },
  out_for_delivery: { label: 'On the way', fg: '#05663F', bg: '#E1F7E9' },
  delivered_pending_verification: { label: 'Awaiting confirmation', fg: '#B45F06', bg: '#FFF2DF' },
  delivered: { label: 'Delivered', fg: '#05663F', bg: '#E1F7E9' },
  cancelled: { label: 'Cancelled', fg: '#BA1A1A', bg: '#FDEBEC' },
};

export function receiptNumber(order: Order) {
  return order.receipt_number || order.code;
}

export function buildReceiptHtml(input: ReceiptInput): string {
  const { order, items, sellerName, sellerPhone, buyerName, buyerPhone } = input;
  const currency = order.currency || 'QAR';
  const pickup = order.fulfilment_mode === 'pickup';
  const paid = order.payment_status === 'paid';
  const cancelled = order.status === 'cancelled';
  const status = STATUS[order.status] ?? { label: order.status.replace(/_/g, ' '), fg: '#4B5563', bg: '#EEF0F6' };
  const fee = Number(order.delivery_fee || 0);
  const generated = fullDateTime((input.generatedAt ?? new Date()).toISOString());
  const stamp = cancelled
    ? { text: 'CANCELLED', fg: '#BA1A1A', bg: '#FDEBEC', note: 'No payment is due' }
    : paid
      ? { text: 'PAID', fg: '#05663F', bg: '#E1F7E9', note: 'Payment received by the seller' }
      : { text: 'CASH ON DELIVERY', fg: '#B45F06', bg: '#FFF0E2', note: pickup ? 'Pay the seller when you collect' : 'Pay the seller when you receive' };

  const rows = items.length
    ? items.map((line, i) => `
        <tr class="${i % 2 ? 'alt' : ''}">
          <td class="item">${esc(line.title)}${line.unit ? `<span class="unit"> / ${esc(line.unit)}</span>` : ''}</td>
          <td class="c">${esc(line.qty)}</td>
          <td class="r">${esc(money(line.unit_price ?? Number(line.line_total) / Math.max(1, Number(line.qty)), currency))}</td>
          <td class="r b">${esc(money(line.line_total, currency))}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">Item details were not available when this receipt was created.</td></tr>`;

  const detail = (label: string, value?: string | null, strong = false) => (value ? `<div class="kv"><span>${esc(label)}</span><b${strong ? ' class="strong"' : ''}>${esc(value)}</b></div>` : '');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(receiptNumber(order))}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 595px; font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', Roboto, Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.45; background: #FFFFFF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { background: linear-gradient(135deg, #004C2D 0%, #05663F 62%, #08715B 100%); color: #fff; padding: 26px 32px 54px; position: relative; overflow: hidden; }
  .head:before { content: ''; position: absolute; right: -60px; top: -80px; width: 230px; height: 230px; border-radius: 50%; background: rgba(255,255,255,.08); }
  .bar { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .logo { width: 46px; height: 46px; border-radius: 14px; background: #fff; display: flex; align-items: center; justify-content: center; }
  .logo img { width: 36px; height: 36px; }
  .name { font-size: 21px; font-weight: 800; letter-spacing: -.4px; line-height: 1.1; }
  .name em { font-style: normal; color: #FFB36B; }
  .tag { font-size: 10px; color: #CFEBDC; margin-top: 3px; }
  .rcpt { text-align: right; }
  .rcpt small { display: block; font-size: 9px; letter-spacing: 2px; color: #CFEBDC; font-weight: 700; }
  .rcpt strong { display: block; font-size: 19px; letter-spacing: -.3px; margin-top: 2px; }
  .rcpt span { display: block; font-size: 10px; color: #CFEBDC; margin-top: 2px; }
  .wrap { padding: 0 32px 24px; margin-top: -30px; position: relative; z-index: 2; }
  .stats { display: flex; gap: 10px; }
  .stat { flex: 1; background: #fff; border-radius: 14px; padding: 11px 13px; border: 1px solid #E8EAF3; box-shadow: 0 6px 18px rgba(27,42,74,.10); }
  .stat small { display: block; font-size: 8.5px; letter-spacing: 1.2px; color: #6B7280; font-weight: 700; text-transform: uppercase; }
  .stat b { display: block; font-size: 15px; margin-top: 3px; letter-spacing: -.2px; }
  .pill { display: inline-block; border-radius: 99px; padding: 3px 10px; font-size: 10.5px; font-weight: 700; margin-top: 2px; }
  .cols { display: flex; gap: 10px; margin-top: 14px; }
  .card { flex: 1; border: 1px solid #E8EAF3; border-radius: 14px; padding: 12px 14px; background: #FBFBFF; }
  .card h4 { margin: 0 0 8px; font-size: 9px; letter-spacing: 1.4px; color: #05663F; text-transform: uppercase; }
  .kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px dashed #E5E7EB; }
  .kv:last-child { border-bottom: 0; }
  .kv span { color: #6B7280; flex-shrink: 0; }
  .kv b { text-align: right; font-weight: 600; white-space: nowrap; }
  .kv b.strong { color: #05663F; }
  .party { margin-bottom: 8px; }
  .party small { display: block; font-size: 8.5px; letter-spacing: 1.2px; color: #6B7280; font-weight: 700; text-transform: uppercase; }
  .party b { display: block; font-size: 12px; margin-top: 1px; }
  .party span { display: block; color: #4B5563; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; border-radius: 12px; overflow: hidden; }
  thead th { background: #05663F; color: #fff; font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase; padding: 8px 10px; text-align: left; }
  th.c, td.c { text-align: center; } th.r, td.r { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #EEF0F6; }
  tr.alt td { background: #F7F8FF; }
  td.item { font-weight: 600; } td.item .unit { color: #6B7280; font-weight: 400; }
  td.b { font-weight: 700; }
  td.empty { color: #6B7280; text-align: center; padding: 16px; }
  .totals { margin-top: 12px; margin-left: auto; width: 260px; }
  .totals .line { display: flex; justify-content: space-between; padding: 4px 2px; color: #4B5563; }
  .totals .line b { color: #111827; font-weight: 600; }
  .grand { margin-top: 6px; background: linear-gradient(135deg, #E1F7E9, #D2F1DE); border: 1px solid #BDE9CE; border-radius: 12px; padding: 10px 13px; display: flex; justify-content: space-between; align-items: center; }
  .grand span { font-size: 11px; font-weight: 700; color: #034D30; }
  .grand b { font-size: 20px; letter-spacing: -.4px; color: #05663F; }
  .stamp { margin-top: 14px; border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; }
  .stamp b { font-size: 12px; letter-spacing: 1.4px; }
  .stamp span { font-size: 10.5px; }
  .note { margin-top: 12px; background: #FFF8EC; border: 1px solid #FFE1B8; border-radius: 12px; padding: 9px 12px; color: #7A4B00; }
  .note b { color: #974800; }
  .thanks { margin-top: 18px; text-align: center; }
  .thanks h3 { margin: 0; font-size: 14px; color: #05663F; letter-spacing: -.2px; }
  .thanks p { margin: 4px 0 0; color: #4B5563; }
  .foot { margin-top: 14px; padding-top: 10px; border-top: 1px solid #E8EAF3; display: flex; justify-content: space-between; gap: 18px; color: #6B7280; font-size: 9.5px; }
  .foot b { color: #111827; }
  .legal { margin-top: 8px; color: #9CA3AF; font-size: 8.5px; line-height: 1.4; }
</style></head>
<body>
  <div class="head">
    <div class="bar">
      <div class="brand">
        <div class="logo"><img src="${RECEIPT_LOGO}" alt="" /></div>
        <div><div class="name">Sokoni <em>Hub</em></div><div class="tag">Local commerce, made simple</div></div>
      </div>
      <div class="rcpt"><small>RECEIPT</small><strong>${esc(receiptNumber(order))}</strong><span>${esc(fullDateTime(order.created_at))}</span></div>
    </div>
  </div>
  <div class="wrap">
    <div class="stats">
      <div class="stat"><small>Order code</small><b>${esc(order.code)}</b></div>
      <div class="stat"><small>Status</small><span class="pill" style="background:${status.bg};color:${status.fg}">${esc(status.label)}</span></div>
      <div class="stat"><small>Total</small><b style="color:#05663F">${esc(money(order.total, currency))}</b></div>
    </div>

    <div class="cols">
      <div class="card">
        <h4>Order details</h4>
        ${detail('Placed on', fullDateTime(order.created_at, true))}
        ${order.delivered_at ? detail(pickup ? 'Collected' : 'Delivered', fullDateTime(order.delivered_at, true)) : ''}
        ${detail('Fulfilment', pickup ? 'Pick up from the store' : 'Home delivery')}
        ${detail('Payment', `Cash on delivery · ${paid ? 'Paid' : cancelled ? 'Not charged' : 'To pay'}`)}
        ${order.receipt_number ? detail('Receipt no.', order.receipt_number, true) : ''}
      </div>
      <div class="card">
        <h4>Seller &amp; buyer</h4>
        <div class="party"><small>Seller</small><b>${esc(sellerName || 'Seller')}</b>${sellerPhone ? `<span>${esc(prettyPhone(sellerPhone))}</span>` : ''}</div>
        <div class="party"><small>Buyer</small><b>${esc(buyerName)}</b>${buyerPhone ? `<span>${esc(prettyPhone(buyerPhone) || buyerPhone)}</span>` : ''}</div>
        <div class="party" style="margin-bottom:0"><small>${pickup ? 'Collection' : 'Deliver to'}</small>${pickup ? '<b>Collect from the store</b>' : `<b>${esc([order.delivery_address, order.city].filter(Boolean).join(', '))}</b>${order.country ? `<span>${esc(order.country)}</span>` : ''}`}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="line"><span>Subtotal</span><b>${esc(money(order.subtotal, currency))}</b></div>
      <div class="line"><span>${pickup ? 'Collection' : 'Delivery fee'}</span><b>${fee > 0 ? esc(money(fee, currency)) : 'Free'}</b></div>
      <div class="grand"><span>Total</span><b>${esc(money(order.total, currency))}</b></div>
    </div>

    <div class="stamp" style="background:${stamp.bg};color:${stamp.fg}"><b>${stamp.text}</b><span>${esc(stamp.note)}</span></div>
    ${order.note ? `<div class="note"><b>Note to the seller:</b> ${esc(order.note)}</div>` : ''}

    <div class="thanks">
      <h3>Thank you for shopping on Sokoni Hub</h3>
      <p>Keep this receipt with your order. Quote the order code if you contact the seller or support.</p>
    </div>
    <div class="foot">
      <div><b>Need help?</b><br>${esc(SUPPORT_EMAIL)}<br>WhatsApp ${esc(prettyPhone(SUPPORT_WHATSAPP))}</div>
      <div style="text-align:right"><b>Generated</b><br>${esc(generated)}<br>Prices in ${esc(currency)}</div>
    </div>
    <div class="legal">Sokoni Hub is a marketplace intermediary. Orders are agreed and paid directly between the buyer and the seller; Sokoni Hub does not hold or process buyers' funds. This receipt summarises the order details recorded on Sokoni Hub.</div>
  </div>
</body></html>`;
}
