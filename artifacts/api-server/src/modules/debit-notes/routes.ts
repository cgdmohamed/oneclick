import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { parsePagination } from '../../utils/pagination.js';
import { assertPeriodOpen, createJournalEntry, getSettings, recomputeInvoiceBalance, reverseJournalEntry, type JournalLineInput } from '../accounting/posting.js';

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).default(15),
  original_invoice_item_id: z.string().uuid().optional().nullable(),
});

const createSchema = z.object({
  customer_id: z.string().uuid(),
  original_invoice_id: z.string().uuid().optional().nullable(),
  debit_note_date: z.string().datetime().optional(),
  status: z.enum(['draft', 'posted']).optional().default('draft'),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

const r = Router();

async function validateDebitNote(db: Queryable, companyId: string, body: z.infer<typeof createSchema>) {
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
        `SELECT id FROM invoice_items WHERE id = $1 AND invoice_id = $2 AND company_id = $3`,
        [item.original_invoice_item_id, body.original_invoice_id, companyId],
      );
      if (!original.rowCount) throw badRequest(`Invalid original invoice item for "${item.description}"`);
    }
  }
}

async function postDebitNote(db: Queryable, companyId: string, debitNoteId: string, userId?: string | null) {
  const noteRs = await db.query(`SELECT * FROM debit_notes WHERE id = $1 AND company_id = $2 FOR UPDATE`, [debitNoteId, companyId]);
  if (!noteRs.rowCount) throw notFound('Debit note not found');
  const note = noteRs.rows[0];
  if (note.status === 'posted' && note.journal_entry_id) return note.journal_entry_id as string;
  if (note.status === 'cancelled') throw badRequest('Cancelled debit notes cannot be posted');
  await assertPeriodOpen(db, companyId, note.debit_note_date);

  const settings = await getSettings(db, companyId);
  const items = await db.query(
    `SELECT dni.*,
            COALESCE(p.sales_account_id, pc.sales_account_id, parent_pc.sales_account_id, $3::uuid) AS resolved_sales_account_id
     FROM debit_note_items dni
     LEFT JOIN products p ON p.id = dni.product_id AND p.company_id = dni.company_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
     WHERE dni.debit_note_id = $1 AND dni.company_id = $2
     ORDER BY dni.created_at`,
    [debitNoteId, companyId, settings.sales_revenue_account_id],
  );

  // VAT-01-style safeguard: refuse to post a debit note whose stored total
  // doesn't reconcile with subtotal + vat before it reaches the ledger.
  const expectedTotal = round2(Number(note.subtotal) + Number(note.vat_amount));
  if (Math.abs(expectedTotal - Number(note.total)) > 0.01) {
    throw badRequest(`Debit note ${note.debit_note_number} total does not reconcile with subtotal and VAT — refusing to post`);
  }

  const lines: JournalLineInput[] = [
    { accountId: settings.accounts_receivable_account_id, debit: Number(note.total), description: `Debit note ${note.debit_note_number}`, clientId: note.customer_id },
  ];
  const revenueGroups = new Map<string, number>();
  for (const item of items.rows) {
    const accountId = item.resolved_sales_account_id ?? settings.sales_revenue_account_id;
    if (!accountId) throw badRequest('Missing sales revenue account');
    revenueGroups.set(accountId, round2((revenueGroups.get(accountId) ?? 0) + Number(item.quantity) * Number(item.unit_price)));
  }
  for (const [accountId, amount] of revenueGroups) {
    if (amount > 0) lines.push({ accountId, credit: amount, description: `Debit note ${note.debit_note_number}` });
  }
  if (Number(note.vat_amount) > 0) {
    lines.push({ accountId: settings.sales_vat_account_id, credit: Number(note.vat_amount), description: `Debit note VAT ${note.debit_note_number}` });
  }

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: note.debit_note_date,
    memo: `Debit note ${note.debit_note_number}`,
    source: { type: 'debit_note', id: debitNoteId },
    userId,
    lines,
  });

  await db.query(
    `UPDATE debit_notes
     SET status = 'posted', posted_at = NOW(), posted_by = $3, journal_entry_id = $4, updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [debitNoteId, companyId, userId ?? null, je.id],
  );
  if (note.original_invoice_id) await recomputeInvoiceBalance(db, companyId, note.original_invoice_id);
  return je.id as string;
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const total = await t.db.query(`SELECT count(*)::int AS count FROM debit_notes WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT dn.*, c.name AS customer_name, i.number AS original_invoice_number
       FROM debit_notes dn
       JOIN clients c ON c.id = dn.customer_id
       LEFT JOIN invoices i ON i.id = dn.original_invoice_id
       WHERE dn.company_id = $1
       ORDER BY dn.created_at DESC`,
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
      `SELECT dn.*, c.name AS customer_name, i.number AS original_invoice_number
       FROM debit_notes dn
       JOIN clients c ON c.id = dn.customer_id
       LEFT JOIN invoices i ON i.id = dn.original_invoice_id
       WHERE dn.id = $1 AND dn.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!note.rowCount) throw notFound('Debit note not found');
    const items = await t.db.query(
      `SELECT dni.*, p.name AS product_name
       FROM debit_note_items dni
       LEFT JOIN products p ON p.id = dni.product_id
       WHERE dni.debit_note_id = $1 AND dni.company_id = $2
       ORDER BY dni.created_at`,
      [req.params.id, t.companyId],
    );
    res.json({ data: { ...note.rows[0], items: items.rows } });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);
    const noteDate = body.debit_note_date ? new Date(body.debit_note_date) : new Date();
    await assertPeriodOpen(t.db, t.companyId, noteDate);
    await validateDebitNote(t.db, t.companyId, body);

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
      const seqRs = await t.db.query(
        `UPDATE companies SET debit_note_sequence = debit_note_sequence + 1 WHERE id = $1 RETURNING debit_note_sequence`,
        [t.companyId],
      );
      const debitNoteNumber = `DN-${noteDate.getFullYear()}-${String(seqRs.rows[0].debit_note_sequence).padStart(4, '0')}`;
      const note = await t.db.query(
        `INSERT INTO debit_notes
         (company_id, customer_id, original_invoice_id, debit_note_number, debit_note_date, status,
          subtotal, vat_amount, total, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10)
         RETURNING *`,
        [t.companyId, body.customer_id, body.original_invoice_id ?? null, debitNoteNumber, noteDate, subtotal, vat, total, body.notes ?? null, req.auth!.userId],
      );
      for (const item of body.items) {
        const lineTotal = round2(item.quantity * item.unit_price * (1 + item.vat_rate / 100));
        await t.db.query(
          `INSERT INTO debit_note_items
           (company_id, debit_note_id, product_id, description, quantity, unit_price, vat_rate, line_total, original_invoice_item_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [t.companyId, note.rows[0].id, item.product_id ?? null, item.description, item.quantity, item.unit_price, item.vat_rate, lineTotal, item.original_invoice_item_id ?? null],
        );
      }
      if (body.status === 'posted') await postDebitNote(t.db, t.companyId, note.rows[0].id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: body.status === 'posted' ? 'debit_note.post' : 'debit_note.draft', entity: 'debit_note', entityId: note.rows[0].id });
      await t.db.query('COMMIT');
      const created = await t.db.query(`SELECT * FROM debit_notes WHERE id = $1 AND company_id = $2`, [note.rows[0].id, t.companyId]);
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
      const journalEntryId = await postDebitNote(t.db, t.companyId, req.params.id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'debit_note.post', entity: 'debit_note', entityId: req.params.id });
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
      const noteRs = await t.db.query(`SELECT * FROM debit_notes WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!noteRs.rowCount) throw notFound('Debit note not found');
      const note = noteRs.rows[0];
      if (note.status === 'cancelled') throw badRequest('Debit note is already cancelled');
      await assertPeriodOpen(t.db, t.companyId, note.debit_note_date);

      if (note.status === 'posted') {
        if (note.journal_entry_id) await reverseJournalEntry(t.db, t.companyId, note.journal_entry_id, req.auth!.userId);
      }

      await t.db.query(`UPDATE debit_notes SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      if (note.status === 'posted' && note.original_invoice_id) await recomputeInvoiceBalance(t.db, t.companyId, note.original_invoice_id);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'debit_note.cancel', entity: 'debit_note', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
