import { Router } from 'express';
import { pool } from '../../db/client.js';
import { notFound } from '../../utils/errors.js';

const router = Router();

/** Public, no-auth endpoint to view a shared invoice by its public_id. */
router.get('/invoices/:publicId', async (req, res, next) => {
  try {
    const inv = await pool.query(`
      SELECT i.*, c.name AS client_name, c.email AS client_email, c.tax_number AS client_tax,
             co.name AS company_name, co.tax_number AS company_tax, co.address AS company_address,
             co.logo_url AS company_logo, co.stamp_url AS company_stamp, co.currency
      FROM invoices i
      JOIN clients   c  ON c.id = i.client_id
      JOIN companies co ON co.id = i.company_id
      WHERE i.public_id = $1
    `, [req.params.publicId]);
    if (!inv.rowCount) throw notFound('Invoice not found');
    const items = await pool.query(`SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at`, [inv.rows[0].id]);
    res.json({ data: { ...inv.rows[0], items: items.rows } });
  } catch (e) { next(e); }
});

export default router;
