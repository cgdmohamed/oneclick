import { Router } from 'express';
import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  name:       z.string().min(1),
  phone:      z.string().optional().nullable(),
  email:      z.string().email().optional().nullable(),
  address:    z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  notes:      z.string().optional().nullable(),
  is_active:  z.boolean().optional().default(true),
});

const base = crudRouter({
  table:       'suppliers',
  fields:      ['name', 'phone', 'email', 'address', 'tax_number', 'notes', 'is_active'],
  schema,
  patchSchema: schema.partial(),
  list:        { orderBy: 'name ASC', searchable: ['name', 'phone', 'email'] },
});

const r = Router();

/** GET /api/suppliers/:id/statement */
r.get('/:id/statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const { id } = req.params;

    const supplierRs = await t.db.query(
      `SELECT * FROM suppliers WHERE id = $1 AND company_id = $2`,
      [id, t.companyId],
    );
    if (!supplierRs.rowCount) return res.status(404).json({ error: 'not_found' });
    const supplier = supplierRs.rows[0];

    const productsRs = await t.db.query(
      `SELECT p.id, p.name, p.sku, p.price, p.quantity, p.unit
       FROM products p
       WHERE p.supplier_id = $1 AND p.company_id = $2
       ORDER BY p.name ASC`,
      [id, t.companyId],
    );

    const payoutsRs = await t.db.query(
      `SELECT py.id, py.amount, py.method, py.paid_at, py.reference, py.notes,
              a.name AS account_name,
              ec.name AS category_name
       FROM payouts py
       LEFT JOIN accounts a ON a.id = py.account_id
       LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
       WHERE py.supplier_id = $1 AND py.company_id = $2
       ORDER BY py.paid_at DESC`,
      [id, t.companyId],
    );

    const total = payoutsRs.rows.reduce((sum: number, p: { amount: string }) => sum + parseFloat(p.amount || '0'), 0);
    const lastPayout = payoutsRs.rows[0]?.paid_at ?? null;

    res.json({
      data: {
        supplier,
        products:      productsRs.rows,
        payouts:       payoutsRs.rows,
        total_payouts: total.toFixed(2),
        last_payout:   lastPayout,
      },
    });
  } catch (e) { next(e); }
});

r.use('/', base);
export default r;
