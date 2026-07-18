import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { assertPeriodOpen, createJournalEntry, getSettings } from '../accounting/posting.js';

const r = Router();

const reconciliationSchema = z.object({
  account_id: z.string().uuid(),
  statement_date: z.string(),
  opening_balance: z.coerce.number().optional().nullable(),
  closing_balance: z.coerce.number(),
  notes: z.string().optional().nullable(),
});

const lineSchema = z.object({
  transaction_date: z.string(),
  description: z.string().min(1),
  debit_amount: z.coerce.number().nonnegative().default(0),
  credit_amount: z.coerce.number().nonnegative().default(0),
  reference: z.string().optional().nullable(),
});

const matchSchema = z.object({
  journal_line_id: z.string().uuid(),
});

const completeSchema = z.object({
  allow_difference: z.boolean().default(false),
});

const adjustmentSchema = z.object({
  type: z.enum(['bank_charge', 'bank_interest']),
  date: z.string(),
  amount: z.coerce.number().positive(),
  description: z.string().min(1),
  reference: z.string().optional().nullable(),
});

async function assertBankAccount(db: any, companyId: string, accountId: string) {
  const account = await db.query(`SELECT * FROM accounts WHERE id=$1 AND company_id=$2 AND type='bank'`, [accountId, companyId]);
  if (!account.rowCount) throw badRequest('Selected account must be a bank account');
  return account.rows[0];
}

async function getReconciliation(db: any, companyId: string, id: string) {
  const rec = await db.query(
    `SELECT br.*, a.name AS account_name, a.bank_name, a.iban
     FROM bank_reconciliations br
     JOIN accounts a ON a.id = br.account_id
     WHERE br.id=$1 AND br.company_id=$2`,
    [id, companyId],
  );
  if (!rec.rowCount) throw notFound('Bank reconciliation not found');
  return rec.rows[0];
}

async function assertDraftReconciliation(db: any, companyId: string, id: string) {
  const rec = await getReconciliation(db, companyId, id);
  if (rec.status !== 'draft') throw conflict('Only draft reconciliations can be changed');
  return rec;
}

async function bankChartAccountId(db: any, companyId: string) {
  const settings = await getSettings(db, companyId);
  if (!settings.bank_account_id) throw badRequest('Bank chart account is not configured');
  return settings.bank_account_id as string;
}

