import { strToU8, zipSync } from 'fflate';
import type { jsPDF } from 'jspdf';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export interface ExportReport<T> {
  /** Used for safe download filenames, without a file extension. */
  filename: string;
  /** Printed in the Excel workbook and branded PDF heading. */
  title: string;
  /** Optional context line directly beneath the title. */
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

const stamp = () => new Intl.DateTimeFormat('en-QA', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qatar',
}).format(new Date());

const cleanFilename = (value: string) => (value || 'sokoni-hub-report')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'sokoni-hub-report';

const printable = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleString('en-QA', { timeZone: 'Asia/Qatar' });
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

/** Prevent spreadsheet formula injection while preserving the visible value. */
const spreadsheetValue = (value: unknown) => {
  const text = printable(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const xml = (value: unknown) => printable(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const colName = (index: number) => {
  let current = index + 1;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
};

const sharedStringsCell = (ref: string, value: unknown, style = 0) =>
  `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

/**
 * Writes a compact, standards-compliant XLSX workbook without CSV fallbacks.
 * It deliberately uses inline strings: reports are portable and cannot carry
 * unexpected formulas from names, notes, addresses, or other user input.
 */
function workbookBytes<T>(report: ExportReport<T>): Uint8Array {
  const headers = report.columns.map((column) => column.header);
  const values = report.rows.map((row) => report.columns.map((column) => spreadsheetValue(column.value(row))));
  const widthFor = (index: number) => Math.min(44, Math.max(
    12,
    headers[index].length + 2,
    ...values.map((row) => Math.min(42, printable(row[index]).length + 2)),
  ));
  const lastColumn = colName(Math.max(0, headers.length - 1));
  const titleRow = `<row r="1" ht="26">${sharedStringsCell('A1', report.title, 1)}</row>`;
  const subtitleRow = `<row r="2" ht="18">${sharedStringsCell('A2', report.subtitle || 'Sokoni Hub operations report', 2)}</row>`;
  const createdRow = `<row r="3" ht="18">${sharedStringsCell('A3', `Generated ${stamp()} · Sokoni Hub · Qatar`, 2)}</row>`;
  const headerRow = `<row r="5">${headers.map((header, index) => sharedStringsCell(`${colName(index)}5`, header, 3)).join('')}</row>`;
  const dataRows = values.map((row, rowIndex) => {
    const rowNumber = rowIndex + 6;
    return `<row r="${rowNumber}">${row.map((value, colIndex) => sharedStringsCell(`${colName(colIndex)}${rowNumber}`, value, rowIndex % 2 === 1 ? 4 : 0)).join('')}</row>`;
  }).join('');
  const lastRow = Math.max(5, values.length + 5);
  const columns = headers.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${widthFor(index)}" customWidth="1"/>`).join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${titleRow}${subtitleRow}${createdRow}${headerRow}${dataRows}</sheetData>
  <autoFilter ref="A5:${lastColumn}${lastRow}"/>
  <mergeCells count="3"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/><mergeCell ref="A3:${lastColumn}3"/></mergeCells>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4"><font><sz val="11"/><color theme="1"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font><font><sz val="10"/><color rgb="FF5E6A72"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF126B4B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F8F5"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE5E1"/></left><right style="thin"><color rgb="FFDDE5E1"/></right><top style="thin"><color rgb="FFDDE5E1"/></top><bottom style="thin"><color rgb="FFDDE5E1"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs>
</styleSheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const createdAt = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Sokoni Hub</dc:creator><dc:title>${xml(report.title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Sokoni Hub</Application></Properties>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(styles),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  }, { level: 6 });
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function exportExcel<T>(report: ExportReport<T>) {
  // Copy into a browser-owned ArrayBuffer; TypeScript correctly treats fflate's
  // backing store as potentially shared, which Blob does not accept directly.
  const bytes = workbookBytes(report);
  const buffer = new Uint8Array(bytes).buffer as ArrayBuffer;
  save(new Blob([buffer], { type: XLSX_MIME }), `${cleanFilename(report.filename)}.xlsx`);
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addPdfBranding(doc: jsPDF, title: string, subtitle?: string, logo?: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 92, 66);
  doc.rect(0, 0, pageWidth, 35, 'F');
  if (logo) {
    try { doc.addImage(logo, 'PNG', 13, 8.5, 18, 18); } catch { /* fallback wordmark remains */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Sokoni Hub', logo ? 36 : 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Marketplace operations', logo ? 36 : 14, 22);
  doc.setTextColor(33, 42, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 45);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(91, 103, 111);
    doc.setFontSize(9);
    doc.text(subtitle, 14, 51);
  }
  doc.setDrawColor(221, 229, 225);
  doc.line(14, subtitle ? 55 : 50, pageWidth - 14, subtitle ? 55 : 50);
}

/** Generates a print-ready, branded PDF with a Sokoni Hub header and footer. */
export async function exportPdf<T>(report: ExportReport<T>) {
  // PDF rendering code loads only when a user chooses PDF, rather than adding
  // its image/canvas support to the marketplace's normal dashboard bundle.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const landscape = report.columns.length > 5;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const logo = await logoDataUrl();
  const body = report.rows.map((row) => report.columns.map((column) => printable(column.value(row))));
  const top = report.subtitle ? 60 : 55;
  addPdfBranding(doc, report.title, report.subtitle, logo);

  autoTable(doc, {
    startY: top,
    head: [report.columns.map((column) => column.header)],
    body,
    margin: { top, left: 14, right: 14, bottom: 18 },
    styles: { font: 'helvetica', fontSize: landscape ? 7.5 : 8.5, cellPadding: 2.1, textColor: [35, 44, 49], lineColor: [221, 229, 225], lineWidth: 0.1 },
    headStyles: { fillColor: [18, 107, 75], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [246, 249, 247] },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) addPdfBranding(doc, report.title, report.subtitle, logo);
      const height = doc.internal.pageSize.getHeight();
      const width = doc.internal.pageSize.getWidth();
      doc.setDrawColor(221, 229, 225);
      doc.line(14, height - 12, width - 14, height - 12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(91, 103, 111);
      doc.setFontSize(7.5);
      doc.text(`Generated ${stamp()} · Confidential dashboard report`, 14, height - 7);
      doc.text(`Page ${data.pageNumber}`, width - 14, height - 7, { align: 'right' });
    },
  });
  save(doc.output('blob'), `${cleanFilename(report.filename)}.pdf`);
}
