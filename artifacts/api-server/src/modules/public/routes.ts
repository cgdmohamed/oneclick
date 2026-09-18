import { Router } from 'express';
import { pool } from '../../db/client.js';
import { notFound } from '../../utils/errors.js';

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
    qr_public_visible?: boolean | null;
    invoice_template: string | null;
    invoice_accent_color: string | null;
    invoice_terms: string | null;
    invoice_footer: string | null;
  };
  items: Array<{
    description: string;
    quantity: string | number;
    unit_price: string | number;
    discount?: string | number;
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

const EGP_CURRENCY_CODE = 'EGP';
const EGP_CURRENCY_SYMBOL = 'ج.م';

router.get('/invoices/:publicId', async (req, res, next) => {
  try {
    const { invoice, items } = await loadByPublicId(req.params.publicId);
    let qrPublicVisible = invoice.qr_public_visible !== false;
    try {
      const qrRs = await pool.query<{ qr_public_visible: boolean }>(
        `SELECT qr_public_visible FROM invoices WHERE public_id = $1 LIMIT 1`,
        [req.params.publicId],
      );
      if (qrRs.rowCount) qrPublicVisible = qrRs.rows[0].qr_public_visible !== false;
    } catch {
      // Older databases before migration 044 simply default to showing QR.
    }
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
        currency:        EGP_CURRENCY_CODE,
        currency_symbol: EGP_CURRENCY_SYMBOL,
        qr_public_visible: qrPublicVisible,
        invoice_template:     invoice.invoice_template,
        invoice_accent_color: invoice.invoice_accent_color,
        invoice_terms:        invoice.invoice_terms,
        invoice_footer:       invoice.invoice_footer,
        items: items.map((r, i) => ({
          id: String(i),
          name: r.description,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
          discount: Number(r.discount ?? 0),
          line_total: Number(r.line_total ?? 0),
        })),
      },
    });
  } catch (e) { next(e); }
});

export default router;
