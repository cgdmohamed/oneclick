import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { assertPeriodOpen, createJournalEntry, getSettings, reverseJournalEntry } from '../accounting/posting.js';

const allowanceSchema = z.object({
  allowance_date: z.string().datetime().optional(),
  customer_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  notes: z.string().optional().nullable(),
});

const writeOffSchema = z.object({
  write_off_date: z.string().datetime().optional(),
  customer_id: z.string().uuid(),
  invoice_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  reason: z.string().optional().nullable(),
});

const r = Router();

async function customerOutstanding(db: any, companyId: string, customerId: string) {
  const rs = await db.query(
    `SELECT GREATEST(0,
       COALESCE(SUM(i.remaining),0)
       - COALESCE((
           SELECT SUM(amount)
           FROM bad_debt_write_offs bwo
           WHERE bwo.company_id = $1 AND bwo.customer_id = $2
             AND bwo.invoice_id IS NULL AND bwo.status = 'posted'
         ),0)
     ) AS outstanding
     FROM invoices i
     WHERE i.company_id = $1 AND i.client_id = $2 AND i.status != 'cancelled'`,
    [companyId, customerId],
  );
  return round2(Number(rs.rows[0]?.outstanding ?? 0));
}

r.get('/allowances', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT dda.*, c.name AS customer_name
       FROM doubtful_debt_allowances dda
       LEFT JOIN clients c ON c.id = dda.customer_id
       WHERE dda.company_id = $1
       ORDER BY dda.allowance_date DESC, dda.created_at DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/allowances', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = allowanceSchema.parse(req.body);
    const date = body.allowance_date ?? new Date().toISOString();
    await assertPeriodOpen(t.db, t.companyId, date);
    if (body.customer_id) {
      const c = await t.db.query(`SELECT 1 FROM clients WHERE id = $1 AND company_id = $2`, [body.customer_id, t.companyId]);
      if (!c.rowCount) throw badRequest('Invalid customer');
    }
    const settings = await getSettings(t.db, t.companyId);
    await t.db.query('BEGIN');
    try {
      const ins = await t.db.query(
        `INSERT INTO doubtful_debt_allowances (company_id, customer_id, allowance_date, amount, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [t.companyId, body.customer_id ?? null, date, round2(body.amount), body.notes ?? null, req.auth!.userId],
      );
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: date,
        memo: `Doubtful debt allowance${body.customer_id ? '' : ' (general)'}`,
        source: { type: 'doubtful_debt_allowance', id: ins.rows[0].id },
        userId: req.auth!.userId,
        lines: [
          { accountId: settings.bad_debt_expense_account_id, debit: round2(body.amount), description: body.notes },
          { accountId: settings.doubtful_debts_allowance_account_id, credit: round2(body.amount), description: body.notes },
        ],
      });
      await t.db.query(`UPDATE doubtful_debt_allowances SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, ins.rows[0].id, t.companyId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bad_debt.allowance.create', entity: 'doubtful_debt_allowance', entityId: ins.rows[0].id });
      await t.db.query('COMMIT');
      res.status(201).json({ data: { ...ins.rows[0], journal_entry_id: je.id } });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/allowances/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const rs = await t.db.query(`SELECT * FROM doubtful_debt_allowances WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!rs.rowCount) throw notFound('Allowance not found');
      const row = rs.rows[0];
      if (row.status === 'cancelled') throw badRequest('Allowance is already cancelled');
      await assertPeriodOpen(t.db, t.companyId, row.allowance_date);
      if (row.journal_entry_id) await reverseJournalEntry(t.db, t.companyId, row.journal_entry_id, req.auth!.userId);
      await t.db.query(`UPDATE doubtful_debt_allowances SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $3, updated_at = NOW() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId, req.auth!.userId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bad_debt.allowance.cancel', entity: 'doubtful_debt_allowance', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.get('/write-offs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT bwo.*, c.name AS customer_name, i.number AS invoice_number
       FROM bad_debt_write_offs bwo
       JOIN clients c ON c.id = bwo.customer_id
       LEFT JOIN invoices i ON i.id = bwo.invoice_id
       WHERE bwo.company_id = $1
       ORDER BY bwo.write_off_date DESC, bwo.created_at DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/write-offs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = writeOffSchema.parse(req.body);
    const date = body.write_off_date ?? new Date().toISOString();
    const amount = round2(body.amount);
    await assertPeriodOpen(t.db, t.companyId, date);

    const customer = await t.db.query(`SELECT 1 FROM clients WHERE id = $1 AND company_id = $2`, [body.customer_id, t.companyId]);
    if (!customer.rowCount) throw badRequest('Invalid customer');
    if (body.invoice_id) {
      const inv = await t.db.query(`SELECT client_id, remaining FROM invoices WHERE id = $1 AND company_id = $2 AND status != 'cancelled'`, [body.invoice_id, t.companyId]);
      if (!inv.rowCount) throw badRequest('Invalid invoice');
      if (inv.rows[0].client_id !== body.customer_id) throw badRequest('Invoice belongs to another customer');
      if (amount > round2(Number(inv.rows[0].remaining)) + 0.005) throw badRequest('Write-off exceeds invoice outstanding balance');
    } else {
      const outstanding = await customerOutstanding(t.db, t.companyId, body.customer_id);
      if (amount > outstanding + 0.005) throw badRequest('Write-off exceeds customer outstanding balance');
    }

    const settings = await getSettings(t.db, t.companyId);
    await t.db.query('BEGIN');
    try {
      const ins = await t.db.query(
        `INSERT INTO bad_debt_write_offs (company_id, customer_id, invoice_id, write_off_date, amount, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [t.companyId, body.customer_id, body.invoice_id ?? null, date, amount, body.reason ?? null, req.auth!.userId],
      );
      if (body.invoice_id) {
        const inv = await t.db.query(`SELECT total, paid, remaining FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [body.invoice_id, t.companyId]);
        const remaining = round2(Math.max(0, Number(inv.rows[0].remaining) - amount));
        const status = remaining <= 0.005 ? 'paid' : Number(inv.rows[0].paid) > 0 ? 'partial' : 'sent';
        await t.db.query(`UPDATE invoices SET remaining = $1, status = $2 WHERE id = $3 AND company_id = $4`, [remaining, status, body.invoice_id, t.companyId]);
      }
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: date,
        memo: 'Bad debt write-off',
        source: { type: 'bad_debt_write_off', id: ins.rows[0].id },
        userId: req.auth!.userId,
        lines: [
          { accountId: settings.doubtful_debts_allowance_account_id, debit: amount, description: body.reason },
          { accountId: settings.accounts_receivable_account_id, credit: amount, description: body.reason },
        ],
      });
      await t.db.query(`UPDATE bad_debt_write_offs SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, ins.rows[0].id, t.companyId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bad_debt.write_off.create', entity: 'bad_debt_write_off', entityId: ins.rows[0].id });
      await t.db.query('COMMIT');
      res.status(201).json({ data: { ...ins.rows[0], journal_entry_id: je.id } });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/write-offs/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const rs = await t.db.query(`SELECT * FROM bad_debt_write_offs WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!rs.rowCount) throw notFound('Write-off not found');
      const row = rs.rows[0];
      if (row.status === 'cancelled') throw badRequest('Write-off is already cancelled');
      await assertPeriodOpen(t.db, t.companyId, row.write_off_date);
      if (row.invoice_id) {
        const inv = await t.db.query(`SELECT total, paid, remaining FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [row.invoice_id, t.companyId]);
        if (inv.rowCount) {
          const maxRemaining = round2(Math.max(0, Number(inv.rows[0].total) - Number(inv.rows[0].paid)));
          const remaining = round2(Math.min(maxRemaining, Number(inv.rows[0].remaining) + Number(row.amount)));
          const status = remaining <= 0.005 ? 'paid' : Number(inv.rows[0].paid) > 0 ? 'partial' : 'sent';
          await t.db.query(`UPDATE invoices SET remaining = $1, status = $2 WHERE id = $3 AND company_id = $4`, [remaining, status, row.invoice_id, t.companyId]);
        }
      }
      if (row.journal_entry_id) await reverseJournalEntry(t.db, t.companyId, row.journal_entry_id, req.auth!.userId);
      await t.db.query(`UPDATE bad_debt_write_offs SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $3, updated_at = NOW() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId, req.auth!.userId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bad_debt.write_off.cancel', entity: 'bad_debt_write_off', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
