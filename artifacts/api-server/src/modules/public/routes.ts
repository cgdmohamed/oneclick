import { Router } from 'express';
import { pool } from '../../db/client.js';
import { notFound } from '../../utils/errors.js';
import { renderInvoicePdf } from '../../utils/pdf.js';

const router = Router();

interface PublicInvoicePayload {
  invoice: Record<string, unknown> & {
    id: string;
    number: string;
    issue_date: string;
    due_date: string | null;
    status: string;
    subtotal: string | number;
    vat_amount: string | number;
    discount: string | number;
    total: string | number;
    paid: string | number;
    remaining: string | number;
    notes: string | null;
    client_name: string;
    client_email: string | null;
    client_phone: string | null;
    client_tax: string | null;
    company_name: string;
    company_address: string | null;
    company_tax: string | null;
    company_phone: string | null;
    company_logo: string | null;
    company_stamp: string | null;
    currency: string | null;
  };
  items: Array<{
    description: string;
    quantity: string | number;
    unit_price: string | number;
    line_total: string | number;
    created_at: string;
  }>;
}

/**
 * Load a public invoice through a SECURITY DEFINER function so RLS doesn't
 * fight us (TEN-02). The function returns a single jsonb document; no tenant
 * context needs to be configured on the connection.
 */
async function loadByPublicId(publicId: string): Promise<PublicInvoicePayload> {
  const rs = await pool.query<{ public_get_invoice: PublicInvoicePayload | null }>(
    `SELECT public_get_invoice($1) AS public_get_invoice`,
    [publicId],
  );
  const payload = rs.rows[0]?.public_get_invoice;
  if (!payload) throw notFound('Invoice not found');
  return payload;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ',
  KWD: 'د.ك', QAR: 'ر.ق', OMR: 'ر.ع', BHD: 'د.ب', JOD: 'د.أ',
  EGP: 'ج.م', MAD: 'د.م',
};

router.get('/invoices/:publicId', async (req, res, next) => {
  try {
    const { invoice, items } = await loadByPublicId(req.params.publicId);
    const currencyCode = (invoice.currency as string | null) ?? 'SAR';
    res.json({
      data: {
        id:              invoice.id,
        number:          invoice.number,
        issue_date:      invoice.issue_date,
        due_date:        invoice.due_date,
        status:          invoice.status,
        subtotal:        Number(invoice.subtotal),
        vat_amount:      Number(invoice.vat_amount),
        discount:        Number(invoice.discount),
        total:           Number(invoice.total),
        paid:            Number(invoice.paid),
        remaining:       Number(invoice.remaining),
        client_name:     invoice.client_name,
        client_email:    invoice.client_email,
        client_phone:    invoice.client_phone,
        client_tax:      invoice.client_tax,
        company_name:    invoice.company_name,
        company_address: invoice.company_address,
        company_tax:     invoice.company_tax,
        company_phone:   invoice.company_phone,
        company_logo:    invoice.company_logo,
        company_stamp:   invoice.company_stamp,
        currency:        invoice.currency,
        currency_symbol: CURRENCY_SYMBOLS[currencyCode] ?? currencyCode,
        items: items.map((r, i) => ({
          id: String(i),
          name: r.description,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
        })),
      },
    });
  } catch (e) { next(e); }
});

router.get('/invoices/:publicId/pdf', async (req, res, next) => {
  try {
    const { invoice, items } = await loadByPublicId(req.params.publicId);
    const buf = await renderInvoicePdf({
      number: invoice.number, issue_date: invoice.issue_date,
      due_date: invoice.due_date, status: invoice.status,
      currency: invoice.currency ?? 'SAR',
      subtotal: Number(invoice.subtotal), vat_amount: Number(invoice.vat_amount),
      discount: Number(invoice.discount), total: Number(invoice.total),
      paid: Number(invoice.paid), remaining: Number(invoice.remaining),
      notes: invoice.notes,
      company: {
        name: invoice.company_name, address: invoice.company_address,
        tax_number: invoice.company_tax, phone: invoice.company_phone,
      },
      client: {
        name: invoice.client_name, email: invoice.client_email,
        phone: invoice.client_phone, tax_number: invoice.client_tax,
      },
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