async function reconciliationSummary(db: any, companyId: string, rec: any) {
  const settings = await getSettings(db, companyId);
  const totals = await db.query(
    `SELECT
       COALESCE(SUM(debit_amount),0) AS statement_debits,
       COALESCE(SUM(credit_amount),0) AS statement_credits,
       COUNT(*)::int AS line_count,
       COUNT(*) FILTER (WHERE is_matched)::int AS matched_count
     FROM bank_statement_lines
     WHERE company_id=$1 AND reconciliation_id=$2`,
    [companyId, rec.id],
  );
  const system = await db.query(
    `SELECT COALESCE(SUM(jel.debit - jel.credit),0) AS balance
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.company_id=$1
       AND jel.account_id=$2
       AND je.status IN ('posted','reversed')
       AND je.entry_date <= $3`,
    [companyId, settings.bank_account_id, rec.statement_date],
  );
  const statementMovement = round2(Number(totals.rows[0].statement_credits) - Number(totals.rows[0].statement_debits));
  const calculatedStatementBalance = rec.opening_balance === null || rec.opening_balance === undefined
    ? null
    : round2(Number(rec.opening_balance) + statementMovement);
  const systemBankBalance = round2(Number(system.rows[0].balance));
  const difference = round2(Number(rec.closing_balance) - systemBankBalance);
  return {
    ...totals.rows[0],
    statement_movement: statementMovement,
    calculated_statement_balance: calculatedStatementBalance,
    system_bank_balance: systemBankBalance,
    unreconciled_difference: difference,
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ',') { row.push(cell.trim()); cell = ''; continue; }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function detailPayload(db: any, companyId: string, id: string) {
  const rec = await getReconciliation(db, companyId, id);
  const settings = await getSettings(db, companyId);
  const lines = await db.query(
    `SELECT bsl.*, jel.description AS journal_description, jel.debit AS journal_debit, jel.credit AS journal_credit,
            je.number AS journal_number, je.entry_date AS journal_entry_date, je.id AS journal_entry_id
     FROM bank_statement_lines bsl
     LEFT JOIN journal_entry_lines jel ON jel.id = bsl.matched_journal_line_id AND jel.company_id = bsl.company_id
     LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE bsl.company_id=$1 AND bsl.reconciliation_id=$2
     ORDER BY bsl.transaction_date, bsl.created_at`,
    [companyId, id],
  );
  const unmatched = await db.query(
    `SELECT jel.*, je.number AS journal_number, je.entry_date, je.memo
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.company_id=$1
       AND jel.account_id=$2
       AND je.status IN ('posted','reversed')
       AND je.entry_date <= $3
       AND NOT EXISTS (
         SELECT 1 FROM bank_statement_lines bsl
         WHERE bsl.company_id = jel.company_id
           AND bsl.matched_journal_line_id = jel.id
           AND bsl.is_matched = TRUE
       )
     ORDER BY je.entry_date DESC, je.number DESC, jel.line_no`,
    [companyId, settings.bank_account_id, rec.statement_date],
  );
  const summary = await reconciliationSummary(db, companyId, rec);
  return { ...rec, lines: lines.rows, unmatched_journal_lines: unmatched.rows, summary };
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT br.*, a.name AS account_name,
              COALESCE(lines.line_count,0)::int AS line_count,
              COALESCE(lines.matched_count,0)::int AS matched_count
       FROM bank_reconciliations br
       JOIN accounts a ON a.id = br.account_id
       LEFT JOIN (
         SELECT reconciliation_id, COUNT(*) AS line_count, COUNT(*) FILTER (WHERE is_matched) AS matched_count
         FROM bank_statement_lines
         WHERE company_id=$1
         GROUP BY reconciliation_id
       ) lines ON lines.reconciliation_id = br.id
       WHERE br.company_id=$1
       ORDER BY br.statement_date DESC, br.created_at DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = reconciliationSchema.parse(req.body);
    await assertBankAccount(t.db, t.companyId, body.account_id);
    const rs = await t.db.query(
      `INSERT INTO bank_reconciliations (company_id, account_id, statement_date, opening_balance, closing_balance, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [t.companyId, body.account_id, body.statement_date, body.opening_balance ?? null, body.closing_balance, body.notes ?? null, req.auth!.userId],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.create', entity: 'bank_reconciliation', entityId: rs.rows[0].id });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    res.json({ data: await detailPayload(t.db, t.companyId, req.params.id) });
  } catch (e) { next(e); }
});

r.get('/:id/report', async (req, res, next) => {
  try {
    const t = req.tenant!;
    res.json({ data: await detailPayload(t.db, t.companyId, req.params.id) });
  } catch (e) { next(e); }
});

r.post('/:id/lines', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await assertDraftReconciliation(t.db, t.companyId, req.params.id);
    const body = z.object({ lines: z.array(lineSchema).min(1) }).parse(req.body);
    for (const line of body.lines) {
      if (round2(line.debit_amount) <= 0 && round2(line.credit_amount) <= 0) throw badRequest('Statement line must have debit or credit amount');
      await t.db.query(
        `INSERT INTO bank_statement_lines (company_id, reconciliation_id, transaction_date, description, debit_amount, credit_amount, reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [t.companyId, req.params.id, line.transaction_date, line.description, line.debit_amount, line.credit_amount, line.reference ?? null],
      );
    }
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.lines.add', entity: 'bank_reconciliation', entityId: req.params.id });
    res.status(201).json({ data: await detailPayload(t.db, t.companyId, req.params.id) });
  } catch (e) { next(e); }
});

