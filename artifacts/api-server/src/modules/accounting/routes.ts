import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { parsePagination } from '../../utils/pagination.js';
import {
  assertPeriodOpen,
  createJournalEntry,
  ensureAccountingSetup,
  getSettings,
  postDraftJournalEntry,
  reverseJournalEntry,
  type JournalLineInput,
} from './posting.js';

const r = Router();

const accountSchema = z.object({
  parent_id: z.string().uuid().optional().nullable(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(200),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  normal_balance: z.enum(['debit', 'credit']),
  is_active: z.boolean().default(true),
});

const periodSchema = z.object({
  name: z.string().min(1),
  starts_on: z.string(),
  ends_on: z.string(),
});

const settingsSchema = z.record(z.string(), z.string().uuid().nullable());

const journalSchema = z.object({
  entry_date: z.string(),
  memo: z.string().optional().nullable(),
  status: z.enum(['draft', 'posted']).default('draft'),
  source_type: z.string().optional().nullable(),
  source_id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  lines: z.array(z.object({
    account_id: z.string().uuid(),
    description: z.string().optional().nullable(),
    debit: z.coerce.number().nonnegative().default(0),
    credit: z.coerce.number().nonnegative().default(0),
    branch_id: z.string().uuid().optional().nullable(),
    cost_center_id: z.string().uuid().optional().nullable(),
  })).min(2),
});

r.post('/initialize', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await ensureAccountingSetup(t.db, t.companyId);
    await audit(t.db, {
      companyId: t.companyId,
      userId: req.auth!.userId,
      action: 'accounting.initialize',
      entity: 'accounting_settings',
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.get('/chart-accounts', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await ensureAccountingSetup(t.db, t.companyId);
    const rs = await t.db.query(
      `SELECT ca.*, p.code AS parent_code, p.name AS parent_name
       FROM chart_accounts ca
       LEFT JOIN chart_accounts p ON p.id = ca.parent_id
       WHERE ca.company_id = $1
       ORDER BY ca.code`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/chart-accounts', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = accountSchema.parse(req.body);
    const rs = await t.db.query(
      `INSERT INTO chart_accounts (company_id, parent_id, code, name, type, normal_balance, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [t.companyId, body.parent_id ?? null, body.code, body.name, body.type, body.normal_balance, body.is_active],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'chart_account.create', entity: 'chart_account', entityId: rs.rows[0].id });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/chart-accounts/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const posted = await t.db.query(
      `SELECT 1 FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE jel.account_id = $1 AND jel.company_id = $2 AND je.status = 'posted'
       LIMIT 1`,
      [req.params.id, t.companyId],
    );
    const body = accountSchema.partial().parse(req.body);
    if (posted.rowCount && ('code' in body || 'type' in body || 'normal_balance' in body)) {
      throw conflict('Accounts used by posted entries can only be renamed, reparented, or deactivated');
    }
    const fields = Object.keys(body);
    if (!fields.length) throw badRequest('No changes supplied');
    const sets = fields.map((key, i) => `${key} = $${i + 3}`).join(', ');
    const values = fields.map((key) => (body as Record<string, unknown>)[key]);
    const rs = await t.db.query(
      `UPDATE chart_accounts SET ${sets}, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, ...values],
    );
    if (!rs.rowCount) throw notFound('Account not found');
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'chart_account.update', entity: 'chart_account', entityId: req.params.id, data: body });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/settings', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await ensureAccountingSetup(t.db, t.companyId);
    const rs = await t.db.query(`SELECT * FROM accounting_settings WHERE company_id = $1`, [t.companyId]);
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/settings', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = settingsSchema.parse(req.body);
    const allowed = [
      'accounts_receivable_account_id','accounts_payable_account_id','sales_revenue_account_id',
      'sales_returns_account_id','sales_vat_account_id','purchase_vat_account_id','inventory_account_id','cogs_account_id',
      'cash_account_id','bank_account_id','wallet_account_id','general_expenses_account_id',
      'retained_earnings_account_id','inventory_adjustment_account_id',
      'bad_debt_expense_account_id','doubtful_debts_allowance_account_id','income_summary_account_id',
      'fixed_assets_account_id','accumulated_depreciation_account_id','depreciation_expense_account_id',
      'asset_disposal_gain_loss_account_id',
      'salaries_expense_account_id','employee_payables_account_id','social_insurance_payable_account_id',
      'payroll_tax_payable_account_id','payroll_deductions_payable_account_id',
      'bank_charges_expense_account_id','interest_income_account_id',
      'inventory_loss_expense_account_id',
    ];
    const fields = Object.keys(body).filter((key) => allowed.includes(key));
    if (!fields.length) throw badRequest('No accounting settings supplied');
    const sets = fields.map((key, i) => `${key} = $${i + 2}`).join(', ');
    const values = fields.map((key) => body[key]);
    const rs = await t.db.query(
      `UPDATE accounting_settings SET ${sets}, updated_at = NOW() WHERE company_id = $1 RETURNING *`,
      [t.companyId, ...values],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'accounting_settings.update', entity: 'accounting_settings', data: body });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/fiscal-years', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT * FROM fiscal_years WHERE company_id = $1 ORDER BY starts_on DESC`, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/fiscal-years', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = periodSchema.parse(req.body);
    const rs = await t.db.query(
      `INSERT INTO fiscal_years (company_id, name, starts_on, ends_on)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [t.companyId, body.name, body.starts_on, body.ends_on],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

async function closingPreview(db: any, companyId: string, fiscalYearId: string) {
  await ensureAccountingSetup(db, companyId);
  const fy = await db.query(`SELECT * FROM fiscal_years WHERE id = $1 AND company_id = $2`, [fiscalYearId, companyId]);
  if (!fy.rowCount) throw notFound('Fiscal year not found');
  const year = fy.rows[0];
  const settings = await getSettings(db, companyId);
  const retained = await db.query(`SELECT code, name FROM chart_accounts WHERE id = $1 AND company_id = $2`, [settings.retained_earnings_account_id, companyId]);

  const draft = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM journal_entries
     WHERE company_id = $1 AND fiscal_year_id = $2 AND status = 'draft'`,
    [companyId, fiscalYearId],
  );
  const existingClosing = await db.query(
    `SELECT id, number FROM journal_entries
     WHERE company_id = $1 AND fiscal_year_id = $2 AND source_type = 'year_end_closing'
     LIMIT 1`,
    [companyId, fiscalYearId],
  );
  const periods = await db.query(
    `SELECT COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE is_locked = FALSE)::int AS unlocked
     FROM accounting_periods
     WHERE company_id = $1 AND fiscal_year_id = $2`,
    [companyId, fiscalYearId],
  );
  const balances = await db.query(
    `SELECT ca.id AS account_id, ca.code AS account_code, ca.name AS account_name, ca.type,
            CASE
              WHEN ca.type = 'revenue' THEN COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 ELSE jel.credit - jel.debit END),0)
              ELSE COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 ELSE jel.debit - jel.credit END),0)
            END AS amount
     FROM chart_accounts ca
     LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
     LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
       AND je.status IN ('posted','reversed')
       AND je.entry_date >= $2::date
       AND je.entry_date <= $3::date
       AND COALESCE(je.source_type, '') != 'year_end_closing'
     WHERE ca.company_id = $1 AND ca.type IN ('revenue','expense')
     GROUP BY ca.id, ca.code, ca.name, ca.type
     ORDER BY ca.code`,
    [companyId, year.starts_on, year.ends_on],
  );

  const lines: Array<{ account_id: string; account_code?: string; account_name?: string; description: string; debit: number; credit: number }> = [];
  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const row of balances.rows) {
    const amount = Number(row.amount ?? 0);
    if (Math.abs(amount) <= 0.005) continue;
    if (row.type === 'revenue') {
      totalRevenue += amount;
      lines.push({
        account_id: row.account_id,
        account_code: row.account_code,
        account_name: row.account_name,
        description: `Close ${row.account_name}`,
        debit: amount > 0 ? Math.abs(amount) : 0,
        credit: amount < 0 ? Math.abs(amount) : 0,
      });
    } else {
      totalExpenses += amount;
      lines.push({
        account_id: row.account_id,
        account_code: row.account_code,
        account_name: row.account_name,
        description: `Close ${row.account_name}`,
        debit: amount < 0 ? Math.abs(amount) : 0,
        credit: amount > 0 ? Math.abs(amount) : 0,
      });
    }
  }
  const netIncome = Number((totalRevenue - totalExpenses).toFixed(2));
  if (netIncome > 0.005) {
    lines.push({
      account_id: settings.retained_earnings_account_id,
      account_code: retained.rows[0]?.code,
      account_name: retained.rows[0]?.name ?? 'Retained Earnings',
      description: `Transfer ${year.name} profit to retained earnings`,
      debit: 0,
      credit: Math.abs(netIncome),
    });
  } else if (netIncome < -0.005) {
    lines.push({
      account_id: settings.retained_earnings_account_id,
      account_code: retained.rows[0]?.code,
      account_name: retained.rows[0]?.name ?? 'Retained Earnings',
      description: `Transfer ${year.name} loss to retained earnings`,
      debit: Math.abs(netIncome),
      credit: 0,
    });
  }
  const totalDebit = Number(lines.reduce((sum, line) => sum + line.debit, 0).toFixed(2));
  const totalCredit = Number(lines.reduce((sum, line) => sum + line.credit, 0).toFixed(2));
  const blockers: string[] = [];
  if (year.is_closed) blockers.push('Fiscal year is already locked');
  if (year.closing_journal_entry_id || existingClosing.rowCount) blockers.push('Closing journal already exists for this fiscal year');
  if (Number(draft.rows[0].count) > 0) blockers.push('Fiscal year has unposted draft journal entries');
  if (Number(periods.rows[0].count) > 0 && Number(periods.rows[0].unlocked) > 0) blockers.push('All accounting periods in the fiscal year must be locked first');
  if (!lines.length) blockers.push('No revenue or expense balances to close');
  if (Math.abs(totalDebit - totalCredit) > 0.005) blockers.push('Generated closing entry is not balanced');

  return {
    fiscal_year: year,
    totals: {
      revenue: totalRevenue.toFixed(2),
      expenses: totalExpenses.toFixed(2),
      net_income: netIncome.toFixed(2),
      debit: totalDebit.toFixed(2),
      credit: totalCredit.toFixed(2),
    },
    lines,
    blockers,
    can_create: blockers.length === 0,
    existing_closing: existingClosing.rows[0] ?? null,
  };
}

