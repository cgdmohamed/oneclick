import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  number: string;
  issue_date: string | Date;
  due_date?: string | Date | null;
  status: string;
  currency: string;
  subtotal: number; vat_amount: number; discount: number;
  total: number; paid: number; remaining: number;
  notes?: string | null;
  company: { name: string; address?: string | null; tax_number?: string | null; phone?: string | null };
  client:  { name: string; email?: string | null; phone?: string | null; tax_number?: string | null };
  items: Array<{ description: string; quantity: number; unit_price: number; line_total: number }>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Try to locate an Arabic-capable font. We ship Cairo with the repo under
 * backend/assets/fonts, but production deployments can also drop a font at
 * the same path. If neither is found we fall back to Helvetica with a
 * single warning and Arabic glyphs render as boxes (LOC-01).
 */
function resolveArabicFont(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts/Cairo-Regular.ttf'),
    path.resolve(__dirname, '../assets/fonts/Cairo-Regular.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/Cairo-Regular.ttf'),
    process.env.PDF_FONT_PATH ?? '',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p; } catch { /* ignore */ }
  }
  return null;
}
const ARABIC_FONT_PATH = resolveArabicFont();
const ARABIC_FONT = 'AppFont';
let warnedNoFont = false;

const fmt = (n: number, c = 'SAR') => `${Number(n).toFixed(2)} ${c}`;

/**
 * Detect any character in the Arabic Unicode blocks. Used to flip alignment
 * to right for individual cells (LOC-02). Full bi-di shaping for connected
 * letterforms still requires a HarfBuzz-backed renderer; for invoices with
 * separated words this approximation is acceptable.
 */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const hasArabic = (s: unknown) => typeof s === 'string' && ARABIC_RE.test(s);

/** Render an invoice PDF and resolve a Buffer. */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (ARABIC_FONT_PATH) {
        doc.registerFont(ARABIC_FONT, ARABIC_FONT_PATH);
        doc.font(ARABIC_FONT);
      } else if (!warnedNoFont) {
        warnedNoFont = true;
        // eslint-disable-next-line no-console
        console.warn('[pdf] no Arabic font found; Arabic text will render as boxes. Place Cairo-Regular.ttf in backend/assets/fonts/.');
      }

      const text = (s: string, x: number | undefined, y: number | undefined, opts: PDFKit.Mixins.TextOptions = {}) => {
        const align = opts.align ?? (hasArabic(s) ? 'right' : 'left');
        if (x === undefined || y === undefined) return doc.text(s, { ...opts, align });
        return doc.text(s, x, y, { ...opts, align });
      };

      // Header
      doc.fontSize(20);
      text(data.company.name, undefined, undefined, { align: hasArabic(data.company.name) ? 'right' : 'left' });
      doc.fontSize(10).fillColor('#666');
      if (data.company.address) text(data.company.address, undefined, undefined);
      if (data.company.phone) text(data.company.phone, undefined, undefined);
      if (data.company.tax_number) text(`Tax #: ${data.company.tax_number}`, undefined, undefined);

      doc.moveUp(4);
      doc.fillColor('#111').fontSize(14).text('TAX INVOICE', { align: 'right' });
      doc.fontSize(11).text(`# ${data.number}`, { align: 'right' });
      doc.fontSize(9).fillColor('#666').text(`Status: ${data.status}`, { align: 'right' });
      doc.moveDown(2);

      // Bill to
      doc.fillColor('#111').fontSize(11).text('Bill To:');
      doc.fontSize(10);
      text(data.client.name, undefined, undefined);
      if (data.client.email) text(data.client.email, undefined, undefined);
      if (data.client.phone) text(data.client.phone, undefined, undefined);
      if (data.client.tax_number) text(`Tax #: ${data.client.tax_number}`, undefined, undefined);

      doc.moveDown();
      doc.text(`Issue date: ${new Date(data.issue_date).toISOString().slice(0, 10)}`);
      if (data.due_date) doc.text(`Due date: ${new Date(data.due_date).toISOString().slice(0, 10)}`);
      doc.moveDown();

      // Items table
      const tableTop = doc.y;
      const cols = { desc: 48, qty: 320, price: 380, total: 470 };
      doc.fontSize(10).fillColor('#111');
      doc.text('Description', cols.desc, tableTop);
      doc.text('Qty',   cols.qty,   tableTop, { width: 50, align: 'right' });
      doc.text('Unit',  cols.price, tableTop, { width: 70, align: 'right' });
      doc.text('Total', cols.total, tableTop, { width: 80, align: 'right' });
      doc.moveTo(48, tableTop + 14).lineTo(550, tableTop + 14).strokeColor('#ccc').stroke();
      let y = tableTop + 20;
      for (const it of data.items) {
        const descAlign: 'left' | 'right' = hasArabic(it.description) ? 'right' : 'left';
        doc.fillColor('#111').text(it.description, cols.desc, y, { width: 260, align: descAlign });
        doc.text(String(it.quantity),               cols.qty,   y, { width: 50, align: 'right' });
        doc.text(fmt(it.unit_price, data.currency), cols.price, y, { width: 70, align: 'right' });
        doc.text(fmt(it.line_total, data.currency), cols.total, y, { width: 80, align: 'right' });
        y += 20;
        if (y > 720) { doc.addPage(); y = 60; }
      }

      doc.moveTo(48, y + 6).lineTo(550, y + 6).strokeColor('#ccc').stroke();
      y += 16;
      const right = (label: string, value: string) => {
        doc.fontSize(10);
        doc.text(label, 360, y, { width: 100, align: 'right' });
        doc.text(value, 470, y, { width: 80, align: 'right' });
        y += 16;
      };
      right('Subtotal',  fmt(data.subtotal,   data.currency));
      right('VAT',       fmt(data.vat_amount, data.currency));
      if (Number(data.discount) > 0) right('Discount', `- ${fmt(data.discount, data.currency)}`);
      right('Total',     fmt(data.total,     data.currency));
      right('Paid',      fmt(data.paid,      data.currency));
      right('Remaining', fmt(data.remaining, data.currency));

      if (data.notes) {
        doc.moveDown(2).fontSize(9).fillColor('#666');
        text(data.notes, 48, doc.y);
      }

      doc.end();
    } catch (e) { reject(e); }
  });
}
