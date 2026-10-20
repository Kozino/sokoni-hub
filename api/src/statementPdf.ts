/**
 * Vendor statement as a PDF.
 *
 * Generated on the server so the same file serves the admin download, the
 * vendor download and the email attachment. Browser "Print / Save as PDF" depends
 * on the browser and the popup; this does not.
 */
import PDFDocument from 'pdfkit';
import { formatMoney } from './billing';
import type { PlatformSettings, StatementDoc } from './templates';

const INK = '#18322A';
const MUTED = '#5B6F67';
const EMERALD = '#006C56';
const LINE = '#D8E6DF';

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ratePct = (rate: number | string) => (Number(rate) * 100).toFixed(2).replace(/\.00$/, '');

/** What the statement settles: the platform's commission, or the vendor's payout. */
export function statementSettlement(st: StatementDoc, s: PlatformSettings) {
  const cur = st.currency || s.currency;
  const toPlatform = Number(st.net_due_to_platform) > 0;
  const toVendor = Number(st.net_due_to_vendor) > 0;
  const amount = toPlatform ? st.net_due_to_platform : toVendor ? st.net_due_to_vendor : 0;
  return {
    cur,
    direction: toPlatform ? ('to_platform' as const) : toVendor ? ('to_vendor' as const) : ('settled' as const),
    amount: formatMoney(amount, cur),
  };
}

