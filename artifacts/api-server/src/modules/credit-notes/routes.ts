import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { parsePagination } from '../../utils/pagination.js';
import { assertPeriodOpen, createJournalEntry, getSettings, reverseJournalEntry, type JournalLineInput } from '../accounting/posting.js';

const returnConditions = ['resellable', 'damaged', 'inspection', 'scrap'] as const;

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).default(15),
  return_condition: z.enum(returnConditions).default('resellable'),
  return_to_stock: z.boolean().default(true),
  original_invoice_item_id: z.string().uuid().optional().nullable(),
});

const createSchema = z.object({
  customer_id: z.string().uuid(),
  original_invoice_id: z.string().uuid().optional().nullable(),
  credit_note_number: z.string().min(1),
  credit_note_date: z.string().datetime().optional(),
  status: z.enum(['draft', 'posted']).optional().default('draft'),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

const r = Router();

async function validateCreditNote(db: Queryable, companyId: string, body: z.infer<typeof createSchema>, excludeCreditNoteId?: string) {
  const customer = await db.query(`SELECT id FROM clients WHERE id = $1 AND company_id = $2`, [body.customer_id, companyId]);
  if (!customer.rowCount) throw badRequest('Invalid customer');

  if (body.original_invoice_id) {
    const invoice = await db.query(`SELECT client_id FROM invoices WHERE id = $1 AND company_id = $2`, [body.original_invoice_id, companyId]);
    if (!invoice.rowCount) throw badRequest('Invalid original invoice');
    if (invoice.rows[0].client_id !== body.customer_id) throw badRequest('Original invoice belongs to another customer');
  }

  for (const item of body.items) {
    if (item.product_id) {
      const product = await db.query(`SELECT 1 FROM products WHERE id = $1 AND company_id = $2`, [item.product_id, companyId]);
      if (!product.rowCount) throw badRequest(`Invalid product for "${item.description}"`);
    }

    if (item.original_invoice_item_id && body.original_invoice_id) {
      const original = await db.query(
        `SELECT id, product_id, quantity
         FROM invoice_items
         WHERE id = $1 AND invoice_id = $2 AND company_id = $3`,
        [item.original_invoice_item_id, body.original_invoice_id, companyId],
      );
      if (!original.rowCount) throw badRequest(`Invalid original invoice item for "${item.description}"`);
      if (original.rows[0].product_id && item.product_id && original.rows[0].product_id !== item.product_id) {
        throw badRequest(`Product does not match original invoice item for "${item.description}"`);
      }
      const params: unknown[] = [companyId, body.original_invoice_id, item.original_invoice_item_id];
      let exclude = '';
      if (excludeCreditNoteId) {
        params.push(excludeCreditNoteId);
        exclude = `AND cn.id != $${params.length}`;
      }
      const returned = await db.query(
        `SELECT COALESCE(SUM(cni.quantity),0) AS quantity
         FROM credit_note_items cni
         JOIN credit_notes cn ON cn.id = cni.credit_note_id
         WHERE cn.company_id = $1
           AND cn.original_invoice_id = $2
           AND cni.original_invoice_item_id = $3
           AND cn.status != 'cancelled'
           ${exclude}`,
        params,
      );
      const remaining = Number(original.rows[0].quantity) - Number(returned.rows[0].quantity);
      if (item.quantity > remaining + 0.0005) throw badRequest(`Returned quantity exceeds invoiced quantity for "${item.description}"`);
    }
  }
}

async function originalUnitCost(db: Queryable, companyId: string, invoiceId: string | null, productId: string) {
  if (invoiceId) {
    const ledger = await db.query(
      `SELECT unit_cost
       FROM stock_ledger
       WHERE company_id = $1 AND source_type = 'invoice' AND source_id = $2 AND product_id = $3
       ORDER BY created_at DESC LIMIT 1`,
      [companyId, invoiceId, productId],
    );
    if (ledger.rowCount) return Number(ledger.rows[0].unit_cost ?? 0);
  }
  const product = await db.query(
    `SELECT COALESCE(NULLIF(average_cost, 0), cost, 0) AS unit_cost
     FROM products WHERE id = $1 AND company_id = $2`,
    [productId, companyId],
  );
  return Number(product.rows[0]?.unit_cost ?? 0);
}

async function postCreditNote(db: Queryable, companyId: string, creditNoteId: string, userId?: string | null) {
  const noteRs = await db.query(`SELECT * FROM credit_notes WHERE id = $1 AND company_id = $2 FOR UPDATE`, [creditNoteId, companyId]);
  if (!noteRs.rowCount) throw notFound('Credit note not found');
  const note = noteRs.rows[0];
  if (note.status === 'posted' && note.journal_entry_id) return note.journal_entry_id as string;
  if (note.status === 'cancelled') throw badRequest('Cancelled credit notes cannot be posted');
  await assertPeriodOpen(db, companyId, note.credit_note_date);

  const settings = await getSettings(db, companyId);
  const items = await db.query(
    `SELECT cni.*, p.product_type,
            COALESCE(p.sales_returns_account_id, pc.sales_returns_account_id, parent_pc.sales_returns_account_id, $3::uuid) AS resolved_sales_returns_account_id,
            COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id, $4::uuid) AS resolved_inventory_account_id,
            COALESCE(p.cogs_account_id, pc.cogs_account_id, parent_pc.cogs_account_id, $5::uuid) AS resolved_cogs_account_id
     FROM credit_note_items cni
     LEFT JOIN products p ON p.id = cni.product_id AND p.company_id = cni.company_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
     WHERE cni.credit_note_id = $1 AND cni.company_id = $2
     ORDER BY cni.created_at`,
    [creditNoteId, companyId, settings.sales_returns_account_id, settings.inventory_account_id, settings.cogs_account_id],
  );
  await validateCreditNote(db, companyId, {
    customer_id: note.customer_id,
    original_invoice_id: note.original_invoice_id,
    credit_note_number: note.credit_note_number,
    credit_note_date: new Date(note.credit_note_date).toISOString(),
    status: 'posted',
    notes: note.notes,
    items: items.rows.map((item) => ({
      product_id: item.product_id,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      vat_rate: Number(item.vat_rate),
      return_condition: item.return_condition ?? 'resellable',
      return_to_stock: Boolean(item.return_to_stock),
      original_invoice_item_id: item.original_invoice_item_id,
    })),
  }, creditNoteId);

  const lines: JournalLineInput[] = [
    { accountId: settings.accounts_receivable_account_id, credit: Number(note.total), description: `Credit note ${note.credit_note_number}` },
  ];
  const returnGroups = new Map<string, number>();
  for (const item of items.rows) {
    const accountId = item.resolved_sales_returns_account_id ?? settings.sales_returns_account_id;
    if (!accountId) throw badRequest('Missing sales returns account');
    returnGroups.set(accountId, round2((returnGroups.get(accountId) ?? 0) + Number(item.quantity) * Number(item.unit_price)));
  }
  for (const [accountId, amount] of returnGroups) {
    if (amount > 0) lines.push({ accountId, debit: amount, description: `Credit note ${note.credit_note_number}` });
  }
  if (Number(note.vat_amount) > 0) {
    lines.push({ accountId: settings.sales_vat_account_id, debit: Number(note.vat_amount), description: `Credit note VAT ${note.credit_note_number}` });
  }

  const cogsGroups = new Map<string, { inventoryAccountId: string; cogsAccountId: string; amount: number }>();
  for (const item of items.rows) {
    if (!item.product_id) continue;
    if (item.product_type !== 'stock') continue;
    if (!item.return_to_stock) continue;
    const unitCost = await originalUnitCost(db, companyId, note.original_invoice_id, item.product_id);
    const value = round2(Number(item.quantity) * unitCost);
    const stock = await db.query(
      `UPDATE products
       SET quantity = quantity + $1,
           inventory_value = inventory_value + $4
       WHERE id = $2 AND company_id = $3
       RETURNING quantity, inventory_value`,
      [Number(item.quantity), item.product_id, companyId, value],
    );
    await db.query(
      `INSERT INTO stock_ledger
       (company_id, product_id, source_type, source_id, movement_date, quantity_in, unit_cost, total_value, balance_quantity, balance_value)
       VALUES ($1,$2,'credit_note',$3,$4,$5,$6,$7,$8,$9)`,
      [companyId, item.product_id, creditNoteId, note.credit_note_date, item.quantity, unitCost, value, stock.rows[0].quantity, stock.rows[0].inventory_value],
    );
    const inventoryAccountId = item.resolved_inventory_account_id ?? settings.inventory_account_id;
    const cogsAccountId = item.resolved_cogs_account_id ?? settings.cogs_account_id;
    if (!inventoryAccountId || !cogsAccountId) throw badRequest('Missing inventory or COGS account');
    const key = `${inventoryAccountId}:${cogsAccountId}`;
    const current = cogsGroups.get(key);
    cogsGroups.set(key, { inventoryAccountId, cogsAccountId, amount: round2((current?.amount ?? 0) + value) });
  }
  for (const group of cogsGroups.values()) {
    if (group.amount > 0) {
      lines.push({ accountId: group.inventoryAccountId, debit: group.amount, description: `Credit note inventory ${note.credit_note_number}` });
      lines.push({ accountId: group.cogsAccountId, credit: group.amount, description: `Credit note COGS ${note.credit_note_number}` });
    }
  }

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: note.credit_note_date,
    memo: `Credit note ${note.credit_note_number}`,
    source: { type: 'credit_note', id: creditNoteId },
    userId,
    lines,
  });

  if (note.original_invoice_id) {
    const inv = await db.query(`SELECT total, paid, remaining FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [note.original_invoice_id, companyId]);
    if (inv.rowCount) {
      const remaining = round2(Math.max(0, Number(inv.rows[0].remaining) - Number(note.total)));
      const paid = Number(inv.rows[0].paid);
      const status = remaining <= 0.005 ? 'paid' : paid > 0 ? 'partial' : 'sent';
      await db.query(`UPDATE invoices SET remaining = $1, status = $2 WHERE id = $3 AND company_id = $4`, [remaining, status, note.original_invoice_id, companyId]);
    }
  }

  await db.query(
    `UPDATE credit_notes
     SET status = 'posted', posted_at = NOW(), posted_by = $3, journal_entry_id = $4, updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [creditNoteId, companyId, userId ?? null, je.id],
  );
  return je.id as string;
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const total = await t.db.query(`SELECT count(*)::int AS count FROM credit_notes WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT cn.*, c.name AS customer_name, i.number AS original_invoice_number
       FROM credit_notes cn
       JOIN clients c ON c.id = cn.customer_id
       LEFT JOIN invoices i ON i.id = cn.original_invoice_id
       WHERE cn.company_id = $1
       ORDER BY cn.created_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(total.rows[0].count)));
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const note = await t.db.query(
      `SELECT cn.*, c.name AS customer_name, i.number AS original_invoice_number
       FROM credit_notes cn
       JOIN clients c ON c.id = cn.customer_id
       LEFT JOIN invoices i ON i.id = cn.original_invoice_id
       WHERE cn.id = $1 AND cn.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!note.rowCount) throw notFound('Credit note not found');
    const items = await t.db.query(
      `SELECT cni.*, p.name AS product_name
       FROM credit_note_items cni
       LEFT JOIN products p ON p.id = cni.product_id
       WHERE cni.credit_note_id = $1 AND cni.company_id = $2
       ORDER BY cni.created_at`,
      [req.params.id, t.companyId],
    );
    res.json({ data: { ...note.rows[0], items: items.rows } });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);
    const noteDate = body.credit_note_date ? new Date(body.credit_note_date) : new Date();
    await assertPeriodOpen(t.db, t.companyId, noteDate);
    await validateCreditNote(t.db, t.companyId, body);

    let subtotal = 0;
    let vat = 0;
    for (const item of body.items) {
      const base = round2(item.quantity * item.unit_price);
      subtotal = round2(subtotal + base);
      vat = round2(vat + base * (item.vat_rate / 100));
    }
    const total = round2(subtotal + vat);

    await t.db.query('BEGIN');
    try {
      const note = await t.db.query(
        `INSERT INTO credit_notes
         (company_id, customer_id, original_invoice_id, credit_note_number, credit_note_date, status,
          subtotal, vat_amount, total, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10)
         RETURNING *`,
        [t.companyId, body.customer_id, body.original_invoice_id ?? null, body.credit_note_number, noteDate, subtotal, vat, total, body.notes ?? null, req.auth!.userId],
      );
      for (const item of body.items) {
        const lineTotal = round2(item.quantity * item.unit_price * (1 + item.vat_rate / 100));
        await t.db.query(
          `INSERT INTO credit_note_items
           (company_id, credit_note_id, product_id, description, quantity, unit_price, vat_rate, line_total, return_condition, return_to_stock, original_invoice_item_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [t.companyId, note.rows[0].id, item.product_id ?? null, item.description, item.quantity, item.unit_price, item.vat_rate, lineTotal, item.return_condition, item.return_to_stock, item.original_invoice_item_id ?? null],
        );
      }
      if (body.status === 'posted') await postCreditNote(t.db, t.companyId, note.rows[0].id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: body.status === 'posted' ? 'credit_note.post' : 'credit_note.draft', entity: 'credit_note', entityId: note.rows[0].id });
      await t.db.query('COMMIT');
      const created = await t.db.query(`SELECT * FROM credit_notes WHERE id = $1 AND company_id = $2`, [note.rows[0].id, t.companyId]);
      res.status(201).json({ data: created.rows[0] });
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
      const journalEntryId = await postCreditNote(t.db, t.companyId, req.params.id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'credit_note.post', entity: 'credit_note', entityId: req.params.id });
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
      const noteRs = await t.db.query(`SELECT * FROM credit_notes WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!noteRs.rowCount) throw notFound('Credit note not found');
      const note = noteRs.rows[0];
      if (note.status === 'cancelled') throw badRequest('Credit note is already cancelled');
      await assertPeriodOpen(t.db, t.companyId, note.credit_note_date);

      if (note.status === 'posted') {
        const items = await t.db.query(
          `SELECT cni.*, p.product_type
           FROM credit_note_items cni
           LEFT JOIN products p ON p.id = cni.product_id AND p.company_id = cni.company_id
           WHERE cni.credit_note_id = $1 AND cni.company_id = $2`,
          [req.params.id, t.companyId],
        );
        for (const item of items.rows) {
          if (!item.product_id) continue;
          if (item.product_type !== 'stock') continue;
          if (!item.return_to_stock) continue;
          const ledger = await t.db.query(
            `SELECT unit_cost FROM stock_ledger
             WHERE company_id = $1 AND source_type = 'credit_note' AND source_id = $2 AND product_id = $3
             ORDER BY created_at DESC LIMIT 1`,
            [t.companyId, req.params.id, item.product_id],
          );
          const unitCost = Number(ledger.rows[0]?.unit_cost ?? 0);
          const value = round2(Number(item.quantity) * unitCost);
          const stock = await t.db.query(
            `UPDATE products
             SET quantity = quantity - $1,
                 inventory_value = GREATEST(0, inventory_value - $4)
             WHERE id = $2 AND company_id = $3 AND quantity >= $1
             RETURNING quantity, inventory_value`,
            [Number(item.quantity), item.product_id, t.companyId, value],
          );
          if (!stock.rowCount) throw badRequest(`Cancelling would create negative stock for "${item.description}"`);
          await t.db.query(
            `INSERT INTO stock_ledger
             (company_id, product_id, source_type, source_id, movement_date, quantity_out, unit_cost, total_value, balance_quantity, balance_value)
             VALUES ($1,$2,'credit_note_cancel',$3,NOW(),$4,$5,$6,$7,$8)`,
            [t.companyId, item.product_id, req.params.id, item.quantity, unitCost, value, stock.rows[0].quantity, stock.rows[0].inventory_value],
          );
        }
        if (note.original_invoice_id) {
          const inv = await t.db.query(`SELECT total, paid, remaining FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [note.original_invoice_id, t.companyId]);
          if (inv.rowCount) {
            const maxRemaining = round2(Math.max(0, Number(inv.rows[0].total) - Number(inv.rows[0].paid)));
            const remaining = round2(Math.min(maxRemaining, Number(inv.rows[0].remaining) + Number(note.total)));
            const status = remaining <= 0.005 ? 'paid' : Number(inv.rows[0].paid) > 0 ? 'partial' : 'sent';
            await t.db.query(`UPDATE invoices SET remaining = $1, status = $2 WHERE id = $3 AND company_id = $4`, [remaining, status, note.original_invoice_id, t.companyId]);
          }
        }
        if (note.journal_entry_id) await reverseJournalEntry(t.db, t.companyId, note.journal_entry_id, req.auth!.userId);
      }

      await t.db.query(`UPDATE credit_notes SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'credit_note.cancel', entity: 'credit_note', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
