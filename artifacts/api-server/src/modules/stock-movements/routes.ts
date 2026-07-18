import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { round2 } from '../../utils/money.js';
import { assertPeriodOpen, createJournalEntry, getSettings } from '../accounting/posting.js';
import { badRequest } from '../../utils/errors.js';

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
    let stockWhere = `WHERE sm.company_id = $1`;
    let ledgerWhere = `WHERE sl.company_id = $1 AND sl.source_type IN ('purchase_return', 'purchase_return_cancel', 'credit_note', 'credit_note_cancel', 'write_off', 'write_off_cancel')`;

    const productId = req.query.product_id as string | undefined;
    if (productId) {
      params.push(productId);
      stockWhere += ` AND sm.product_id = $${params.length}`;
      ledgerWhere += ` AND sl.product_id = $${params.length}`;
    }

    const combinedRows = `
      SELECT sm.id,
             sm.company_id,
             sm.product_id,
             sm.supplier_id,
             sm.type,
             sm.quantity,
             sm.reason,
             sm.created_by,
             sm.unit_cost,
             sm.total_value,
             sm.created_at,
             p.name AS product_name,
             s.name AS supplier_name
      FROM stock_movements sm
      LEFT JOIN products p ON p.id = sm.product_id
      LEFT JOIN suppliers s ON s.id = sm.supplier_id
      ${stockWhere}
      UNION ALL
      SELECT sl.id,
             sl.company_id,
             sl.product_id,
             pr.supplier_id,
             CASE WHEN sl.quantity_out > 0 THEN 'out' ELSE 'in' END AS type,
             CASE WHEN sl.quantity_out > 0 THEN sl.quantity_out ELSE sl.quantity_in END AS quantity,
             CASE
               WHEN sl.source_type = 'purchase_return_cancel' THEN 'إلغاء مرتجع شراء'
               WHEN sl.source_type = 'credit_note' THEN 'مرتجع بيع / إشعار دائن'
               WHEN sl.source_type = 'credit_note_cancel' THEN 'إلغاء إشعار دائن'
               WHEN sl.source_type = 'write_off' THEN 'هالك / شطب مخزون'
               WHEN sl.source_type = 'write_off_cancel' THEN 'إلغاء شطب مخزون'
               ELSE 'مرتجع شراء'
             END AS reason,
             NULL AS created_by,
             sl.unit_cost,
             sl.total_value,
             sl.movement_date AS created_at,
             p.name AS product_name,
             s.name AS supplier_name
      FROM stock_ledger sl
      JOIN products p ON p.id = sl.product_id
      LEFT JOIN purchase_returns pr ON pr.id = sl.source_id AND pr.company_id = sl.company_id
      LEFT JOIN credit_notes cn ON cn.id = sl.source_id AND cn.company_id = sl.company_id
      LEFT JOIN inventory_write_offs iwo ON iwo.id = sl.source_id AND iwo.company_id = sl.company_id
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      ${ledgerWhere}
    `;

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM (${combinedRows}) rows`, params,
    );
    const total = Number(totalQ.rows[0]?.count ?? 0);

    const applied = p.applyTo(
      `SELECT *
       FROM (${combinedRows}) rows
       ORDER BY created_at DESC`,
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

    const prodRs = await t.db.query(
      `SELECT p.*,
              COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id) AS resolved_inventory_account_id,
              COALESCE(p.inventory_adjustment_account_id, pc.inventory_adjustment_account_id, parent_pc.inventory_adjustment_account_id) AS resolved_inventory_adjustment_account_id
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
       LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [body.product_id, t.companyId],
    );
    if (!prodRs.rowCount) return res.status(422).json({ error: 'invalid_product', message: 'المنتج غير صالح' });
    if (prodRs.rows[0].product_type !== 'stock') {
      return res.status(422).json({ error: 'not_stock_product', message: 'حركات المخزون متاحة للمنتجات المخزنية فقط' });
    }

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
      const inventoryAccountId = prodRs.rows[0].resolved_inventory_account_id ?? settings.inventory_account_id;
      const adjustmentAccountId = prodRs.rows[0].resolved_inventory_adjustment_account_id ?? settings.inventory_adjustment_account_id;
      if (!inventoryAccountId || !adjustmentAccountId) throw badRequest('Missing inventory accounting settings');
      const value = round2(body.quantity * Number(ins.rows[0].unit_cost ?? 0));
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: new Date(),
        memo: `Stock ${body.type}: ${body.reason ?? prodRs.rows[0].name}`,
        source: { type: 'stock_movement', id: ins.rows[0].id },
        userId: req.auth!.userId,
        lines: delta >= 0
          ? [
              { accountId: inventoryAccountId, debit: value, description: body.reason },
              { accountId: adjustmentAccountId, credit: value, description: body.reason },
            ]
          : [
              { accountId: adjustmentAccountId, debit: value, description: body.reason },
              { accountId: inventoryAccountId, credit: value, description: body.reason },
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
