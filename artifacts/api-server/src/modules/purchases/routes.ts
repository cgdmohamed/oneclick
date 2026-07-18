import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { parsePagination } from '../../utils/pagination.js';
import { assertPeriodOpen, createJournalEntry, getSettings, postSupplierPayment, reverseJournalEntry, type JournalLineInput } from '../accounting/posting.js';
import { assertBranch, assertCostCenter } from '../../utils/dimensions.js';

const r = Router();

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  expense_account_id: z.string().uuid().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive().default(1),
  unit_cost: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).optional().nullable(),
});

const invoiceSchema = z.object({
  supplier_id: z.string().uuid(),
  number: z.string().min(1),
  supplier_number: z.string().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  discount: z.coerce.number().nonnegative().default(0),
  draft: z.boolean().default(false),
  items: z.array(itemSchema).min(1),
});

const supplierPaymentSchema = z.object({
  supplier_id: z.string().uuid(),
  purchase_invoice_id: z.string().uuid().optional().nullable(),
  account_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  branch_id: z.string().uuid().optional().nullable(),
  paid_at: z.string().optional(),
  method: z.string().default('cash'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const returnItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit_cost: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).default(15),
});

const returnSchema = z.object({
  supplier_id: z.string().uuid(),
  original_purchase_invoice_id: z.string().uuid().optional().nullable(),
  return_number: z.string().min(1),
  return_date: z.string().optional(),
  notes: z.string().optional().nullable(),
  draft: z.boolean().default(true),
  items: z.array(returnItemSchema).min(1),
});

