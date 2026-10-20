/**
 * The statement email: a short, plain covering note with the PDF attached.
 *
 * Sent as a multipart message (plain text and simple HTML) so every mail app shows
 * it as a normal letter. The old version sent the whole web page as the body, which
 * is why some inboxes showed raw markup instead of a readable message.
 */
import type { PlatformSettings, StatementDoc } from './templates';
import { formatMoney } from './billing';
import { renderStatementPdf, statementSettlement } from './statementPdf';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ratePct = (rate: number | string) => (Number(rate) * 100).toFixed(2).replace(/\.00$/, '');

type StatementForEmail = StatementDoc & { business_name: string; id?: string };

export async function buildStatementEmail(st: StatementForEmail, s: PlatformSettings) {
  const { cur, direction, amount } = statementSettlement(st, s);
  const money = (v: number | string) => formatMoney(v, cur);
  const number = st.number ?? 'DRAFT';
  const period = `${fmtDate(st.period_start)} to ${fmtDate(st.period_end)}`;
  const orders = `${st.order_count} completed order${st.order_count === 1 ? '' : 's'}`;
  const rate = `${ratePct(st.commission_rate)}%`;
  const payLine =
    direction === 'to_vendor'
      ? `${money(st.net_due_to_vendor)} is payable to you for this period.`
      : direction === 'to_platform'
        ? `Commission of ${money(st.net_due_to_platform)} is payable to ${s.business_name} for this period.`
        : 'No balance is due for this period.';
  const contact = [s.business_email, s.business_phone].filter(Boolean).join(' · ');
  const subjectAmount =
    direction === 'settled' ? 'no balance due' : `${amount} ${direction === 'to_vendor' ? 'payable' : 'due'}`;
  const subject = `${s.business_name} statement ${number} (${period}) — ${subjectAmount}`;

  const text = [
    `Dear ${st.business_name},`,
    '',
    `Please find attached your statement ${number} for ${period}.`,
    '',
    'Summary',
    `- Orders: ${orders}`,
    `- Gross sales: ${money(st.gross_sales)}`,
    `- Commission (${rate}, on goods only): ${money(st.commission_amount)}`,
    '',
    payLine,
    ...(direction === 'to_platform' && st.payment_reference ? [`Payment reference: ${st.payment_reference}`] : []),
    '',
    'The attached PDF lists every order in the period and shows how the totals were calculated.',
    'Delivery fees are paid to the rider and are not included in the commission.',
    '',
    'If anything looks incorrect, reply to this email and our team will check it with you.',
    '',
    'Kind regards,',
    `${s.business_name} Billing`,
    ...(contact ? [contact] : []),
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18322A;font-size:15px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;padding:24px">
<p>Dear ${esc(st.business_name)},</p>
<p>Please find attached your statement <strong>${esc(number)}</strong> for ${esc(period)}.</p>
<p style="margin:0 0 6px"><strong>Summary</strong></p>
<ul style="margin:0 0 16px;padding-left:20px">
<li>Orders: ${esc(orders)}</li>
<li>Gross sales: ${esc(money(st.gross_sales))}</li>
<li>Commission (${esc(rate)}, on goods only): ${esc(money(st.commission_amount))}</li>
</ul>
<p>${esc(payLine)}</p>
${direction === 'to_platform' && st.payment_reference ? `<p>Payment reference: <strong>${esc(st.payment_reference)}</strong></p>` : ''}
<p>The attached PDF lists every order in the period and shows how the totals were calculated. Delivery fees are paid to the rider and are not included in the commission.</p>
<p>If anything looks incorrect, reply to this email and our team will check it with you.</p>
<p>Kind regards,<br>${esc(s.business_name)} Billing${contact ? `<br><span style="color:#5B6F67;font-size:13px">${esc(contact)}</span>` : ''}</p>
</div></body></html>`;

  const pdf = await renderStatementPdf(st, s);
  return {
    subject,
    text,
    html,
    attachments: [{ filename: `Statement-${number}.pdf`, content: pdf }],
  };
}
