import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { round2 } from '../../utils/money.js';
import { assertPeriodOpen, createJournalEntry, getSettings } from '../accounting/posting.js';

const schema = z.object({
  product_id:  z.string().uuid(),
  supplier_id: z.string().uuid().optional().nullable(),
  type:        z.enum(['in', 'out', 'adjustment']),
  quantity:    z.coerce.number().positive(),
  reason:      z.string().optional().nullable(),
  unit_cost:   z.coerce.number().nonnegative().optional(),
});

const r = Router();

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const params: unknown[] = [t.companyId];
    let where = `WHERE sm.company_id = $1`;

    const productId = req.query.product_id as string | undefined;
    if (productId) {
      params.push(productId);
      where += ` AND sm.product_id = $${params.length}`;
    }

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM stock_movements sm ${where}`, params,
    );
    const total = Number(totalQ.rows[0]?.count ?? 0);

    const applied = p.applyTo(
      `SELECT sm.*, p.name AS product_name, s.name AS supplier_name
       FROM stock_movements sm
       LEFT JOIN products p ON p.id = sm.product_id
       LEFT JOIN suppliers s ON s.id = sm.supplier_id
       ${where}
       ORDER BY sm.created_at DESC`,
      params,
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, total));
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.parse(req.body);
    await assertPeriodOpen(t.db, t.companyId, new Date());

    const prodRs = await t.db.query(`SELECT * FROM products WHERE id = $1 AND company_id = $2`, [body.product_id, t.companyId]);
    if (!prodRs.rowCount) return res.status(422).json({ error: 'invalid_product', message: 'المنتج غير صالح' });

    if (body.supplier_id) {
      const sRs = await t.db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [body.supplier_id, t.companyId]);
      if (!sRs.rowCount) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    }

    await t.db.query('BEGIN');
    try {
      const ins = await t.db.query(
        `INSERT INTO stock_movements (company_id, product_id, supplier_id, type, quantity, reason, created_by, unit_cost, total_value, adjustment_direction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          t.companyId,
          body.product_id,
          body.supplier_id ?? null,
          body.type,
          body.quantity,
          body.reason ?? null,
          req.auth!.userId,
          body.unit_cost ?? Number(prodRs.rows[0].average_cost ?? prodRs.rows[0].cost ?? 0),
          round2(body.quantity * Number(body.unit_cost ?? prodRs.rows[0].average_cost ?? prodRs.rows[0].cost ?? 0)),
          body.type === 'adjustment' || body.type === 'in' ? 'increase' : 'decrease',
        ],
      );

      const delta = body.type === 'out' ? -body.quantity : body.quantity;
      await t.db.query(
        `UPDATE products
         SET quantity = GREATEST(0, quantity + $1),
             inventory_value = GREATEST(0, inventory_value + $3)
         WHERE id = $2`,
        [delta, body.product_id, round2(delta * Number(ins.rows[0].unit_cost ?? 0))],
      );
      const updatedProduct = await t.db.query(`SELECT quantity, inventory_value FROM products WHERE id = $1 AND company_id = $2`, [body.product_id, t.companyId]);
      await t.db.query(
        `INSERT INTO stock_ledger
         (company_id, product_id, source_type, source_id, quantity_in, quantity_out, unit_cost, total_value, balance_quantity, balance_value)
         VALUES ($1,$2,'stock_movement',$3,$4,$5,$6,$7,$8,$9)`,
        [
          t.companyId,
          body.product_id,
          ins.rows[0].id,
          delta > 0 ? body.quantity : 0,
          delta < 0 ? body.quantity : 0,
          ins.rows[0].unit_cost,
          Math.abs(Number(ins.rows[0].total_value ?? 0)),
          updatedProduct.rows[0].quantity,
          updatedProduct.rows[0].inventory_value,
        ],
      );
      const settings = await getSettings(t.db, t.companyId);
      const value = round2(body.quantity * Number(ins.rows[0].unit_cost ?? 0));
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: new Date(),
        memo: `Stock ${body.type}: ${body.reason ?? prodRs.rows[0].name}`,
        source: { type: 'stock_movement', id: ins.rows[0].id },
        userId: req.auth!.userId,
        lines: delta >= 0
          ? [
              { accountId: settings.inventory_account_id, debit: value, description: body.reason },
              { accountId: settings.inventory_adjustment_account_id, credit: value, description: body.reason },
            ]
          : [
              { accountId: settings.inventory_adjustment_account_id, debit: value, description: body.reason },
              { accountId: settings.inventory_account_id, credit: value, description: body.reason },
            ],
      });
      await t.db.query(`UPDATE stock_movements SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, ins.rows[0].id, t.companyId]);
      await t.db.query('COMMIT');
      res.status(201).json({ data: ins.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
