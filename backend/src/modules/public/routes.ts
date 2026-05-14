import { Router } from 'express';
import { pool } from '../../db/client.js';
import { notFound } from '../../utils/errors.js';
import { renderInvoicePdf } from '../../utils/pdf.js';

const router = Router();

async function loadByPublicId(publicId: string) {
  const inv = await pool.query(`
    SELECT i.*, c.name AS client_name, c.email AS client_email, c.tax_number AS client_tax,
           co.name AS company_name, co.tax_number AS company_tax, co.address AS company_address,
           co.phone AS company_phone, co.logo_url AS company_logo, co.stamp_url AS company_stamp,
           co.currency
    FROM invoices i
    JOIN clients   c  ON c.id = i.client_id
    JOIN companies co ON co.id = i.company_id
    WHERE i.public_id = $1
  `, [publicId]);
  if (!inv.rowCount) throw notFound('Invoice not found');
  const items = await pool.query(`SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at`, [inv.rows[0].id]);
  return { invoice: inv.rows[0], items: items.rows };
}

router.get('/invoices/:publicId', async (req, res, next) => {
  try {
    const { invoice, items } = await loadByPublicId(req.params.publicId);
    res.json({ data: { ...invoice, items } });
  } catch (e) { next(e); }
});

router.get('/invoices/:publicId/pdf', async (req, res, next) => {
  try {
    const { invoice, items } = await loadByPublicId(req.params.publicId);
    const buf = await renderInvoicePdf({
      number: invoice.number, issue_date: invoice.issue_date, due_date: invoice.due_date, status: invoice.status,
      currency: invoice.currency ?? 'SAR',
      subtotal: Number(invoice.subtotal), vat_amount: Number(invoice.vat_amount),
      discount: Number(invoice.discount), total: Number(invoice.total),
      paid: Number(invoice.paid), remaining: Number(invoice.remaining), notes: invoice.notes,
      company: { name: invoice.company_name, address: invoice.company_address, tax_number: invoice.company_tax, phone: invoice.company_phone },
      client:  { name: invoice.client_name, email: invoice.client_email, tax_number: invoice.client_tax },
      items: items.map((r) => ({
        description: r.description, quantity: Number(r.quantity),
        unit_price: Number(r.unit_price), line_total: Number(r.line_total),
      })),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.number}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

export default router;
