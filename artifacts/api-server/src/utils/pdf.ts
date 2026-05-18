import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arabicReshaper: { convertArabic: (s: string) => string } = _require('arabic-reshaper');

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
 * assets/fonts, but production deployments can also drop a font at
 * the same path. If neither is found we fall back to Helvetica with a
 * single warning and Arabic glyphs render as boxes (LOC-01).
 */
function resolveArabicFont(): string | null {
  const candidates = [
    // cwd is the most reliable: the server starts from artifacts/api-server/
    path.resolve(process.cwd(), 'assets/fonts/Cairo-Regular.ttf'),
    // __dirname is dist/ in the bundle; one level up lands in api-server/
    path.resolve(__dirname, '../assets/fonts/Cairo-Regular.ttf'),
    // legacy two-level fallback (used when src/ is __dirname)
    path.resolve(__dirname, '../../assets/fonts/Cairo-Regular.ttf'),
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

const fmt = (n: number, c: string) => `${Number(n).toFixed(2)} ${c}`;

/**
 * Detect any character in the Arabic Unicode blocks. Used to flip alignment
 * to right for individual cells (LOC-02).
 */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const hasArabic = (s: unknown) => typeof s === 'string' && ARABIC_RE.test(s);

/**
 * Reshape Arabic text so pdfkit can render connected letterforms correctly.
 *
 * Pdfkit lays glyphs out LTR, so we need to:
 * 1. Reshape each Arabic word into its contextual glyph forms (e.g. م → ﻣ/ﻤ/ﻡ).
 * 2. Reverse the visual word order so RTL text reads correctly when pdfkit
 *    renders it left-to-right.
 *
 * Non-Arabic segments (numbers, punctuation, Latin) are kept in place within
 * the reversed word sequence so mixed lines (e.g. "فاتورة INV-2024-0001") render
 * in a readable approximation of bidi order.
 */
function reshapeArabic(text: string): string {
  if (!hasArabic(text)) return text;
  try {
    const shaped = arabicReshaper.convertArabic(text);
    // Split on spaces, reverse word order for RTL, and reverse characters within
    // each Arabic word so PDFKit's LTR glyph placement reads correctly.
    return shaped.split(' ').reverse().map(token => {
      if (hasArabic(token)) return token.split('').reverse().join('');
      return token;
    }).join(' ');
  } catch {
    return text;
  }
}

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
        console.warn('[pdf] no Arabic font found; Arabic text will render as boxes. Place Cairo-Regular.ttf in assets/fonts/.');
      }

      const currency = data.currency || 'SAR';

      const text = (s: string, x: number | undefined, y: number | undefined, opts: PDFKit.Mixins.TextOptions = {}) => {
        const isAr = hasArabic(s);
        const display = isAr ? reshapeArabic(s) : s;
        const align = opts.align ?? (isAr ? 'right' : 'left');
        if (x === undefined || y === undefined) return doc.text(display, { ...opts, align });
        return doc.text(display, x, y, { ...opts, align });
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
        const isArDesc = hasArabic(it.description);
        const descDisplay = isArDesc ? reshapeArabic(it.description) : it.description;
        const descAlign: 'left' | 'right' = isArDesc ? 'right' : 'left';
        doc.fillColor('#111').text(descDisplay, cols.desc, y, { width: 260, align: descAlign });
        doc.text(String(it.quantity),           cols.qty,   y, { width: 50, align: 'right' });
        doc.text(fmt(it.unit_price, currency),  cols.price, y, { width: 70, align: 'right' });
        doc.text(fmt(it.line_total, currency),  cols.total, y, { width: 80, align: 'right' });
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
      right('Subtotal',  fmt(data.subtotal,   currency));
      right('VAT',       fmt(data.vat_amount, currency));
      if (Number(data.discount) > 0) right('Discount', `- ${fmt(data.discount, currency)}`);
      right('Total',     fmt(data.total,     currency));
      right('Paid',      fmt(data.paid,      currency));
      right('Remaining', fmt(data.remaining, currency));

      if (data.notes) {
        doc.moveDown(2).fontSize(9).fillColor('#666');
        text(data.notes, 48, doc.y);
      }

      doc.end();
    } catch (e) { reject(e); }
  });
}
