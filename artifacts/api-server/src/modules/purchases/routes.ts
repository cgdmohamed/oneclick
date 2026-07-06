import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { parsePagination } from '../../utils/pagination.js';
import { assertPeriodOpen, createJournalEntry, getSettings, postSupplierPayment, type JournalLineInput } from '../accounting/posting.js';

const r = Router();

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  expense_account_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive().default(1),
  unit_cost: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).default(15),
});

const invoiceSchema = z.object({
  supplier_id: z.string().uuid(),
  number: z.string().min(1),
  supplier_number: z.string().optional().nullable(),
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
  paid_at: z.string().optional(),
  method: z.string().default('cash'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

async function postPurchaseInvoice(db: any, companyId: string, purchaseInvoiceId: string, userId?: string | null) {
  const pi = await db.query(`SELECT * FROM purchase_invoices WHERE id = $1 AND company_id = $2`, [purchaseInvoiceId, companyId]);
  if (!pi.rowCount || pi.rows[0].journal_entry_id || pi.rows[0].status === 'draft') return pi.rows[0]?.journal_entry_id;
  const settings = await getSettings(db, companyId);
  const items = await db.query(`SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1 AND company_id = $2`, [purchaseInvoiceId, companyId]);
  const lines: JournalLineInput[] = [];
  const inventoryAmount = round2(items.rows.filter((it: any) => it.product_id).reduce((sum: number, it: any) => sum + Number(it.quantity) * Number(it.unit_cost), 0));
  if (inventoryAmount > 0) lines.push({ accountId: settings.inventory_account_id, debit: inventoryAmount, description: `Purchase ${pi.rows[0].number}` });

  const expenseGroups = new Map<string, number>();
  for (const item of items.rows.filter((it: any) => !it.product_id)) {
    const accountId = item.expense_account_id ?? settings.general_expenses_account_id;
    expenseGroups.set(accountId, round2((expenseGroups.get(accountId) ?? 0) + Number(item.quantity) * Number(item.unit_cost)));
  }
  for (const [accountId, amount] of expenseGroups) {
    if (amount > 0) lines.push({ accountId, debit: amount, description: `Purchase ${pi.rows[0].number}` });
  }
  if (Number(pi.rows[0].vat_amount) > 0) {
    lines.push({ accountId: settings.purchase_vat_account_id, debit: Number(pi.rows[0].vat_amount), description: `Purchase VAT ${pi.rows[0].number}` });
  }
  lines.push({ accountId: settings.accounts_payable_account_id, credit: Number(pi.rows[0].total), description: `Purchase ${pi.rows[0].number}` });

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: pi.rows[0].invoice_date,
    memo: `Purchase invoice ${pi.rows[0].number}`,
    source: { type: 'purchase_invoice', id: purchaseInvoiceId },
    userId,
    lines,
  });
  await db.query(`UPDATE purchase_invoices SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, purchaseInvoiceId, companyId]);
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
    const invoiceDate = body.invoice_date ?? new Date().toISOString();
    await assertPeriodOpen(t.db, t.companyId, invoiceDate);

    let subtotal = 0;
    let vat = 0;
    for (const item of body.items) {
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
         (company_id, supplier_id, number, supplier_number, invoice_date, due_date, status, subtotal, vat_amount, discount, total, remaining, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13) RETURNING *`,
        [t.companyId, body.supplier_id, body.number, body.supplier_number ?? null, invoiceDate, body.due_date ?? null, status, subtotal, vat, body.discount, total, body.notes ?? null, req.auth!.userId],
      );

      for (const item of body.items) {
        const lineBase = round2(item.quantity * item.unit_cost);
        const lineTotal = round2(lineBase * (1 + item.vat_rate / 100));
        await t.db.query(
          `INSERT INTO purchase_invoice_items
           (company_id, purchase_invoice_id, product_id, expense_account_id, description, quantity, unit_cost, vat_rate, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [t.companyId, pi.rows[0].id, item.product_id ?? null, item.expense_account_id ?? null, item.description, item.quantity, item.unit_cost, item.vat_rate, lineTotal],
        );

        if (!body.draft && item.product_id) {
          const product = await t.db.query(`SELECT quantity, inventory_value FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`, [item.product_id, t.companyId]);
          if (!product.rowCount) throw badRequest(`Invalid product for "${item.description}"`);
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
         (company_id, supplier_id, purchase_invoice_id, account_id, amount, paid_at, method, reference, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [t.companyId, body.supplier_id, body.purchase_invoice_id ?? null, body.account_id, body.amount, paidAt, body.method, body.reference ?? null, body.notes ?? null, req.auth!.userId],
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

r.post('/returns', async (req, res, next) => {
  try {
    // TODO(accounting): keep purchase returns hidden from the UI until the full
    // inventory reversal, weighted-average impact, payable update, and journal
    // posting workflow is implemented end to end.
    res.status(501).json({ error: 'not_implemented', message: 'Purchase return shell is available in schema; posting workflow is reserved for the next increment.' });
  } catch (e) { next(e); }
});

export default r;