async function postPurchaseInvoice(db: any, companyId: string, purchaseInvoiceId: string, userId?: string | null) {
  const pi = await db.query(`SELECT * FROM purchase_invoices WHERE id = $1 AND company_id = $2`, [purchaseInvoiceId, companyId]);
  if (!pi.rowCount || pi.rows[0].journal_entry_id || pi.rows[0].status === 'draft') return pi.rows[0]?.journal_entry_id;
  const settings = await getSettings(db, companyId);
  const items = await db.query(
    `SELECT pii.*, p.product_type,
            COALESCE(p.inventory_account_id, pc.inventory_account_id, $3::uuid) AS resolved_inventory_account_id,
            COALESCE(p.purchase_expense_account_id, pc.purchase_expense_account_id) AS resolved_purchase_expense_account_id
     FROM purchase_invoice_items pii
     LEFT JOIN products p ON p.id = pii.product_id AND p.company_id = pii.company_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     WHERE pii.purchase_invoice_id = $1 AND pii.company_id = $2`,
    [purchaseInvoiceId, companyId, settings.inventory_account_id],
  );
  const lines: JournalLineInput[] = [];
  const inventoryGroups = new Map<string, { accountId: string; costCenterId: string | null; amount: number }>();
  for (const item of items.rows.filter((it: any) => it.product_id && it.product_type === 'stock')) {
    const accountId = item.resolved_inventory_account_id ?? settings.inventory_account_id;
    if (!accountId) throw badRequest('Missing accounting account for inventory');
    const costCenterId = item.cost_center_id ?? null;
    const key = `${accountId}:${costCenterId ?? ''}`;
    const current = inventoryGroups.get(key);
    inventoryGroups.set(key, { accountId, costCenterId, amount: round2((current?.amount ?? 0) + Number(item.quantity) * Number(item.unit_cost)) });
  }
  for (const group of inventoryGroups.values()) {
    if (group.amount > 0) lines.push({ accountId: group.accountId, debit: group.amount, description: `Purchase ${pi.rows[0].number}`, branchId: pi.rows[0].branch_id, costCenterId: group.costCenterId });
  }

  const expenseGroups = new Map<string, { accountId: string; costCenterId: string | null; amount: number }>();
  for (const item of items.rows.filter((it: any) => !it.product_id || it.product_type !== 'stock')) {
    const accountId = item.expense_account_id ?? item.resolved_purchase_expense_account_id ?? settings.general_expenses_account_id;
    if (!accountId) throw badRequest('Missing accounting account for purchase expense');
    const costCenterId = item.cost_center_id ?? null;
    const key = `${accountId}:${costCenterId ?? ''}`;
    const current = expenseGroups.get(key);
    expenseGroups.set(key, { accountId, costCenterId, amount: round2((current?.amount ?? 0) + Number(item.quantity) * Number(item.unit_cost)) });
  }
  for (const group of expenseGroups.values()) {
    if (group.amount > 0) lines.push({ accountId: group.accountId, debit: group.amount, description: `Purchase ${pi.rows[0].number}`, branchId: pi.rows[0].branch_id, costCenterId: group.costCenterId });
  }
  if (Number(pi.rows[0].vat_amount) > 0) {
    lines.push({ accountId: settings.purchase_vat_account_id, debit: Number(pi.rows[0].vat_amount), description: `Purchase VAT ${pi.rows[0].number}`, branchId: pi.rows[0].branch_id });
  }
  lines.push({ accountId: settings.accounts_payable_account_id, credit: Number(pi.rows[0].total), description: `Purchase ${pi.rows[0].number}`, branchId: pi.rows[0].branch_id });

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: pi.rows[0].invoice_date,
    memo: `Purchase invoice ${pi.rows[0].number}`,
    source: { type: 'purchase_invoice', id: purchaseInvoiceId },
    userId,
    branchId: pi.rows[0].branch_id ?? null,
    lines,
  });
  await db.query(`UPDATE purchase_invoices SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, purchaseInvoiceId, companyId]);
  return je.id;
}

async function validatePurchaseReturn(db: any, companyId: string, body: z.infer<typeof returnSchema>) {
  const supplier = await db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [body.supplier_id, companyId]);
  if (!supplier.rowCount) throw notFound('Supplier not found');

  if (body.original_purchase_invoice_id) {
    const pi = await db.query(
      `SELECT supplier_id FROM purchase_invoices WHERE id = $1 AND company_id = $2`,
      [body.original_purchase_invoice_id, companyId],
    );
    if (!pi.rowCount) throw notFound('Purchase invoice not found');
    if (pi.rows[0].supplier_id !== body.supplier_id) throw badRequest('Purchase invoice does not belong to supplier');

    for (const item of body.items) {
      const purchased = await db.query(
        `SELECT COALESCE(SUM(quantity),0) AS quantity
         FROM purchase_invoice_items
         WHERE company_id = $1 AND purchase_invoice_id = $2 AND product_id = $3`,
        [companyId, body.original_purchase_invoice_id, item.product_id],
      );
      const returned = await db.query(
        `SELECT COALESCE(SUM(pri.quantity),0) AS quantity
         FROM purchase_return_items pri
         JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
         WHERE pri.company_id = $1
           AND pr.original_purchase_invoice_id = $2
           AND pri.product_id = $3
           AND pr.status != 'cancelled'`,
        [companyId, body.original_purchase_invoice_id, item.product_id],
      );
      if (Number(returned.rows[0].quantity) + item.quantity > Number(purchased.rows[0].quantity) + 0.0001) {
        throw badRequest('Return quantity exceeds purchased quantity');
      }
    }
  }

  for (const item of body.items) {
    const product = await db.query(`SELECT product_type FROM products WHERE id = $1 AND company_id = $2`, [item.product_id, companyId]);
    if (!product.rowCount) throw badRequest('Invalid product');
    if (product.rows[0].product_type !== 'stock') throw badRequest('Purchase returns can only adjust stock products');
  }
}

async function postPurchaseReturn(db: any, companyId: string, purchaseReturnId: string, userId?: string | null) {
  const pr = await db.query(`SELECT * FROM purchase_returns WHERE id = $1 AND company_id = $2 FOR UPDATE`, [purchaseReturnId, companyId]);
  if (!pr.rowCount) throw notFound('Purchase return not found');
  const ret = pr.rows[0];
  if (ret.status === 'posted' && ret.journal_entry_id) return ret.journal_entry_id;
  if (ret.status === 'cancelled') throw badRequest('Cancelled returns cannot be posted');
  await assertPeriodOpen(db, companyId, ret.return_date);

  const items = await db.query(
    `SELECT pri.*,
            COALESCE(p.inventory_account_id, pc.inventory_account_id) AS resolved_inventory_account_id
     FROM purchase_return_items pri
     JOIN products p ON p.id = pri.product_id AND p.company_id = pri.company_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     WHERE pri.purchase_return_id = $1 AND pri.company_id = $2`,
    [purchaseReturnId, companyId],
  );
  if (!items.rowCount) throw badRequest('Purchase return has no items');

  if (ret.original_purchase_invoice_id) {
    for (const item of items.rows) {
      const purchased = await db.query(
        `SELECT COALESCE(SUM(quantity),0) AS quantity
         FROM purchase_invoice_items
         WHERE company_id = $1 AND purchase_invoice_id = $2 AND product_id = $3`,
        [companyId, ret.original_purchase_invoice_id, item.product_id],
      );
      const returned = await db.query(
        `SELECT COALESCE(SUM(pri.quantity),0) AS quantity
         FROM purchase_return_items pri
         JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
         WHERE pri.company_id = $1
           AND pr.original_purchase_invoice_id = $2
           AND pri.product_id = $3
           AND pr.id != $4
           AND pr.status != 'cancelled'`,
        [companyId, ret.original_purchase_invoice_id, item.product_id, purchaseReturnId],
      );
      if (Number(returned.rows[0].quantity) + Number(item.quantity) > Number(purchased.rows[0].quantity) + 0.0001) {
        throw badRequest('Return quantity exceeds purchased quantity');
      }
    }
  }

  for (const item of items.rows) {
    const product = await db.query(`SELECT quantity, inventory_value FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`, [item.product_id, companyId]);
    if (!product.rowCount) throw badRequest('Invalid product');
    const oldQty = Number(product.rows[0].quantity);
    const oldValue = Number(product.rows[0].inventory_value ?? 0);
    const quantity = Number(item.quantity);
    const value = round2(quantity * Number(item.unit_cost));
    if (oldQty < quantity) throw badRequest('Purchase return would create negative stock');
    const newQty = round2(oldQty - quantity);
    const newValue = round2(Math.max(0, oldValue - value));
    await db.query(
      `UPDATE products SET quantity = $1, inventory_value = $2 WHERE id = $3 AND company_id = $4`,
      [newQty, newValue, item.product_id, companyId],
    );
    await db.query(
      `INSERT INTO stock_ledger
       (company_id, product_id, source_type, source_id, movement_date, quantity_out, unit_cost, total_value, balance_quantity, balance_value)
       VALUES ($1,$2,'purchase_return',$3,$4,$5,$6,$7,$8,$9)`,
      [companyId, item.product_id, purchaseReturnId, ret.return_date, quantity, item.unit_cost, value, newQty, newValue],
    );
  }

  if (ret.original_purchase_invoice_id) {
    const invoice = await db.query(`SELECT total, paid, remaining FROM purchase_invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [ret.original_purchase_invoice_id, companyId]);
    if (invoice.rowCount) {
      const remaining = round2(Math.max(0, Number(invoice.rows[0].remaining) - Number(ret.total)));
      const status = remaining <= 0.005 ? 'paid' : 'partial';
      await db.query(
        `UPDATE purchase_invoices SET remaining = $1, status = $2 WHERE id = $3 AND company_id = $4`,
        [remaining, status, ret.original_purchase_invoice_id, companyId],
      );
    }
  }

  const settings = await getSettings(db, companyId);
  const inventoryGroups = new Map<string, number>();
  for (const item of items.rows) {
    const accountId = item.resolved_inventory_account_id ?? settings.inventory_account_id;
    if (!accountId) throw badRequest('Missing inventory account');
    inventoryGroups.set(accountId, round2((inventoryGroups.get(accountId) ?? 0) + Number(item.quantity) * Number(item.unit_cost)));
  }
  const lines: JournalLineInput[] = [
    { accountId: settings.accounts_payable_account_id, debit: Number(ret.total), description: `Purchase return ${ret.return_number}` },
  ];
  for (const [accountId, amount] of inventoryGroups) {
    if (amount > 0) lines.push({ accountId, credit: amount, description: `Purchase return ${ret.return_number}` });
  }
  if (Number(ret.vat_amount) > 0) {
    lines.push({ accountId: settings.purchase_vat_account_id, credit: Number(ret.vat_amount), description: `Purchase return VAT ${ret.return_number}` });
  }
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: ret.return_date,
    memo: `Purchase return ${ret.return_number}`,
    source: { type: 'purchase_return', id: purchaseReturnId },
    userId,
    lines,
  });
  await db.query(
    `UPDATE purchase_returns SET status = 'posted', posted_at = NOW(), posted_by = $3, journal_entry_id = $4, updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [purchaseReturnId, companyId, userId ?? null, je.id],
  );
  return je.id;
}

r.get('/invoices', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const total = await t.db.query(`SELECT count(*)::int AS count FROM purchase_invoices WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT pi.*, s.name AS supplier_name
       FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.company_id = $1 ORDER BY pi.invoice_date DESC, pi.created_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(total.rows[0].count)));
  } catch (e) { next(e); }
});