export function renderStatementPdf(st: StatementDoc & { business_name: string; vendor_city?: string | null; vendor_whatsapp?: string | null }, s: PlatformSettings): Promise<Buffer> {
  const { cur, direction } = statementSettlement(st, s);
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true, // needed to write "Page x of y" in the footer
    info: { Title: `Statement ${st.number ?? 'DRAFT'}`, Author: s.business_name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const bottom = doc.page.height - 80;

  // ---- Header -------------------------------------------------------------
  doc.fillColor(EMERALD).font('Helvetica-Bold').fontSize(18).text(s.business_name || 'Sokoni Hub', left, 50, { width: width * 0.6 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  const contact = [s.business_address, s.business_email, s.business_phone].filter(Boolean) as string[];
  contact.forEach((line) => doc.text(line, left, doc.y, { width: width * 0.6 }));
  if (s.cr_number) doc.text(`CR: ${s.cr_number}`, left, doc.y, { width: width * 0.6 });

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('STATEMENT', left, 50, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
    .text(`No. ${st.number ?? 'DRAFT'}`, left, doc.y + 2, { width, align: 'right' })
    .text(`Status: ${st.status === 'paid' ? 'Paid' : st.status === 'void' ? 'Void' : st.status === 'draft' ? 'Draft' : 'Outstanding'}`, left, doc.y, { width, align: 'right' });

  doc.moveTo(left, Math.max(doc.y, 130) + 12).lineTo(right, Math.max(doc.y, 130) + 12).strokeColor(LINE).lineWidth(1).stroke();

  // ---- Vendor and period --------------------------------------------------
  let y = Math.max(doc.y, 130) + 30;
  const colW = width / 3;
  const block = (label: string, lines: string[], x: number) => {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, { width: colW - 12 });
    let ly = doc.y + 4;
    lines.forEach((t, i) => {
      doc.fillColor(INK).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(t, x, ly, { width: colW - 12 });
      ly = doc.y + 2;
    });
    return ly;
  };
  const yA = block('Vendor', [st.business_name, ...(st.vendor_city ? [st.vendor_city] : []), ...(st.vendor_whatsapp ? [st.vendor_whatsapp] : [])], left);
  const yB = block('Period', [`${fmtDate(st.period_start)} – ${fmtDate(st.period_end)}`, `${st.order_count} completed order${st.order_count === 1 ? '' : 's'}`], left + colW);
  const yC = block('Commission rate', [`${ratePct(st.commission_rate)}%`, 'charged on goods only'], left + colW * 2);
  y = Math.max(yA, yB, yC) + 18;

  // ---- Orders table -------------------------------------------------------
  const cols = { order: left, date: left + width * 0.34, sales: left + width * 0.62, comm: left + width * 0.8 };
  const colWidth = { order: width * 0.3, date: width * 0.26, sales: width * 0.16, comm: width * 0.2 };
  const header = () => {
    doc.rect(left, y, width, 20).fill('#EEF6F2');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
    doc.text('Order', cols.order + 6, y + 6, { width: colWidth.order });
    doc.text('Date', cols.date, y + 6, { width: colWidth.date });
    doc.text('Sales', cols.sales, y + 6, { width: colWidth.sales, align: 'right' });
    doc.text('Commission', cols.comm, y + 6, { width: colWidth.comm - 6, align: 'right' });
    y += 24;
  };
  header();
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  if (st.orders.length === 0) {
    doc.fillColor(MUTED).text('No completed orders in this period.', left + 6, y, { width });
    y = doc.y + 14;
  }
  for (const o of st.orders) {
    if (y > bottom - 40) {
      doc.addPage();
      y = 50;
      header();
      doc.font('Helvetica').fontSize(9).fillColor(INK);
    }
    doc.text(o.code, cols.order + 6, y, { width: colWidth.order });
    doc.fillColor(MUTED).text(fmtDate(o.created_at), cols.date, y, { width: colWidth.date });
    doc.fillColor(INK).text(formatMoney(o.total, cur), cols.sales, y, { width: colWidth.sales, align: 'right' });
    doc.text(formatMoney(o.commission_amount, cur), cols.comm, y, { width: colWidth.comm - 6, align: 'right' });
    y += 18;
    doc.moveTo(left, y - 5).lineTo(right, y - 5).strokeColor(LINE).lineWidth(0.5).stroke();
  }

  // ---- Totals -------------------------------------------------------------
  const excluded = Math.round((Number(st.goods_subtotal) - Number(st.commission_base)) * 100) / 100;
  const rows: [string, string, boolean?][] = [
    ['Goods', formatMoney(st.goods_subtotal, cur)],
    ['Delivery fees (paid to riders, not included above)', formatMoney(st.delivery_total, cur)],
    ['Gross sales', formatMoney(st.gross_sales, cur)],
  ];
  if (excluded > 0) {
    rows.push(['Service work (never commissioned)', `- ${formatMoney(excluded, cur)}`]);
    rows.push(['Commission base', formatMoney(st.commission_base, cur)]);
  }
  rows.push([`Commission @ ${ratePct(st.commission_rate)}%`, `- ${formatMoney(st.commission_amount, cur)}`]);
  rows.push(['Collected by vendor', formatMoney(st.collected_by_vendor, cur)]);
  if (Number(st.collected_by_platform) > 0) rows.push(['Collected by platform', formatMoney(st.collected_by_platform, cur)]);

  const settleLabel =
    direction === 'to_platform' ? `Due to ${s.business_name}`
    : direction === 'to_vendor' ? `Payable to ${st.business_name}`
    : 'Balance';
  rows.push([settleLabel, formatMoney(direction === 'settled' ? 0 : direction === 'to_platform' ? st.net_due_to_platform : st.net_due_to_vendor, cur), true]);

  if (y > bottom - rows.length * 18 - 20) { doc.addPage(); y = 50; }
  y += 14;
  for (const [label, value, strong] of rows) {
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 9.5).fillColor(strong ? EMERALD : INK);
    const labelH = doc.heightOfString(label, { width: width * 0.36 });
    doc.text(label, left + width * 0.42, y, { width: width * 0.36 });
    doc.text(value, left + width * 0.78, y, { width: width * 0.22, align: 'right' });
    // Advance by the label's real height, so a wrapped label never overlaps the next row.
    y += Math.max(labelH, strong ? 14 : 11) + (strong ? 8 : 5);
  }

  // ---- Notes --------------------------------------------------------------
  const notes: string[] = [];
  if (direction === 'to_platform') {
    notes.push(`The vendor collected payment directly from buyers, so commission for this period is payable to ${s.business_name}.`);
    if (st.payment_reference) notes.push(`Payment reference: ${st.payment_reference}`);
  }
  if (st.notes) notes.push(st.notes);
  if (notes.length) {
    y += 10;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    for (const n of notes) {
      if (y > bottom) { doc.addPage(); y = 50; }
      doc.text(n, left, y, { width });
      y = doc.y + 6;
    }
  }

  // ---- Footer on every page ----------------------------------------------
  // The footer sits inside the bottom margin. Lift the margin while writing it, or
  // PDFKit starts a new blank page for every footer line.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // per page: each buffered page keeps its own margins
    const fy = doc.page.height - 45;
    doc.moveTo(left, fy - 8).lineTo(right, fy - 8).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(s.invoice_footer || `${s.business_name} · Statement ${st.number ?? 'DRAFT'}`, left, fy, { width: width - 60, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left, fy, { width, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
