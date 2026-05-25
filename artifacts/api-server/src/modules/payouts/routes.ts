import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';

const schema = z.object({
  supplier_id:         z.string().uuid().optional().nullable(),
  expense_category_id: z.string().uuid().optional().nullable(),
  account_id:          z.string().uuid(),
  amount:              z.coerce.number().positive(),
  method:              z.string().default('cash'),
  paid_at:             z.string().optional(),
  reference:           z.string().optional().nullable(),
  notes:               z.string().optional().nullable(),
});

const patchSchema = z.object({
  supplier_id:         z.string().uuid().optional().nullable(),
  expense_category_id: z.string().uuid().optional().nullable(),
  method:              z.string().optional(),
  paid_at:             z.string().optional(),
  reference:           z.string().optional().nullable(),
  notes:               z.string().optional().nullable(),
});

const r = Router();

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const params: unknown[] = [t.companyId];
    let where = `WHERE py.company_id = $1`;

    const q = (req.query.q as string | undefined)?.trim();
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (s.name ILIKE $${params.length} OR py.reference ILIKE $${params.length} OR py.notes ILIKE $${params.length})`;
    }

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM payouts py LEFT JOIN suppliers s ON s.id = py.supplier_id ${where}`,
      params,
    );
    const total = Number(totalQ.rows[0]?.count ?? 0);

    const applied = p.applyTo(
      `SELECT py.*, a.name AS account_name,
              s.name AS supplier_name,
              ec.name AS category_name
       FROM payouts py
       LEFT JOIN accounts a ON a.id = py.account_id
       LEFT JOIN suppliers s ON s.id = py.supplier_id
       LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
       ${where}
       ORDER BY py.paid_at DESC`,
      params,
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, total));
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT py.*, a.name AS account_name, s.name AS supplier_name, ec.name AS category_name
       FROM payouts py
       LEFT JOIN accounts a ON a.id = py.account_id
       LEFT JOIN suppliers s ON s.id = py.supplier_id
       LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
       WHERE py.id = $1 AND py.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!rs.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.parse(req.body);

    const acctRs = await t.db.query(`SELECT id FROM accounts WHERE id = $1 AND company_id = $2`, [body.account_id, t.companyId]);
    if (!acctRs.rowCount) return res.status(422).json({ error: 'invalid_account', message: 'الحساب المالي غير صالح' });

    if (body.supplier_id) {
      const sRs = await t.db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [body.supplier_id, t.companyId]);
      if (!sRs.rowCount) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    }
    if (body.expense_category_id) {
      const ecRs = await t.db.query(`SELECT 1 FROM expense_categories WHERE id = $1 AND company_id = $2`, [body.expense_category_id, t.companyId]);
      if (!ecRs.rowCount) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    }

    await t.db.query('BEGIN');
    try {
      const ins = await t.db.query(
        `INSERT INTO payouts
           (company_id, supplier_id, expense_category_id, account_id, amount, method, paid_at, reference, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          t.companyId,
          body.supplier_id ?? null,
          body.expense_category_id ?? null,
          body.account_id,
          body.amount,
          body.method,
          body.paid_at ?? new Date().toISOString(),
          body.reference ?? null,
          body.notes ?? null,
          req.user!.id,
        ],
      );
      await t.db.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [body.amount, body.account_id]);
      await t.db.query('COMMIT');
      res.status(201).json({ data: ins.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = patchSchema.parse(req.body);

    const existing = await t.db.query(`SELECT * FROM payouts WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!existing.rowCount) return res.status(404).json({ error: 'not_found' });

    if (body.supplier_id) {
      const sRs = await t.db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [body.supplier_id, t.companyId]);
      if (!sRs.rowCount) return res.status(422).json({ error: 'invalid_supplier' });
    }
    if (body.expense_category_id) {
      const ecRs = await t.db.query(`SELECT 1 FROM expense_categories WHERE id = $1 AND company_id = $2`, [body.expense_category_id, t.companyId]);
      if (!ecRs.rowCount) return res.status(422).json({ error: 'invalid_category' });
    }

    const allowed: (keyof typeof body)[] = ['supplier_id','expense_category_id','method','paid_at','reference','notes'];
    const fields = (Object.keys(body) as (keyof typeof body)[]).filter(k => allowed.includes(k));
    if (!fields.length) return res.json({ data: existing.rows[0] });

    const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = fields.map((k) => body[k]);
    const rs = await t.db.query(
      `UPDATE payouts SET ${sets}, updated_at = NOW() WHERE id = $1 AND company_id = $${fields.length + 2} RETURNING *`,
      [req.params.id, ...values, t.companyId],
    );
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const existing = await t.db.query(`SELECT * FROM payouts WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!existing.rowCount) return res.status(404).json({ error: 'not_found' });
    const payout = existing.rows[0];

    await t.db.query('BEGIN');
    try {
      await t.db.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [payout.amount, payout.account_id]);
      await t.db.query(`DELETE FROM payouts WHERE id = $1`, [req.params.id]);
      await t.db.query('COMMIT');
      res.json({ success: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