r.get('/invoices/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const pi = await t.db.query(
      `SELECT pi.*, s.name AS supplier_name FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.id = $1 AND pi.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!pi.rowCount) throw notFound('Purchase invoice not found');
    const items = await t.db.query(`SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1 AND company_id = $2 ORDER BY created_at`, [req.params.id, t.companyId]);
    res.json({ data: { ...pi.rows[0], items: items.rows } });
  } catch (e) { next(e); }
});

r.post('/invoices', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = invoiceSchema.parse(req.body);
    await assertBranch(t.db, t.companyId, body.branch_id);
    for (const item of body.items) await assertCostCenter(t.db, t.companyId, item.cost_center_id);
    const invoiceDate = body.invoice_date ?? new Date().toISOString();
    await assertPeriodOpen(t.db, t.companyId, invoiceDate);

    const company = await t.db.query(`SELECT vat_rate FROM companies WHERE id = $1`, [t.companyId]);
    const defaultVatRate = Number(company.rows[0]?.vat_rate ?? 0);
    const productIds = [...new Set(body.items.map((it) => it.product_id).filter(Boolean))];
    const productDefaults = productIds.length
      ? await t.db.query(
          `SELECT id, product_type, vat_status, vat_rate
           FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])`,
          [t.companyId, productIds],
        )
      : { rows: [] as any[] };
    const productMap = new Map(productDefaults.rows.map((row) => [row.id, row]));
    const items = body.items.map((item) => {
      const product = item.product_id ? productMap.get(item.product_id) : null;
      const vatRate = item.vat_rate ?? (product?.vat_status === 'taxable' ? Number(product.vat_rate ?? defaultVatRate) : product ? 0 : defaultVatRate);
      return { ...item, vat_rate: vatRate };
    });

    let subtotal = 0;
    let vat = 0;
    for (const item of items) {
      const base = round2(item.quantity * item.unit_cost);
      subtotal = round2(subtotal + base);
      vat = round2(vat + base * (item.vat_rate / 100));
      if (!item.product_id && !item.expense_account_id) {
        // Allowed: posting falls back to General Expenses.
      }
    }
    const total = round2(Math.max(0, subtotal + vat - body.discount));
    const status = body.draft ? 'draft' : 'posted';

    await t.db.query('BEGIN');
    try {
      const pi = await t.db.query(
        `INSERT INTO purchase_invoices
         (company_id, supplier_id, number, supplier_number, invoice_date, due_date, status, subtotal, vat_amount, discount, total, remaining, notes, branch_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14) RETURNING *`,
        [t.companyId, body.supplier_id, body.number, body.supplier_number ?? null, invoiceDate, body.due_date ?? null, status, subtotal, vat, body.discount, total, body.notes ?? null, body.branch_id ?? null, req.auth!.userId],
      );

      for (const item of items) {
        const lineBase = round2(item.quantity * item.unit_cost);
        const lineTotal = round2(lineBase * (1 + item.vat_rate / 100));
        await t.db.query(
          `INSERT INTO purchase_invoice_items
           (company_id, purchase_invoice_id, product_id, expense_account_id, description, quantity, unit_cost, vat_rate, line_total, cost_center_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [t.companyId, pi.rows[0].id, item.product_id ?? null, item.expense_account_id ?? null, item.description, item.quantity, item.unit_cost, item.vat_rate, lineTotal, item.cost_center_id ?? null],
        );

        if (!body.draft && item.product_id) {
          const product = await t.db.query(`SELECT product_type, quantity, inventory_value FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`, [item.product_id, t.companyId]);
          if (!product.rowCount) throw badRequest(`Invalid product for "${item.description}"`);
          if (product.rows[0].product_type !== 'stock') continue;
          const oldQty = Number(product.rows[0].quantity);
          const oldValue = Number(product.rows[0].inventory_value ?? 0);
          const addedValue = round2(item.quantity * item.unit_cost);
          const newQty = oldQty + item.quantity;
          const newValue = round2(oldValue + addedValue);
          const averageCost = newQty > 0 ? round2(newValue / newQty) : 0;
          await t.db.query(
            `UPDATE products SET quantity = $1, average_cost = $2, inventory_value = $3, cost = $2 WHERE id = $4 AND company_id = $5`,
            [newQty, averageCost, newValue, item.product_id, t.companyId],
          );
          await t.db.query(
            `INSERT INTO stock_ledger
             (company_id, product_id, source_type, source_id, movement_date, quantity_in, unit_cost, total_value, balance_quantity, balance_value)
             VALUES ($1,$2,'purchase_invoice',$3,$4,$5,$6,$7,$8,$9)`,
            [t.companyId, item.product_id, pi.rows[0].id, invoiceDate, item.quantity, item.unit_cost, addedValue, newQty, newValue],
          );
        }
      }

      if (!body.draft) await postPurchaseInvoice(t.db, t.companyId, pi.rows[0].id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: body.draft ? 'purchase_invoice.draft' : 'purchase_invoice.post', entity: 'purchase_invoice', entityId: pi.rows[0].id, data: { total } });
      await t.db.query('COMMIT');
      res.status(201).json({ data: pi.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/supplier-payments', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = supplierPaymentSchema.parse(req.body);
    await assertBranch(t.db, t.companyId, body.branch_id);
    const supplier = await t.db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [body.supplier_id, t.companyId]);
    if (!supplier.rowCount) throw notFound('Supplier not found');
    const account = await t.db.query(`SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [body.account_id, t.companyId]);
    if (!account.rowCount) throw badRequest('Active payment account not found');
    const paidAt = body.paid_at ?? new Date().toISOString();
    await assertPeriodOpen(t.db, t.companyId, paidAt);

    await t.db.query('BEGIN');
    try {
      if (body.purchase_invoice_id) {
        const pi = await t.db.query(`SELECT total, paid FROM purchase_invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [body.purchase_invoice_id, t.companyId]);
        if (!pi.rowCount) throw notFound('Purchase invoice not found');
        const paid = round2(Number(pi.rows[0].paid) + body.amount);
        const remaining = round2(Number(pi.rows[0].total) - paid);
        if (remaining < -0.005) throw badRequest('Payment exceeds payable balance');
        await t.db.query(
          `UPDATE purchase_invoices SET paid = $1, remaining = GREATEST(0, $2), status = CASE WHEN $2 <= 0.005 THEN 'paid' ELSE 'partial' END
           WHERE id = $3 AND company_id = $4`,
          [paid, remaining, body.purchase_invoice_id, t.companyId],
        );
      }

      const sp = await t.db.query(
        `INSERT INTO supplier_payments
         (company_id, supplier_id, purchase_invoice_id, account_id, amount, paid_at, method, reference, notes, branch_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [t.companyId, body.supplier_id, body.purchase_invoice_id ?? null, body.account_id, body.amount, paidAt, body.method, body.reference ?? null, body.notes ?? null, body.branch_id ?? null, req.auth!.userId],
      );
      await t.db.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND company_id = $3`, [body.amount, body.account_id, t.companyId]);
      await postSupplierPayment(t.db, t.companyId, sp.rows[0].id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'supplier_payment.create', entity: 'supplier_payment', entityId: sp.rows[0].id, data: { amount: body.amount } });
      await t.db.query('COMMIT');
      res.status(201).json({ data: sp.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.get('/supplier-payments', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const total = await t.db.query(`SELECT count(*)::int AS count FROM supplier_payments WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT sp.*, s.name AS supplier_name, a.name AS account_name, pi.number AS purchase_invoice_number
       FROM supplier_payments sp
       JOIN suppliers s ON s.id = sp.supplier_id
       JOIN accounts a ON a.id = sp.account_id
       LEFT JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id
       WHERE sp.company_id = $1 ORDER BY sp.paid_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(total.rows[0].count)));
  } catch (e) { next(e); }
});

r.get('/returns', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const total = await t.db.query(`SELECT count(*)::int AS count FROM purchase_returns WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT pr.*, s.name AS supplier_name, pi.number AS original_purchase_invoice_number
       FROM purchase_returns pr
       JOIN suppliers s ON s.id = pr.supplier_id
       LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_invoice_id
       WHERE pr.company_id = $1
       ORDER BY pr.return_date DESC, pr.created_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(total.rows[0].count)));
  } catch (e) { next(e); }
});

