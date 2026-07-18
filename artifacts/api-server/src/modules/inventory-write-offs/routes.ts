import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { parsePagination } from '../../utils/pagination.js';
import { assertBranch, assertCostCenter } from '../../utils/dimensions.js';
import { assertPeriodOpen, createJournalEntry, getSettings, reverseJournalEntry, type JournalLineInput } from '../accounting/posting.js';

const reasons = ['damaged','expired','broken','missing','theft','quality_issue','inventory_count_difference','other'] as const;

const itemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit_cost: z.coerce.number().nonnegative().optional().nullable(),
  reason: z.enum(reasons).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createSchema = z.object({
  write_off_number: z.string().min(1).optional(),
  write_off_date: z.string().optional(),
  branch_id: z.string().uuid().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  reason: z.enum(reasons),
  notes: z.string().optional().nullable(),
  status: z.enum(['draft', 'posted']).default('draft'),
  items: z.array(itemSchema).min(1),
});

const r = Router();

function reasonLabel(reason: string) {
  return {
    damaged: 'Damaged',
    expired: 'Expired',
    broken: 'Broken',
    missing: 'Missing',
    theft: 'Theft',
    quality_issue: 'Quality issue',
    inventory_count_difference: 'Inventory count difference',
    other: 'Other',
  }[reason] ?? reason;
}

async function nextNumber(db: any, companyId: string) {
  const row = await db.query(
    `SELECT COUNT(*)::int + 1 AS seq FROM inventory_write_offs WHERE company_id = $1`,
    [companyId],
  );
  return `WO-${String(row.rows[0].seq).padStart(5, '0')}`;
}

