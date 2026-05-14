import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../utils/errors.js';

const router = Router();

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).default(15),
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  issue_date: z.string().datetime().optional(),
  due_date: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  discount: z.coerce.number().nonnegative().default(0),
  items: z.array(itemSchema).min(1),
});

function buildNumber(prefix: string, seq: number, year: number, fmt: string, sep: string, pad: number) {
  const yearPart = fmt === 'none' ? '' : fmt === 'short' ? String(year).slice(-2) : String(year);
  const seqPart  = String(Math.max(0, Math.floor(seq))).padStart(Math.max(1, pad), '0');
  return [prefix, yearPart, seqPart].filter(Boolean).join(sep);
}

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT i.*, c.name AS client_name
      FROM invoices i JOIN clients c ON c.id = i.client_id
      ORDER BY i.created_at DESC
    `);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const inv = await t.db.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email, c.tax_number AS client_tax
       FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = $1`,
      [req.params.id],
    );
    if (!inv.rowCount) throw notFound('Invoice not found');
    const items = await t.db.query(`SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at`, [req.params.id]);
    const pays  = await t.db.query(`SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC`, [req.params.id]);
    res.json({ data: { ...inv.rows[0], items: items.rows, payments: pays.rows } });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);

    // Lock company row to atomically increment invoice sequence
    const compRes = await t.db.query(
      `SELECT invoice_prefix, invoice_sequence, invoice_year_format, invoice_padding, invoice_separator
       FROM companies WHERE id = $1 FOR UPDATE`,
      [t.companyId],
    );
    if (!compRes.rowCount) throw badRequest('Company missing');
    const cfg = compRes.rows[0];
    const newSeq = cfg.invoice_sequence + 1;
    const issueDate = body.issue_date ? new Date(body.issue_date) : new Date();
    const number = buildNumber(
      cfg.invoice_prefix, newSeq, issueDate.getFullYear(),
      cfg.invoice_year_format, cfg.invoice_separator, cfg.invoice_padding,
    );
    await t.db.query(`UPDATE companies SET invoice_sequence = $1 WHERE id = $2`, [newSeq, t.companyId]);

    // Compute totals
    let subtotal = 0, vat = 0;
    for (const it of body.items) {
      const line = it.quantity * it.unit_price;
      subtotal += line;
      vat += line * (it.vat_rate / 100);
    }
    const total = Math.max(0, subtotal + vat - body.discount);

    const invRes = await t.db.query(`
      INSERT INTO invoices (company_id, number, client_id, issue_date, due_date, status,
                            subtotal, vat_amount, discount, total, paid, remaining, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,'sent',$6,$7,$8,$9,0,$9,$10,$11)
      RETURNING *
    `, [t.companyId, number, body.client_id, issueDate, body.due_date ?? null,
        subtotal, vat, body.discount, total, body.notes ?? null, req.auth!.userId]);
    const invoice = invRes.rows[0];

    for (const it of body.items) {
      const line = it.quantity * it.unit_price * (1 + it.vat_rate / 100);
      await t.db.query(`
        INSERT INTO invoice_items (company_id, invoice_id, product_id, description, quantity, unit_price, vat_rate, line_total)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [t.companyId, invoice.id, it.product_id ?? null, it.description, it.quantity, it.unit_price, it.vat_rate, line]);

      // Decrement stock if product linked
      if (it.product_id) {
        await t.db.query(
          `UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND company_id = $3`,
          [it.quantity, it.product_id, t.companyId],
        );
      }
    }

    res.status(201).json({ data: invoice });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query(`DELETE FROM invoices WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
