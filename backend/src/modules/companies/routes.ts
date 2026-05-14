import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { notFound } from '../../utils/errors.js';

const router = Router();

router.get('/me', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await pool.query(`SELECT * FROM companies WHERE id = $1`, [t.companyId]);
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  legal_name: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  commercial_register: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  stamp_url: z.string().optional().nullable(),
  invoice_prefix: z.string().optional(),
  invoice_year_format: z.enum(['full','short','none']).optional(),
  invoice_padding: z.coerce.number().int().min(1).max(10).optional(),
  invoice_separator: z.string().max(5).optional(),
  currency: z.string().optional(),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
});

router.patch('/me', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = updateSchema.parse(req.body);
    const fields = Object.keys(body);
    if (fields.length === 0) return res.json({ data: null });
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...Object.values(body), t.companyId];
    const rs = await pool.query(`UPDATE companies SET ${set} WHERE id = $${values.length} RETURNING *`, values);
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

export default router;
