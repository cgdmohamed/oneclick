import pg from 'pg';
import { createJournalEntry, ensureAccountingSetup, ensureFiscalYear, postSalesInvoice, reverseJournalEntry } from '../src/modules/accounting/posting.js';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[accounting-qa] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

type AccountSettings = Record<string, string>;

function fail(message: string): never {
  throw new Error(`[accounting-qa] ${message}`);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function one<T = any>(client: pg.PoolClient, sql: string, params: unknown[] = []): Promise<T> {
  const rs = await client.query(sql, params);
  if (!rs.rowCount) fail(`Expected one row for query: ${sql}`);
  return rs.rows[0] as T;
}

async function scalarNumber(client: pg.PoolClient, sql: string, params: unknown[] = []) {
  const row = await one<Record<string, string>>(client, sql, params);
  return Number(Object.values(row)[0] ?? 0);
}

async function assertBalancedJournals(client: pg.PoolClient, companyId: string) {
  const rs = await client.query(
    `SELECT je.number, COALESCE(SUM(jel.debit),0) AS debit, COALESCE(SUM(jel.credit),0) AS credit
     FROM journal_entries je
     JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
     WHERE je.company_id = $1
     GROUP BY je.id, je.number
     HAVING ABS(COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0)) > 0.005`,
    [companyId],
  );
  if (rs.rowCount) fail(`Unbalanced journal entries found: ${rs.rows.map((r) => r.number).join(', ')}`);
}

async function assertTrialBalance(client: pg.PoolClient, companyId: string) {
  const row = await one<{ debit: string; credit: string }>(
    client,
    `SELECT COALESCE(SUM(jel.debit),0) AS debit, COALESCE(SUM(jel.credit),0) AS credit
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.company_id = $1 AND je.status IN ('posted','reversed')`,
    [companyId],
  );
  const debit = Number(row.debit);
  const credit = Number(row.credit);
  if (Math.abs(debit - credit) > 0.005) fail(`Trial balance mismatch: debit=${debit}, credit=${credit}`);
}

async function assertBalanceSheet(client: pg.PoolClient, companyId: string, to: string) {
  const fy = await one<{ id: string; starts_on: string }>(
    client,
    `SELECT id, starts_on FROM fiscal_years
     WHERE company_id = $1 AND starts_on <= $2::date AND ends_on >= $2::date
     ORDER BY starts_on DESC LIMIT 1`,
    [companyId, to],
  );
  const closingCount = await scalarNumber(
    client,
    `SELECT COUNT(*)::int AS count
     FROM journal_entries
     WHERE company_id = $1
       AND fiscal_year_id = $2
       AND source_type = 'year_end_closing'
       AND status IN ('posted','reversed')
       AND entry_date <= $3::date`,
    [companyId, fy.id, to],
  );
  const row = await one<{ assets: string; liabilities: string; equity: string; revenue: string; expenses: string }>(
    client,
    `WITH lines AS (
       SELECT ca.type, jel.debit, jel.credit, je.source_type, je.entry_date
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_accounts ca ON ca.id = jel.account_id
       WHERE je.company_id = $1 AND je.status IN ('posted','reversed') AND je.entry_date <= $2::date
     )
     SELECT
       COALESCE(SUM(CASE WHEN type = 'asset' THEN debit - credit ELSE 0 END),0) AS assets,
       COALESCE(SUM(CASE WHEN type = 'liability' THEN credit - debit ELSE 0 END),0) AS liabilities,
       COALESCE(SUM(CASE WHEN type = 'equity' THEN credit - debit ELSE 0 END),0) AS equity,
       COALESCE(SUM(CASE WHEN type = 'revenue' AND entry_date >= $3::date AND COALESCE(source_type,'') != 'year_end_closing' THEN credit - debit ELSE 0 END),0) AS revenue,
       COALESCE(SUM(CASE WHEN type = 'expense' AND entry_date >= $3::date AND COALESCE(source_type,'') != 'year_end_closing' THEN debit - credit ELSE 0 END),0) AS expenses
     FROM lines`,
    [companyId, to, fy.starts_on],
  );
  const assets = Number(row.assets);
  const liabilities = Number(row.liabilities);
  const equity = Number(row.equity);
  const currentYearProfit = closingCount > 0 ? 0 : Number(row.revenue) - Number(row.expenses);
  const difference = round2(assets - (liabilities + equity + currentYearProfit));
  if (Math.abs(difference) > 0.005) {
    fail(`Balance sheet equation failed: assets=${assets}, liabilities=${liabilities}, equity=${equity}, cypl=${currentYearProfit}, diff=${difference}`);
  }
}

async function assertLedger(client: pg.PoolClient, companyId: string, accountId: string, expected: number, label: string, normal: 'debit' | 'credit' = 'debit') {
  const expression = normal === 'debit' ? 'jel.debit - jel.credit' : 'jel.credit - jel.debit';
  const actual = await scalarNumber(
    client,
    `SELECT COALESCE(SUM(${expression}),0) AS balance
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.company_id = $1 AND je.status IN ('posted','reversed') AND jel.account_id = $2`,
    [companyId, accountId],
  );
  if (Math.abs(round2(actual) - round2(expected)) > 0.005) {
    fail(`${label} mismatch: expected=${expected}, actual=${actual}`);
  }
}

async function run() {
  const client = await pool.connect();
  const results: string[] = [];
  try {
    await client.query('BEGIN');

    const suffix = Date.now().toString();
    const user = await one<{ id: string }>(
      client,
      `INSERT INTO users (email, password_hash, name, email_verified_at, onboarding_done)
       VALUES ($1, 'qa', 'Accounting QA', NOW(), TRUE) RETURNING id`,
      [`accounting-qa-${suffix}@example.test`],
    );
    const company = await one<{ id: string }>(
      client,
      `INSERT INTO companies (name, email, currency, invoice_currency_symbol)
       VALUES ($1, $2, 'EGP', 'ج.م') RETURNING id`,
      [`Accounting QA ${suffix}`, `company-qa-${suffix}@example.test`],
    );
    const companyId = company.id;
    await ensureAccountingSetup(client, companyId);
    await ensureFiscalYear(client, companyId, '2026-01-01');
    await client.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year_id, name, starts_on, ends_on)
       SELECT $1, id, '2026', starts_on, ends_on FROM fiscal_years WHERE company_id = $1 AND name = '2026'
       ON CONFLICT DO NOTHING`,
      [companyId],
    );
    const settings = await one<AccountSettings>(client, `SELECT * FROM accounting_settings WHERE company_id = $1`, [companyId]);
    const branch = await one<{ id: string }>(client, `INSERT INTO branches (company_id, code, name) VALUES ($1,'CAI','Cairo') RETURNING id`, [companyId]);
    const costCenter = await one<{ id: string }>(client, `INSERT INTO cost_centers (company_id, code, name) VALUES ($1,'OPS','Operations') RETURNING id`, [companyId]);

    const source = async (type: string) => (await one<{ id: string }>(client, `SELECT gen_random_uuid() AS id`)).id;
    const post = async (memo: string, type: string, lines: Parameters<typeof createJournalEntry>[1]['lines']) => {
      const sourceId = await source(type);
      const entry = await createJournalEntry(client, {
        companyId,
        entryDate: '2026-06-30',
        memo,
        source: { type, id: sourceId },
        userId: user.id,
        branchId: branch.id,
        lines: lines.map((line) => ({ ...line, branchId: line.branchId ?? branch.id })),
      });
      results.push(`${memo}: ${entry.number}`);
      return entry.id as string;
    };

    await post('Opening stock', 'opening_stock', [
      { accountId: settings.inventory_account_id, debit: 1000, costCenterId: costCenter.id },
      { accountId: settings.retained_earnings_account_id, credit: 1000 },
    ]);
    await post('Sales invoice with VAT and COGS', 'invoice', [
      { accountId: settings.accounts_receivable_account_id, debit: 1140 },
      { accountId: settings.sales_revenue_account_id, credit: 1000, costCenterId: costCenter.id },
      { accountId: settings.sales_vat_account_id, credit: 140 },
      { accountId: settings.cogs_account_id, debit: 600, costCenterId: costCenter.id },
      { accountId: settings.inventory_account_id, credit: 600, costCenterId: costCenter.id },
    ]);
    await post('Customer collection', 'payment', [
      { accountId: settings.bank_account_id, debit: 500 },
      { accountId: settings.accounts_receivable_account_id, credit: 500 },
    ]);
    await post('Sales return credit note', 'credit_note', [
      { accountId: settings.sales_returns_account_id, debit: 200, costCenterId: costCenter.id },
      { accountId: settings.sales_vat_account_id, debit: 28 },
      { accountId: settings.accounts_receivable_account_id, credit: 228 },
      { accountId: settings.inventory_account_id, debit: 120, costCenterId: costCenter.id },
      { accountId: settings.cogs_account_id, credit: 120, costCenterId: costCenter.id },
    ]);
    await post('Purchase invoice with VAT', 'purchase_invoice', [
      { accountId: settings.inventory_account_id, debit: 500, costCenterId: costCenter.id },
      { accountId: settings.purchase_vat_account_id, debit: 70 },
      { accountId: settings.accounts_payable_account_id, credit: 570 },
    ]);
    await post('Supplier payment', 'supplier_payment', [
      { accountId: settings.accounts_payable_account_id, debit: 300 },
      { accountId: settings.bank_account_id, credit: 300 },
    ]);
    await post('Purchase return', 'purchase_return', [
      { accountId: settings.accounts_payable_account_id, debit: 114 },
      { accountId: settings.inventory_account_id, credit: 100, costCenterId: costCenter.id },
      { accountId: settings.purchase_vat_account_id, credit: 14 },
    ]);
    await post('Expense payout', 'payout', [
      { accountId: settings.general_expenses_account_id, debit: 50, costCenterId: costCenter.id },
      { accountId: settings.cash_account_id, credit: 50 },
    ]);
    await post('Bad debt allowance', 'doubtful_debt_allowance', [
      { accountId: settings.bad_debt_expense_account_id, debit: 30, costCenterId: costCenter.id },
      { accountId: settings.doubtful_debts_allowance_account_id, credit: 30 },
    ]);
    await post('Bad debt write-off', 'bad_debt_write_off', [
      { accountId: settings.doubtful_debts_allowance_account_id, debit: 20 },
      { accountId: settings.accounts_receivable_account_id, credit: 20 },
    ]);
    await post('Payroll run', 'payroll_run', [
      { accountId: settings.salaries_expense_account_id, debit: 1000, costCenterId: costCenter.id },
      { accountId: settings.employee_payables_account_id, credit: 900 },
      { accountId: settings.social_insurance_payable_account_id, credit: 50 },
      { accountId: settings.payroll_tax_payable_account_id, credit: 50 },
    ]);
    await post('Payroll payment', 'payroll_payment', [
      { accountId: settings.employee_payables_account_id, debit: 900 },
      { accountId: settings.bank_account_id, credit: 900 },
    ]);
    await post('Fixed asset acquisition', 'fixed_asset_acquisition', [
      { accountId: settings.fixed_assets_account_id, debit: 2400 },
      { accountId: settings.bank_account_id, credit: 2400 },
    ]);
    await post('Depreciation run', 'depreciation_run', [
      { accountId: settings.depreciation_expense_account_id, debit: 100, costCenterId: costCenter.id },
      { accountId: settings.accumulated_depreciation_account_id, credit: 100 },
    ]);
    await post('Bank reconciliation charge', 'bank_charge', [
      { accountId: settings.bank_charges_expense_account_id, debit: 25, costCenterId: costCenter.id },
      { accountId: settings.bank_account_id, credit: 25 },
    ]);
    await post('Inventory write-off', 'inventory_write_off', [
      { accountId: settings.inventory_loss_expense_account_id, debit: 40, costCenterId: costCenter.id },
      { accountId: settings.inventory_account_id, credit: 40, costCenterId: costCenter.id },
    ]);

    const reversalTarget = await post('Reversal source', 'qa_reversal_source', [
      { accountId: settings.general_expenses_account_id, debit: 10 },
      { accountId: settings.cash_account_id, credit: 10 },
    ]);
    const reversal = await reverseJournalEntry(client, companyId, reversalTarget, user.id);
    results.push(`Reversal created: ${reversal.number}`);

    await assertBalancedJournals(client, companyId);
    await assertTrialBalance(client, companyId);
    await assertBalanceSheet(client, companyId, '2026-06-30');
    await assertLedger(client, companyId, settings.accounts_receivable_account_id, 392, 'Accounts receivable');
    await assertLedger(client, companyId, settings.accounts_payable_account_id, 156, 'Accounts payable', 'credit');
    await assertLedger(client, companyId, settings.sales_vat_account_id, 112, 'VAT output/payable', 'credit');
    await assertLedger(client, companyId, settings.purchase_vat_account_id, 56, 'VAT input');
    await assertLedger(client, companyId, settings.inventory_account_id, 880, 'Inventory');
    await assertLedger(client, companyId, settings.employee_payables_account_id, 0, 'Employee payables', 'credit');
    await assertLedger(client, companyId, settings.fixed_assets_account_id, 2400, 'Fixed assets');
    await assertLedger(client, companyId, settings.accumulated_depreciation_account_id, 100, 'Accumulated depreciation', 'credit');

    const closingSourceId = await source('year_end_closing');
    await createJournalEntry(client, {
      companyId,
      entryDate: '2026-12-31',
      memo: 'Year-end closing QA',
      source: { type: 'year_end_closing', id: closingSourceId },
      userId: user.id,
      lines: [
        { accountId: settings.sales_revenue_account_id, debit: 1000 },
        { accountId: settings.sales_returns_account_id, credit: 200 },
        { accountId: settings.cogs_account_id, credit: 480 },
        { accountId: settings.general_expenses_account_id, credit: 50 },
        { accountId: settings.bad_debt_expense_account_id, credit: 30 },
        { accountId: settings.salaries_expense_account_id, credit: 1000 },
        { accountId: settings.depreciation_expense_account_id, credit: 100 },
        { accountId: settings.bank_charges_expense_account_id, credit: 25 },
        { accountId: settings.inventory_loss_expense_account_id, credit: 40 },
        { accountId: settings.retained_earnings_account_id, debit: 925 },
      ],
    });
    results.push('Year-end closing journal: balanced loss transfer');

    await assertBalancedJournals(client, companyId);
    await assertTrialBalance(client, companyId);
    await assertBalanceSheet(client, companyId, '2026-12-31');

    const qaCustomer = await one<{ id: string }>(
      client,
      `INSERT INTO clients (company_id, name) VALUES ($1, 'QA Posting Customer') RETURNING id`,
      [companyId],
    );
    const operationalInvoice = await one<{ id: string }>(
      client,
      `INSERT INTO invoices
       (company_id, number, client_id, issue_date, status, subtotal, vat_amount, discount, total, paid, remaining, created_by)
       VALUES ($1, 'QA-POST-001', $2, '2027-01-15', 'sent', 100, 14, 0, 114, 0, 114, $3)
       RETURNING id`,
      [companyId, qaCustomer.id, user.id],
    );
    await client.query(
      `INSERT INTO invoice_items
       (company_id, invoice_id, description, quantity, unit_price, vat_rate, line_total)
       VALUES ($1, $2, 'QA service posting item', 1, 100, 14, 114)`,
      [companyId, operationalInvoice.id],
    );
    const salesPostingJournalId = await postSalesInvoice(client, companyId, operationalInvoice.id, user.id);
    if (!salesPostingJournalId) fail('Sales invoice posting did not create a journal entry');
    results.push('Operational sales invoice posting: postSalesInvoice');
    await assertBalancedJournals(client, companyId);
    await assertTrialBalance(client, companyId);
    await assertBalanceSheet(client, companyId, '2027-01-15');

    await client.query('ROLLBACK');
    console.log(JSON.stringify({ ok: true, company_id: companyId, journal_entries_tested: results.length, scenarios: results }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