r.get('/closing/:fiscalYearId/preview', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const preview = await closingPreview(t.db, t.companyId, req.params.fiscalYearId);
    res.json({ data: preview });
  } catch (e) { next(e); }
});

r.post('/closing/:fiscalYearId/create', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      await t.db.query(`SELECT id FROM fiscal_years WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.fiscalYearId, t.companyId]);
      const preview = await closingPreview(t.db, t.companyId, req.params.fiscalYearId);
      if (!preview.can_create) throw conflict(preview.blockers.join('; '));
      const entry = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: preview.fiscal_year.ends_on,
        memo: `Year-end closing ${preview.fiscal_year.name}`,
        source: { type: 'year_end_closing', id: req.params.fiscalYearId },
        userId: req.auth!.userId,
        allowLockedPeriod: true,
        lines: preview.lines.map((line) => ({
          accountId: line.account_id,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
        })),
      });
      await t.db.query(
        `UPDATE fiscal_years SET closing_journal_entry_id = $1, updated_at = NOW()
         WHERE id = $2 AND company_id = $3`,
        [entry.id, req.params.fiscalYearId, t.companyId],
      );
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'year_end_closing.create', entity: 'fiscal_year', entityId: req.params.fiscalYearId, data: { journal_entry_id: entry.id } });
      await t.db.query('COMMIT');
      res.status(201).json({ data: entry });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/closing/:fiscalYearId/lock', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `UPDATE fiscal_years
       SET is_closed = TRUE, closed_at = NOW(), closed_by = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND closing_journal_entry_id IS NOT NULL
       RETURNING *`,
      [req.params.fiscalYearId, t.companyId, req.auth!.userId],
    );
    if (!rs.rowCount) throw conflict('Create the closing journal before locking the fiscal year');
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'fiscal_year.lock', entity: 'fiscal_year', entityId: req.params.fiscalYearId });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/periods', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT ap.*, fy.name AS fiscal_year_name
       FROM accounting_periods ap JOIN fiscal_years fy ON fy.id = ap.fiscal_year_id
       WHERE ap.company_id = $1 ORDER BY ap.starts_on DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/periods', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = periodSchema.extend({ fiscal_year_id: z.string().uuid() }).parse(req.body);
    const rs = await t.db.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year_id, name, starts_on, ends_on)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [t.companyId, body.fiscal_year_id, body.name, body.starts_on, body.ends_on],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/periods/:id/lock', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `UPDATE accounting_periods SET is_locked = TRUE, locked_at = NOW(), locked_by = $3
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, req.auth!.userId],
    );
    if (!rs.rowCount) throw notFound('Period not found');
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'period.lock', entity: 'accounting_period', entityId: req.params.id });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/periods/:id/unlock', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `UPDATE accounting_periods SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId],
    );
    if (!rs.rowCount) throw notFound('Period not found');
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'period.unlock', entity: 'accounting_period', entityId: req.params.id });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/journal-entries', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const branchId = typeof req.query.branch_id === 'string' ? req.query.branch_id : null;
    const params: unknown[] = [t.companyId];
    const where = ['je.company_id = $1'];
    if (branchId) { params.push(branchId); where.push(`je.branch_id = $${params.length}`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = await t.db.query(`SELECT count(*)::int AS count FROM journal_entries je ${whereSql}`, params);
    const applied = p.applyTo(
      `SELECT je.*, b.name AS branch_name
       FROM journal_entries je
       LEFT JOIN branches b ON b.id = je.branch_id
       ${whereSql}
       ORDER BY je.entry_date DESC, je.created_at DESC`,
      params,
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(total.rows[0].count)));
  } catch (e) { next(e); }
});