r.get('/returns/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const pr = await t.db.query(
      `SELECT pr.*, s.name AS supplier_name, pi.number AS original_purchase_invoice_number
       FROM purchase_returns pr
       JOIN suppliers s ON s.id = pr.supplier_id
       LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_invoice_id
       WHERE pr.id = $1 AND pr.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!pr.rowCount) throw notFound('Purchase return not found');
    const items = await t.db.query(
      `SELECT pri.*, p.name AS product_name
       FROM purchase_return_items pri
       JOIN products p ON p.id = pri.product_id
       WHERE pri.purchase_return_id = $1 AND pri.company_id = $2
       ORDER BY pri.created_at`,
      [req.params.id, t.companyId],
    );
    res.json({ data: { ...pr.rows[0], items: items.rows } });
  } catch (e) { next(e); }
});

r.post('/returns', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = returnSchema.parse(req.body);
    const returnDate = body.return_date ?? new Date().toISOString();
    await validatePurchaseReturn(t.db, t.companyId, body);
    await assertPeriodOpen(t.db, t.companyId, returnDate);

    let subtotal = 0;
    let vat = 0;
    for (const item of body.items) {
      const base = round2(item.quantity * item.unit_cost);
      subtotal = round2(subtotal + base);
      vat = round2(vat + base * (item.vat_rate / 100));
    }
    const total = round2(subtotal + vat);

    await t.db.query('BEGIN');
    try {
      const pr = await t.db.query(
        `INSERT INTO purchase_returns
         (company_id, supplier_id, original_purchase_invoice_id, purchase_invoice_id, return_number, number,
          return_date, status, subtotal, vat_amount, total, notes, created_by)
         VALUES ($1,$2,$3,$3,$4,$4,$5,'draft',$6,$7,$8,$9,$10) RETURNING *`,
        [
          t.companyId,
          body.supplier_id,
          body.original_purchase_invoice_id ?? null,
          body.return_number,
          returnDate,
          subtotal,
          vat,
          total,
          body.notes ?? null,
          req.auth!.userId,
        ],
      );
      for (const item of body.items) {
        const lineTotal = round2(item.quantity * item.unit_cost * (1 + item.vat_rate / 100));
        await t.db.query(
          `INSERT INTO purchase_return_items
           (company_id, purchase_return_id, product_id, quantity, unit_cost, vat_rate, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [t.companyId, pr.rows[0].id, item.product_id, item.quantity, item.unit_cost, item.vat_rate, lineTotal],
        );
      }
      if (!body.draft) await postPurchaseReturn(t.db, t.companyId, pr.rows[0].id, req.auth!.userId);
      await audit(t.db, {
        companyId: t.companyId,
        userId: req.auth!.userId,
        action: body.draft ? 'purchase_return.draft' : 'purchase_return.post',
        entity: 'purchase_return',
        entityId: pr.rows[0].id,
        data: { total },
      });
      await t.db.query('COMMIT');
      const created = await t.db.query(`SELECT * FROM purchase_returns WHERE id = $1`, [pr.rows[0].id]);
      res.status(201).json({ data: created.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/returns/:id/post', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const jeId = await postPurchaseReturn(t.db, t.companyId, req.params.id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'purchase_return.post', entity: 'purchase_return', entityId: req.params.id, data: { journal_entry_id: jeId } });
      await t.db.query('COMMIT');
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
    const rs = await t.db.query(`SELECT * FROM purchase_returns WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/returns/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const pr = await t.db.query(`SELECT * FROM purchase_returns WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!pr.rowCount) throw notFound('Purchase return not found');
      const ret = pr.rows[0];
      if (ret.status === 'cancelled') throw badRequest('Purchase return already cancelled');
      await assertPeriodOpen(t.db, t.companyId, ret.return_date);
      if (ret.status === 'posted') {
        const items = await t.db.query(`SELECT * FROM purchase_return_items WHERE purchase_return_id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
        for (const item of items.rows) {
          const product = await t.db.query(`SELECT quantity, inventory_value FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`, [item.product_id, t.companyId]);
          const quantity = Number(product.rows[0].quantity) + Number(item.quantity);
          const value = round2(Number(product.rows[0].inventory_value ?? 0) + Number(item.quantity) * Number(item.unit_cost));
          await t.db.query(`UPDATE products SET quantity = $1, inventory_value = $2 WHERE id = $3 AND company_id = $4`, [quantity, value, item.product_id, t.companyId]);
          await t.db.query(
            `INSERT INTO stock_ledger
             (company_id, product_id, source_type, source_id, movement_date, quantity_in, unit_cost, total_value, balance_quantity, balance_value)
             VALUES ($1,$2,'purchase_return_cancel',$3,NOW(),$4,$5,$6,$7,$8)`,
            [t.companyId, item.product_id, req.params.id, item.quantity, item.unit_cost, round2(Number(item.quantity) * Number(item.unit_cost)), quantity, value],
          );
        }
        if (ret.original_purchase_invoice_id) {
          const invoice = await t.db.query(`SELECT total, paid, remaining FROM purchase_invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [ret.original_purchase_invoice_id, t.companyId]);
          if (invoice.rowCount) {
            const maxRemaining = round2(Number(invoice.rows[0].total) - Number(invoice.rows[0].paid));
            const remaining = round2(Math.min(maxRemaining, Number(invoice.rows[0].remaining) + Number(ret.total)));
            const status = remaining <= 0.005 ? 'paid' : Number(invoice.rows[0].paid) > 0 ? 'partial' : 'posted';
            await t.db.query(`UPDATE purchase_invoices SET remaining = $1, status = $2 WHERE id = $3 AND company_id = $4`, [remaining, status, ret.original_purchase_invoice_id, t.companyId]);
          }
        }
        if (ret.journal_entry_id) {
          await reverseJournalEntry(t.db, t.companyId, ret.journal_entry_id, req.auth!.userId);
        }
      }
      await t.db.query(`UPDATE purchase_returns SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'purchase_return.cancel', entity: 'purchase_return', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
