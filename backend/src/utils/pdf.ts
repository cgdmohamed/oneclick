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

const fmt = (n: number, c = 'SAR') => `${Number(n).toFixed(2)} ${c}`;

/** Render an invoice PDF and resolve a Buffer. */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text(data.company.name, { align: 'left' });
      doc.fontSize(10).fillColor('#666');
      if (data.company.address) doc.text(data.company.address);
      if (data.company.phone) doc.text(data.company.phone);
      if (data.company.tax_number) doc.text(`Tax #: ${data.company.tax_number}`);

      doc.moveUp(4);
      doc.fillColor('#111').fontSize(14).text('TAX INVOICE', { align: 'right' });
      doc.fontSize(11).text(`# ${data.number}`, { align: 'right' });
      doc.fontSize(9).fillColor('#666').text(`Status: ${data.status}`, { align: 'right' });
      doc.moveDown(2);

      // Bill to
      doc.fillColor('#111').fontSize(11).text('Bill To:');
      doc.fontSize(10).text(data.client.name);
      if (data.client.email) doc.text(data.client.email);
      if (data.client.phone) doc.text(data.client.phone);
      if (data.client.tax_number) doc.text(`Tax #: ${data.client.tax_number}`);

      doc.moveDown();
      doc.text(`Issue date: ${new Date(data.issue_date).toISOString().slice(0, 10)}`);
      if (data.due_date) doc.text(`Due date: ${new Date(data.due_date).toISOString().slice(0, 10)}`);
      doc.moveDown();

      // Items table
      const tableTop = doc.y;
      const cols = { desc: 48, qty: 320, price: 380, total: 470 };
      doc.fontSize(10).fillColor('#111');
      doc.text('Description', cols.desc, tableTop);
      doc.text('Qty', cols.qty, tableTop, { width: 50, align: 'right' });
      doc.text('Unit', cols.price, tableTop, { width: 70, align: 'right' });
      doc.text('Total', cols.total, tableTop, { width: 80, align: 'right' });
      doc.moveTo(48, tableTop + 14).lineTo(550, tableTop + 14).strokeColor('#ccc').stroke();
      let y = tableTop + 20;
      for (const it of data.items) {
        doc.fillColor('#111').text(it.description, cols.desc, y, { width: 260 });
        doc.text(String(it.quantity), cols.qty, y, { width: 50, align: 'right' });
        doc.text(fmt(it.unit_price, data.currency), cols.price, y, { width: 70, align: 'right' });
        doc.text(fmt(it.line_total, data.currency), cols.total, y, { width: 80, align: 'right' });
        y += 20;
        if (y > 720) { doc.addPage(); y = 60; }
      }

      doc.moveTo(48, y + 6).lineTo(550, y + 6).strokeColor('#ccc').stroke();
      y += 16;
      const right = (label: string, value: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
        doc.text(label, 360, y, { width: 100, align: 'right' });
        doc.text(value, 470, y, { width: 80, align: 'right' });
        y += 16;
      };
      right('Subtotal', fmt(data.subtotal, data.currency));
      right('VAT', fmt(data.vat_amount, data.currency));
      if (Number(data.discount) > 0) right('Discount', `- ${fmt(data.discount, data.currency)}`);
      right('Total', fmt(data.total, data.currency), true);
      right('Paid', fmt(data.paid, data.currency));
      right('Remaining', fmt(data.remaining, data.currency), true);

      if (data.notes) {
        doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#666').text(data.notes, 48);
      }

      doc.end();
    } catch (e) { reject(e); }
  });
}