r.get('/journal-entries/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const je = await t.db.query(`SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!je.rowCount) throw notFound('Journal entry not found');
    const lines = await t.db.query(
      `SELECT jel.*, ca.code AS account_code, ca.name AS account_name,
              b.name AS branch_name, cc.name AS cost_center_name
       FROM journal_entry_lines jel JOIN chart_accounts ca ON ca.id = jel.account_id
       LEFT JOIN branches b ON b.id = jel.branch_id
       LEFT JOIN cost_centers cc ON cc.id = jel.cost_center_id
       WHERE jel.journal_entry_id = $1 AND jel.company_id = $2 ORDER BY jel.line_no`,
      [req.params.id, t.companyId],
    );
    res.json({ data: { ...je.rows[0], lines: lines.rows } });
  } catch (e) { next(e); }
});

r.post('/journal-entries', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = journalSchema.parse(req.body);
    const entry = await createJournalEntry(t.db, {
      companyId: t.companyId,
      entryDate: body.entry_date,
      memo: body.memo,
      status: body.status,
      source: body.source_type && body.source_id ? { type: body.source_type, id: body.source_id } : undefined,
      userId: req.auth!.userId,
      branchId: body.branch_id ?? null,
      lines: body.lines.map((line): JournalLineInput => ({
        accountId: line.account_id,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        branchId: line.branch_id ?? body.branch_id ?? null,
        costCenterId: line.cost_center_id ?? null,
      })),
    });
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: `journal.${body.status}`, entity: 'journal_entry', entityId: entry.id });
    res.status(201).json({ data: entry });
  } catch (e) { next(e); }
});