r.post('/:id/import-csv', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await assertDraftReconciliation(t.db, t.companyId, req.params.id);
    const body = z.object({ csv: z.string().min(1) }).parse(req.body);
    const parsed = parseCsv(body.csv);
    const hasHeader = parsed[0]?.some((cell) => /date|description|debit|credit|reference/i.test(cell));
    const rows = hasHeader ? parsed.slice(1) : parsed;
    let imported = 0;
    for (const row of rows) {
      const [transactionDate, description, debit = '0', credit = '0', reference = null] = row;
      const line = lineSchema.parse({
        transaction_date: transactionDate,
        description,
        debit_amount: debit || 0,
        credit_amount: credit || 0,
        reference,
      });
      if (round2(line.debit_amount) <= 0 && round2(line.credit_amount) <= 0) continue;
      await t.db.query(
        `INSERT INTO bank_statement_lines (company_id, reconciliation_id, transaction_date, description, debit_amount, credit_amount, reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [t.companyId, req.params.id, line.transaction_date, line.description, line.debit_amount, line.credit_amount, line.reference ?? null],
      );
      imported += 1;
    }
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.csv_import', entity: 'bank_reconciliation', entityId: req.params.id, data: { imported } });
    res.status(201).json({ data: await detailPayload(t.db, t.companyId, req.params.id), imported });
  } catch (e) { next(e); }
});

r.get('/:id/lines/:lineId/suggestions', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rec = await getReconciliation(t.db, t.companyId, req.params.id);
    const bankAccount = await bankChartAccountId(t.db, t.companyId);
    const line = await t.db.query(`SELECT * FROM bank_statement_lines WHERE id=$1 AND reconciliation_id=$2 AND company_id=$3`, [req.params.lineId, req.params.id, t.companyId]);
    if (!line.rowCount) throw notFound('Statement line not found');
    const rs = await t.db.query(
      `SELECT jel.*, je.number AS journal_number, je.entry_date, je.memo
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE jel.company_id=$1 AND jel.account_id=$2 AND je.status IN ('posted','reversed') AND je.entry_date <= $3
         AND ROUND(jel.debit::numeric,2) = ROUND($4::numeric,2)
         AND ROUND(jel.credit::numeric,2) = ROUND($5::numeric,2)
         AND NOT EXISTS (SELECT 1 FROM bank_statement_lines bsl WHERE bsl.company_id=jel.company_id AND bsl.matched_journal_line_id=jel.id AND bsl.is_matched=TRUE)
       ORDER BY ABS(je.entry_date - $6::date), je.entry_date DESC LIMIT 10`,
      [t.companyId, bankAccount, rec.statement_date, line.rows[0].credit_amount, line.rows[0].debit_amount, line.rows[0].transaction_date],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/:id/lines/:lineId/match', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await assertDraftReconciliation(t.db, t.companyId, req.params.id);
    const body = matchSchema.parse(req.body);
    const bankAccount = await bankChartAccountId(t.db, t.companyId);
    const line = await t.db.query(`SELECT * FROM bank_statement_lines WHERE id=$1 AND reconciliation_id=$2 AND company_id=$3 FOR UPDATE`, [req.params.lineId, req.params.id, t.companyId]);
    if (!line.rowCount) throw notFound('Statement line not found');
    const journalLine = await t.db.query(
      `SELECT jel.*
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE jel.id=$1 AND jel.company_id=$2 AND jel.account_id=$3 AND je.status IN ('posted','reversed')`,
      [body.journal_line_id, t.companyId, bankAccount],
    );
    if (!journalLine.rowCount) throw badRequest('Journal line must belong to the configured bank chart account');
    const alreadyMatched = await t.db.query(
      `SELECT 1 FROM bank_statement_lines WHERE company_id=$1 AND matched_journal_line_id=$2 AND is_matched=TRUE AND id<>$3`,
      [t.companyId, body.journal_line_id, req.params.lineId],
    );
    if (alreadyMatched.rowCount) throw conflict('Journal line is already matched');
    const expectedDebit = round2(Number(line.rows[0].credit_amount));
    const expectedCredit = round2(Number(line.rows[0].debit_amount));
    if (Math.abs(expectedDebit - Number(journalLine.rows[0].debit)) > 0.005 || Math.abs(expectedCredit - Number(journalLine.rows[0].credit)) > 0.005) {
      throw badRequest('Statement line amount does not match journal line amount');
    }
    await t.db.query(`UPDATE bank_statement_lines SET matched_journal_line_id=$4, is_matched=TRUE, updated_at=NOW() WHERE id=$1 AND reconciliation_id=$2 AND company_id=$3`, [req.params.lineId, req.params.id, t.companyId, body.journal_line_id]);
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.match', entity: 'bank_statement_line', entityId: req.params.lineId, data: { journal_line_id: body.journal_line_id } });
    res.json({ data: await detailPayload(t.db, t.companyId, req.params.id) });
  } catch (e) { next(e); }
});

r.post('/:id/lines/:lineId/unmatch', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await assertDraftReconciliation(t.db, t.companyId, req.params.id);
    await t.db.query(`UPDATE bank_statement_lines SET matched_journal_line_id=NULL, is_matched=FALSE, updated_at=NOW() WHERE id=$1 AND reconciliation_id=$2 AND company_id=$3`, [req.params.lineId, req.params.id, t.companyId]);
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.unmatch', entity: 'bank_statement_line', entityId: req.params.lineId });
    res.json({ data: await detailPayload(t.db, t.companyId, req.params.id) });
  } catch (e) { next(e); }
});

r.post('/:id/adjustments', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rec = await assertDraftReconciliation(t.db, t.companyId, req.params.id);
    const body = adjustmentSchema.parse(req.body);
    await assertPeriodOpen(t.db, t.companyId, body.date);
    const settings = await getSettings(t.db, t.companyId);
    await t.db.query('BEGIN');
    try {
      const amount = round2(body.amount);
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: body.date,
        memo: body.description,
        source: { type: body.type, id: req.params.id },
        userId: req.auth!.userId,
        lines: body.type === 'bank_charge'
          ? [
              { accountId: settings.bank_charges_expense_account_id, debit: amount, description: body.description },
              { accountId: settings.bank_account_id, credit: amount, description: body.description },
            ]
          : [
              { accountId: settings.bank_account_id, debit: amount, description: body.description },
              { accountId: settings.interest_income_account_id, credit: amount, description: body.description },
            ],
      });
      await t.db.query(
        `UPDATE accounts SET balance = balance + $1 WHERE id=$2 AND company_id=$3`,
        [body.type === 'bank_interest' ? amount : -amount, rec.account_id, t.companyId],
      );
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: `bank_reconciliation.adjustment.${body.type}`, entity: 'journal_entry', entityId: je.id, data: { reconciliation_id: req.params.id, amount } });
      await t.db.query('COMMIT');
      res.status(201).json({ data: { journal_entry_id: je.id, reconciliation: await detailPayload(t.db, t.companyId, req.params.id) } });
    } catch (e) { await t.db.query('ROLLBACK'); throw e; }
  } catch (e) { next(e); }
});

r.post('/:id/complete', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = completeSchema.parse(req.body);
    const rec = await assertDraftReconciliation(t.db, t.companyId, req.params.id);
    const summary = await reconciliationSummary(t.db, t.companyId, rec);
    if (Math.abs(Number(summary.unreconciled_difference)) > 0.005 && !body.allow_difference) {
      throw conflict('Reconciliation difference must be zero before completion');
    }
    const rs = await t.db.query(
      `UPDATE bank_reconciliations SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, t.companyId],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.complete', entity: 'bank_reconciliation', entityId: req.params.id, data: summary });
    res.json({ data: { ...rs.rows[0], summary } });
  } catch (e) { next(e); }
});

r.post('/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rec = await getReconciliation(t.db, t.companyId, req.params.id);
    if (rec.status === 'completed') throw conflict('Completed reconciliations cannot be cancelled');
    const rs = await t.db.query(`UPDATE bank_reconciliations SET status='cancelled', updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [req.params.id, t.companyId]);
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'bank_reconciliation.cancel', entity: 'bank_reconciliation', entityId: req.params.id });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

export default r;