async function postWriteOff(db: any, companyId: string, writeOffId: string, userId?: string | null) {
  const woRs = await db.query(`SELECT * FROM inventory_write_offs WHERE id = $1 AND company_id = $2 FOR UPDATE`, [writeOffId, companyId]);
  if (!woRs.rowCount) throw notFound('Inventory write-off not found');
  const wo = woRs.rows[0];
  if (wo.status === 'posted' && wo.journal_entry_id) return wo.journal_entry_id;
  if (wo.status === 'cancelled') throw badRequest('Cancelled write-offs cannot be posted');
  await assertPeriodOpen(db, companyId, wo.write_off_date);

  const items = await db.query(
    `SELECT iwoi.*, p.name AS product_name, p.product_type, p.quantity AS current_quantity,
            p.average_cost, p.cost, p.inventory_value,
            COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id) AS resolved_inventory_account_id
     FROM inventory_write_off_items iwoi
     JOIN products p ON p.id = iwoi.product_id AND p.company_id = iwoi.company_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
     WHERE iwoi.write_off_id = $1 AND iwoi.company_id = $2
     ORDER BY iwoi.created_at`,
    [writeOffId, companyId],
  );
  if (!items.rowCount) throw badRequest('Write-off has no items');

  const settings = await getSettings(db, companyId);
  const lossAccountId = settings.inventory_loss_expense_account_id ?? settings.inventory_adjustment_account_id;
  if (!lossAccountId) throw badRequest('Missing Inventory Loss / Damaged Goods Expense account');

  const inventoryGroups = new Map<string, number>();
  let totalCost = 0;
  for (const item of items.rows) {
    if (item.product_type !== 'stock') throw badRequest(`Product "${item.product_name}" is not a stock product`);
    const quantity = Number(item.quantity);
    if (Number(item.current_quantity) < quantity) throw badRequest(`Insufficient stock for "${item.product_name}"`);
    const unitCost = Number(item.unit_cost ?? 0) > 0
      ? Number(item.unit_cost)
      : Number(item.average_cost ?? item.cost ?? 0);
    const value = round2(quantity * unitCost);
    const inventoryAccountId = item.resolved_inventory_account_id ?? settings.inventory_account_id;
    if (!inventoryAccountId) throw badRequest('Missing inventory account');

    const oldValue = Number(item.inventory_value ?? 0);
    const newQty = round2(Number(item.current_quantity) - quantity);
    const newValue = round2(Math.max(0, oldValue - value));
    await db.query(
      `UPDATE products
       SET quantity = $1, inventory_value = $2
       WHERE id = $3 AND company_id = $4`,
      [newQty, newValue, item.product_id, companyId],
    );
    await db.query(
      `UPDATE inventory_write_off_items
       SET unit_cost = $1, total_cost = $2
       WHERE id = $3 AND company_id = $4`,
      [unitCost, value, item.id, companyId],
    );
    await db.query(
      `INSERT INTO stock_ledger
       (company_id, product_id, source_type, source_id, movement_date, quantity_out, unit_cost, total_value, balance_quantity, balance_value)
       VALUES ($1,$2,'write_off',$3,$4,$5,$6,$7,$8,$9)`,
      [companyId, item.product_id, writeOffId, wo.write_off_date, quantity, unitCost, value, newQty, newValue],
    );
    inventoryGroups.set(inventoryAccountId, round2((inventoryGroups.get(inventoryAccountId) ?? 0) + value));
    totalCost = round2(totalCost + value);
  }

  const lines: JournalLineInput[] = [
    { accountId: lossAccountId, debit: totalCost, description: `Inventory write-off ${wo.write_off_number}`, branchId: wo.branch_id, costCenterId: wo.cost_center_id },
  ];
  for (const [accountId, amount] of inventoryGroups) {
    if (amount > 0) lines.push({ accountId, credit: amount, description: `Inventory write-off ${wo.write_off_number}`, branchId: wo.branch_id, costCenterId: wo.cost_center_id });
  }

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: wo.write_off_date,
    memo: `Inventory write-off ${wo.write_off_number}`,
    source: { type: 'inventory_write_off', id: writeOffId },
    userId,
    branchId: wo.branch_id ?? null,
    lines,
  });
  await db.query(
    `UPDATE inventory_write_offs
     SET status = 'posted', total_cost = $3, posted_at = NOW(), posted_by = $4, journal_entry_id = $5, updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [writeOffId, companyId, totalCost, userId ?? null, je.id],
  );
  return je.id;
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const params: unknown[] = [t.companyId];
    const where = ['iwo.company_id = $1'];
    const { from, to, reason, status } = req.query as Record<string, string>;
    if (from) { params.push(from); where.push(`iwo.write_off_date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`iwo.write_off_date < ($${params.length}::date + interval '1 day')`); }
    if (reason) { params.push(reason); where.push(`iwo.reason = $${params.length}`); }
    if (status) { params.push(status); where.push(`iwo.status = $${params.length}`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = await t.db.query(`SELECT COUNT(*)::int AS count FROM inventory_write_offs iwo ${whereSql}`, params);
    const applied = p.applyTo(
      `SELECT iwo.*, b.name AS branch_name, cc.name AS cost_center_name, u.name AS created_by_name
       FROM inventory_write_offs iwo
       LEFT JOIN branches b ON b.id = iwo.branch_id
       LEFT JOIN cost_centers cc ON cc.id = iwo.cost_center_id
       LEFT JOIN users u ON u.id = iwo.created_by
       ${whereSql}
       ORDER BY iwo.write_off_date DESC, iwo.created_at DESC`,
      params,
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(total.rows[0].count)));
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const wo = await t.db.query(
      `SELECT iwo.*, b.name AS branch_name, cc.name AS cost_center_name, je.number AS journal_entry_number, rje.number AS reversal_journal_entry_number
       FROM inventory_write_offs iwo
       LEFT JOIN branches b ON b.id = iwo.branch_id
       LEFT JOIN cost_centers cc ON cc.id = iwo.cost_center_id
       LEFT JOIN journal_entries je ON je.id = iwo.journal_entry_id
       LEFT JOIN journal_entries rje ON rje.id = iwo.reversal_journal_entry_id
       WHERE iwo.id = $1 AND iwo.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!wo.rowCount) throw notFound('Inventory write-off not found');
    const items = await t.db.query(
      `SELECT iwoi.*, p.name AS product_name, p.sku
       FROM inventory_write_off_items iwoi
       JOIN products p ON p.id = iwoi.product_id
       WHERE iwoi.write_off_id = $1 AND iwoi.company_id = $2
       ORDER BY iwoi.created_at`,
      [req.params.id, t.companyId],
    );
    res.json({ data: { ...wo.rows[0], items: items.rows } });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);
    await assertBranch(t.db, t.companyId, body.branch_id);
    await assertCostCenter(t.db, t.companyId, body.cost_center_id);
    const writeOffDate = body.write_off_date ? new Date(body.write_off_date) : new Date();
    await assertPeriodOpen(t.db, t.companyId, writeOffDate);

    const productIds = [...new Set(body.items.map((item) => item.product_id))];
    const products = await t.db.query(
      `SELECT id, product_type, COALESCE(NULLIF(average_cost,0), cost, 0) AS unit_cost
       FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])`,
      [t.companyId, productIds],
    );
    if (products.rows.length !== productIds.length) throw badRequest('Product must belong to the same company');
    const productMap = new Map(products.rows.map((row) => [row.id, row]));

    let totalCost = 0;
    const rows = body.items.map((item) => {
      const product = productMap.get(item.product_id);
      if (product.product_type !== 'stock') throw badRequest('Inventory write-offs are allowed only for stock products');
      const unitCost = Number(item.unit_cost ?? product.unit_cost ?? 0);
      const total = round2(item.quantity * unitCost);
      totalCost = round2(totalCost + total);
      return { ...item, unit_cost: unitCost, total_cost: total };
    });

    await t.db.query('BEGIN');
    try {
      const number = body.write_off_number?.trim() || await nextNumber(t.db, t.companyId);
      const wo = await t.db.query(
        `INSERT INTO inventory_write_offs
         (company_id, write_off_number, write_off_date, branch_id, cost_center_id, status, total_cost, reason, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9)
         RETURNING *`,
        [t.companyId, number, writeOffDate, body.branch_id ?? null, body.cost_center_id ?? null, totalCost, body.reason, body.notes ?? null, req.auth!.userId],
      );
      for (const item of rows) {
        await t.db.query(
          `INSERT INTO inventory_write_off_items
           (company_id, write_off_id, product_id, quantity, unit_cost, total_cost, reason, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [t.companyId, wo.rows[0].id, item.product_id, item.quantity, item.unit_cost, item.total_cost, item.reason ?? null, item.notes ?? null],
        );
      }
      let journalEntryId: string | null = null;
      if (body.status === 'posted') journalEntryId = await postWriteOff(t.db, t.companyId, wo.rows[0].id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: body.status === 'posted' ? 'inventory_writeoff.post' : 'inventory_writeoff.create', entity: 'inventory_write_off', entityId: wo.rows[0].id, data: { total_cost: totalCost, reason: body.reason } });
      await t.db.query('COMMIT');
      const created = await t.db.query(`SELECT * FROM inventory_write_offs WHERE id = $1 AND company_id = $2`, [wo.rows[0].id, t.companyId]);
      res.status(201).json({ data: { ...created.rows[0], journal_entry_id: journalEntryId ?? created.rows[0].journal_entry_id } });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/:id/post', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const journalEntryId = await postWriteOff(t.db, t.companyId, req.params.id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'inventory_writeoff.post', entity: 'inventory_write_off', entityId: req.params.id, data: { journal_entry_id: journalEntryId } });
      await t.db.query('COMMIT');
      res.json({ data: { journal_entry_id: journalEntryId } });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const woRs = await t.db.query(`SELECT * FROM inventory_write_offs WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!woRs.rowCount) throw notFound('Inventory write-off not found');
      const wo = woRs.rows[0];
      if (wo.status === 'cancelled') throw badRequest('Write-off is already cancelled');
      await assertPeriodOpen(t.db, t.companyId, wo.write_off_date);
      if (wo.status === 'posted') {
        const items = await t.db.query(
          `SELECT iwoi.*, p.quantity AS current_quantity, p.inventory_value
           FROM inventory_write_off_items iwoi
           JOIN products p ON p.id = iwoi.product_id AND p.company_id = iwoi.company_id
           WHERE iwoi.write_off_id = $1 AND iwoi.company_id = $2`,
          [req.params.id, t.companyId],
        );
        for (const item of items.rows) {
          const quantity = Number(item.current_quantity) + Number(item.quantity);
          const value = round2(Number(item.inventory_value ?? 0) + Number(item.total_cost));
          await t.db.query(`UPDATE products SET quantity = $1, inventory_value = $2 WHERE id = $3 AND company_id = $4`, [quantity, value, item.product_id, t.companyId]);
          await t.db.query(
            `INSERT INTO stock_ledger
             (company_id, product_id, source_type, source_id, movement_date, quantity_in, unit_cost, total_value, balance_quantity, balance_value)
             VALUES ($1,$2,'write_off_cancel',$3,NOW(),$4,$5,$6,$7,$8)`,
            [t.companyId, item.product_id, req.params.id, item.quantity, item.unit_cost, item.total_cost, quantity, value],
          );
        }
        let reversalId: string | null = null;
        if (wo.journal_entry_id) {
          const reversal = await reverseJournalEntry(t.db, t.companyId, wo.journal_entry_id, req.auth!.userId);
          reversalId = reversal.id;
        }
        await t.db.query(
          `UPDATE inventory_write_offs
           SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $3, reversal_journal_entry_id = $4, updated_at = NOW()
           WHERE id = $1 AND company_id = $2`,
          [req.params.id, t.companyId, req.auth!.userId, reversalId],
        );
      } else {
        await t.db.query(
          `UPDATE inventory_write_offs SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $3, updated_at = NOW()
           WHERE id = $1 AND company_id = $2`,
          [req.params.id, t.companyId, req.auth!.userId],
        );
      }
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'inventory_writeoff.cancel', entity: 'inventory_write_off', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