r.patch('/journal-entries/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const existing = await t.db.query(`SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!existing.rowCount) throw notFound('Journal entry not found');
    if (existing.rows[0].status !== 'draft') throw conflict('Posted journal entries cannot be edited');
    await assertPeriodOpen(t.db, t.companyId, existing.rows[0].entry_date);
    const body = z.object({ memo: z.string().optional().nullable(), entry_date: z.string().optional() }).parse(req.body);
    const rs = await t.db.query(
      `UPDATE journal_entries
       SET memo = COALESCE($3, memo), entry_date = COALESCE($4::date, entry_date), updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, body.memo ?? null, body.entry_date ?? null],
    );
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/journal-entries/:id/post', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const entry = await postDraftJournalEntry(t.db, t.companyId, req.params.id, req.auth!.userId);
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'journal.post', entity: 'journal_entry', entityId: req.params.id });
    res.json({ data: entry });
  } catch (e) { next(e); }
});

r.post('/journal-entries/:id/reverse', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const entry = await reverseJournalEntry(t.db, t.companyId, req.params.id, req.auth!.userId);
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'journal.reverse', entity: 'journal_entry', entityId: req.params.id, data: { reversal_id: entry.id } });
    res.status(201).json({ data: entry });
  } catch (e) { next(e); }
});

r.post('/migration/opening-balances', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = z.object({
      entry_date: z.string().optional(),
      mark_legacy: z.boolean().default(true),
    }).parse(req.body ?? {});
    const entryDate = body.entry_date ?? new Date().toISOString().slice(0, 10);
    await ensureAccountingSetup(t.db, t.companyId);

    const settings = (await t.db.query(`SELECT * FROM accounting_settings WHERE company_id = $1`, [t.companyId])).rows[0];
    const cashBalances = await t.db.query(
      `SELECT type, COALESCE(SUM(balance),0) AS balance FROM accounts
       WHERE company_id = $1 GROUP BY type`,
      [t.companyId],
    );
    const receivables = await t.db.query(
      `SELECT COALESCE(SUM(remaining),0) AS amount FROM invoices
       WHERE company_id = $1 AND status != 'cancelled'`,
      [t.companyId],
    );
    const payables = await t.db.query(
      `SELECT COALESCE(SUM(remaining),0) AS amount FROM purchase_invoices
       WHERE company_id = $1 AND status != 'cancelled'`,
      [t.companyId],
    );
    const inventory = await t.db.query(
      `SELECT COALESCE(SUM(inventory_value),0) AS amount FROM products WHERE company_id = $1`,
      [t.companyId],
    );

    const lines: JournalLineInput[] = [];
    for (const row of cashBalances.rows) {
      const amount = Number(row.balance);
      if (amount <= 0) continue;
      const accountId = row.type === 'bank' ? settings.bank_account_id : row.type === 'wallet' ? settings.wallet_account_id : settings.cash_account_id;
      lines.push({ accountId, debit: amount, description: `Opening ${row.type} balance` });
    }
    if (Number(receivables.rows[0].amount) > 0) {
      lines.push({ accountId: settings.accounts_receivable_account_id, debit: Number(receivables.rows[0].amount), description: 'Opening customer receivables' });
    }
    if (Number(inventory.rows[0].amount) > 0) {
      lines.push({ accountId: settings.inventory_account_id, debit: Number(inventory.rows[0].amount), description: 'Opening inventory value' });
    }
    if (Number(payables.rows[0].amount) > 0) {
      lines.push({ accountId: settings.accounts_payable_account_id, credit: Number(payables.rows[0].amount), description: 'Opening supplier payables' });
    }

    const debit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
    const diff = debit - credit;
    if (diff > 0) lines.push({ accountId: settings.retained_earnings_account_id, credit: diff, description: 'Opening balance equity' });
    if (diff < 0) lines.push({ accountId: settings.retained_earnings_account_id, debit: Math.abs(diff), description: 'Opening balance equity' });
    if (!lines.length) throw badRequest('No balances found to migrate');

    await t.db.query('BEGIN');
    try {
      const entry = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate,
        memo: 'Opening balances generated from legacy data',
        source: { type: 'opening_balance', id: t.companyId },
        userId: req.auth!.userId,
        lines,
      });
      if (body.mark_legacy) {
        await t.db.query(`UPDATE invoices SET accounting_migration_status = 'legacy' WHERE company_id = $1 AND journal_entry_id IS NULL`, [t.companyId]);
        await t.db.query(`UPDATE payments SET accounting_migration_status = 'legacy' WHERE company_id = $1 AND journal_entry_id IS NULL`, [t.companyId]);
        await t.db.query(`UPDATE payouts SET accounting_migration_status = 'legacy' WHERE company_id = $1 AND journal_entry_id IS NULL`, [t.companyId]);
        await t.db.query(`UPDATE stock_movements SET accounting_migration_status = 'legacy' WHERE company_id = $1 AND journal_entry_id IS NULL`, [t.companyId]);
      }
      await audit(t.db, {
        companyId: t.companyId,
        userId: req.auth!.userId,
        action: 'accounting.migrate_opening_balances',
        entity: 'journal_entry',
        entityId: entry.id,
        data: { lines: lines.length, debit, credit },
      });
      await t.db.query('COMMIT');
      res.status(201).json({ data: entry });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
