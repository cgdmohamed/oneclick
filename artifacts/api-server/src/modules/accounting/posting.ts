import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { assertBranch, assertCostCenter, assertProject } from '../../utils/dimensions.js';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

export type JournalLineInput = {
  accountId: string;
  description?: string | null;
  debit?: number;
  credit?: number;
  branchId?: string | null;
  costCenterId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
};

type SourceRef = {
  type: string;
  id: string;
};

const defaultAccounts = [
  ['1100', 'Accounts Receivable', 'asset', 'debit', 'accounts_receivable_account_id'],
  ['1200', 'Inventory', 'asset', 'debit', 'inventory_account_id'],
  ['1150', 'Allowance for Doubtful Debts', 'asset', 'credit', 'doubtful_debts_allowance_account_id'],
  ['1500', 'Fixed Assets', 'asset', 'debit', 'fixed_assets_account_id'],
  ['1590', 'Accumulated Depreciation', 'asset', 'credit', 'accumulated_depreciation_account_id'],
  ['1010', 'Cash', 'asset', 'debit', 'cash_account_id'],
  ['1020', 'Bank', 'asset', 'debit', 'bank_account_id'],
  ['1030', 'Wallet', 'asset', 'debit', 'wallet_account_id'],
  ['2100', 'Accounts Payable', 'liability', 'credit', 'accounts_payable_account_id'],
  ['2200', 'VAT Payable', 'liability', 'credit', 'sales_vat_account_id'],
  ['2300', 'Employee Payables', 'liability', 'credit', 'employee_payables_account_id'],
  ['2310', 'Social Insurance Payable', 'liability', 'credit', 'social_insurance_payable_account_id'],
  ['2320', 'Payroll Tax Payable', 'liability', 'credit', 'payroll_tax_payable_account_id'],
  ['2330', 'Payroll Deductions Payable', 'liability', 'credit', 'payroll_deductions_payable_account_id'],
  ['1300', 'VAT Input', 'asset', 'debit', 'purchase_vat_account_id'],
  ['3100', 'Retained Earnings / Opening Balance Equity', 'equity', 'credit', 'retained_earnings_account_id'],
  ['3200', 'Current Year Profit/Loss', 'equity', 'credit', 'income_summary_account_id'],
  ['4100', 'Sales Revenue', 'revenue', 'credit', 'sales_revenue_account_id'],
  ['4200', 'Sales Returns', 'revenue', 'debit', 'sales_returns_account_id'],
  ['4300', 'Interest Income', 'revenue', 'credit', 'interest_income_account_id'],
  ['5100', 'Cost of Goods Sold', 'expense', 'debit', 'cogs_account_id'],
  ['5200', 'General Expenses', 'expense', 'debit', 'general_expenses_account_id'],
  ['5250', 'Bank Charges Expense', 'expense', 'debit', 'bank_charges_expense_account_id'],
  ['5260', 'Inventory Loss / Damaged Goods Expense', 'expense', 'debit', 'inventory_loss_expense_account_id'],
  ['5400', 'Bad Debt Expense', 'expense', 'debit', 'bad_debt_expense_account_id'],
  ['5500', 'Depreciation Expense', 'expense', 'debit', 'depreciation_expense_account_id'],
  ['5600', 'Gain/Loss on Asset Disposal', 'expense', 'debit', 'asset_disposal_gain_loss_account_id'],
  ['5700', 'Salaries Expense', 'expense', 'debit', 'salaries_expense_account_id'],
  ['5300', 'Inventory Adjustment', 'expense', 'debit', 'inventory_adjustment_account_id'],
] as const;

function asDateOnly(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export async function ensureAccountingSetup(db: Queryable, companyId: string) {
  const ids: Record<string, string> = {};
  for (const [code, name, type, normalBalance, settingColumn] of defaultAccounts) {
    const row = await db.query(
      `INSERT INTO chart_accounts (company_id, code, name, type, normal_balance)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, code)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [companyId, code, name, type, normalBalance],
    );
    ids[settingColumn] = row.rows[0].id;
  }

  await db.query(
    `INSERT INTO accounting_settings (
       company_id, accounts_receivable_account_id, accounts_payable_account_id,
       sales_revenue_account_id, sales_returns_account_id, sales_vat_account_id, purchase_vat_account_id,
       inventory_account_id, cogs_account_id, cash_account_id, bank_account_id,
       wallet_account_id, general_expenses_account_id, retained_earnings_account_id,
       inventory_adjustment_account_id, bad_debt_expense_account_id, doubtful_debts_allowance_account_id,
       income_summary_account_id, fixed_assets_account_id, accumulated_depreciation_account_id,
       depreciation_expense_account_id, asset_disposal_gain_loss_account_id,
       salaries_expense_account_id, employee_payables_account_id, social_insurance_payable_account_id,
       payroll_tax_payable_account_id, payroll_deductions_payable_account_id
       , bank_charges_expense_account_id, interest_income_account_id, inventory_loss_expense_account_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
     ON CONFLICT (company_id) DO UPDATE SET
       accounts_receivable_account_id = COALESCE(accounting_settings.accounts_receivable_account_id, EXCLUDED.accounts_receivable_account_id),
       accounts_payable_account_id = COALESCE(accounting_settings.accounts_payable_account_id, EXCLUDED.accounts_payable_account_id),
       sales_revenue_account_id = COALESCE(accounting_settings.sales_revenue_account_id, EXCLUDED.sales_revenue_account_id),
       sales_returns_account_id = COALESCE(accounting_settings.sales_returns_account_id, EXCLUDED.sales_returns_account_id),
       sales_vat_account_id = COALESCE(accounting_settings.sales_vat_account_id, EXCLUDED.sales_vat_account_id),
       purchase_vat_account_id = COALESCE(accounting_settings.purchase_vat_account_id, EXCLUDED.purchase_vat_account_id),
       inventory_account_id = COALESCE(accounting_settings.inventory_account_id, EXCLUDED.inventory_account_id),
       cogs_account_id = COALESCE(accounting_settings.cogs_account_id, EXCLUDED.cogs_account_id),
       cash_account_id = COALESCE(accounting_settings.cash_account_id, EXCLUDED.cash_account_id),
       bank_account_id = COALESCE(accounting_settings.bank_account_id, EXCLUDED.bank_account_id),
       wallet_account_id = COALESCE(accounting_settings.wallet_account_id, EXCLUDED.wallet_account_id),
       general_expenses_account_id = COALESCE(accounting_settings.general_expenses_account_id, EXCLUDED.general_expenses_account_id),
       retained_earnings_account_id = COALESCE(accounting_settings.retained_earnings_account_id, EXCLUDED.retained_earnings_account_id),
       inventory_adjustment_account_id = COALESCE(accounting_settings.inventory_adjustment_account_id, EXCLUDED.inventory_adjustment_account_id),
       bad_debt_expense_account_id = COALESCE(accounting_settings.bad_debt_expense_account_id, EXCLUDED.bad_debt_expense_account_id),
       doubtful_debts_allowance_account_id = COALESCE(accounting_settings.doubtful_debts_allowance_account_id, EXCLUDED.doubtful_debts_allowance_account_id),
       income_summary_account_id = COALESCE(accounting_settings.income_summary_account_id, EXCLUDED.income_summary_account_id),
       fixed_assets_account_id = COALESCE(accounting_settings.fixed_assets_account_id, EXCLUDED.fixed_assets_account_id),
       accumulated_depreciation_account_id = COALESCE(accounting_settings.accumulated_depreciation_account_id, EXCLUDED.accumulated_depreciation_account_id),
       depreciation_expense_account_id = COALESCE(accounting_settings.depreciation_expense_account_id, EXCLUDED.depreciation_expense_account_id),
       asset_disposal_gain_loss_account_id = COALESCE(accounting_settings.asset_disposal_gain_loss_account_id, EXCLUDED.asset_disposal_gain_loss_account_id),
       salaries_expense_account_id = COALESCE(accounting_settings.salaries_expense_account_id, EXCLUDED.salaries_expense_account_id),
       employee_payables_account_id = COALESCE(accounting_settings.employee_payables_account_id, EXCLUDED.employee_payables_account_id),
       social_insurance_payable_account_id = COALESCE(accounting_settings.social_insurance_payable_account_id, EXCLUDED.social_insurance_payable_account_id),
       payroll_tax_payable_account_id = COALESCE(accounting_settings.payroll_tax_payable_account_id, EXCLUDED.payroll_tax_payable_account_id),
       payroll_deductions_payable_account_id = COALESCE(accounting_settings.payroll_deductions_payable_account_id, EXCLUDED.payroll_deductions_payable_account_id),
       bank_charges_expense_account_id = COALESCE(accounting_settings.bank_charges_expense_account_id, EXCLUDED.bank_charges_expense_account_id),
       interest_income_account_id = COALESCE(accounting_settings.interest_income_account_id, EXCLUDED.interest_income_account_id),
       inventory_loss_expense_account_id = COALESCE(accounting_settings.inventory_loss_expense_account_id, EXCLUDED.inventory_loss_expense_account_id),
       updated_at = NOW()`,
    [
      companyId,
      ids.accounts_receivable_account_id,
      ids.accounts_payable_account_id,
      ids.sales_revenue_account_id,
      ids.sales_returns_account_id,
      ids.sales_vat_account_id,
      ids.purchase_vat_account_id,
      ids.inventory_account_id,
      ids.cogs_account_id,
      ids.cash_account_id,
      ids.bank_account_id,
      ids.wallet_account_id,
      ids.general_expenses_account_id,
      ids.retained_earnings_account_id,
      ids.inventory_adjustment_account_id,
      ids.bad_debt_expense_account_id,
      ids.doubtful_debts_allowance_account_id,
      ids.income_summary_account_id,
      ids.fixed_assets_account_id,
      ids.accumulated_depreciation_account_id,
      ids.depreciation_expense_account_id,
      ids.asset_disposal_gain_loss_account_id,
      ids.salaries_expense_account_id,
      ids.employee_payables_account_id,
      ids.social_insurance_payable_account_id,
      ids.payroll_tax_payable_account_id,
      ids.payroll_deductions_payable_account_id,
      ids.bank_charges_expense_account_id,
      ids.interest_income_account_id,
      ids.inventory_loss_expense_account_id,
    ],
  );
}

export async function ensureFiscalYear(db: Queryable, companyId: string, entryDate: string | Date) {
  const date = asDateOnly(entryDate);
  const existing = await db.query(
    `SELECT id FROM fiscal_years
     WHERE company_id = $1 AND starts_on <= $2::date AND ends_on >= $2::date
     LIMIT 1`,
    [companyId, date],
  );
  if (existing.rowCount) return existing.rows[0].id as string;

  const year = new Date(date).getUTCFullYear();
  const created = await db.query(
    `INSERT INTO fiscal_years (company_id, name, starts_on, ends_on)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (company_id, starts_on, ends_on) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [companyId, String(year), `${year}-01-01`, `${year}-12-31`],
  );
  return created.rows[0].id as string;
}

export async function assertPeriodOpen(db: Queryable, companyId: string, entryDate: string | Date) {
  const date = asDateOnly(entryDate);
  const period = await db.query(
    `SELECT id, is_locked FROM accounting_periods
     WHERE company_id = $1 AND starts_on <= $2::date AND ends_on >= $2::date
     ORDER BY starts_on DESC LIMIT 1`,
    [companyId, date],
  );
  if (period.rowCount && period.rows[0].is_locked) {
    throw conflict('Accounting period is locked');
  }
  return period.rows[0]?.id as string | undefined;
}

async function nextJournalNumber(db: Queryable, companyId: string, fiscalYearId: string) {
  const year = await db.query(`SELECT name FROM fiscal_years WHERE id = $1 AND company_id = $2`, [fiscalYearId, companyId]);
  const seq = await db.query(
    `INSERT INTO journal_entry_sequences (company_id, fiscal_year_id, sequence)
     VALUES ($1,$2,1)
     ON CONFLICT (company_id, fiscal_year_id)
     DO UPDATE SET sequence = journal_entry_sequences.sequence + 1
     RETURNING sequence`,
    [companyId, fiscalYearId],
  );
  return `JE-${year.rows[0]?.name ?? new Date().getUTCFullYear()}-${String(seq.rows[0].sequence).padStart(5, '0')}`;
}

export async function createJournalEntry(db: Queryable, args: {
  companyId: string;
  entryDate: string | Date;
  memo?: string | null;
  source?: SourceRef;
  lines: JournalLineInput[];
  status?: 'draft' | 'posted';
  userId?: string | null;
  branchId?: string | null;
  allowLockedPeriod?: boolean;
}) {
  await ensureAccountingSetup(db, args.companyId);
  await assertBranch(db, args.companyId, args.branchId);
  for (const line of args.lines) {
    await assertBranch(db, args.companyId, line.branchId);
    await assertCostCenter(db, args.companyId, line.costCenterId);
    await assertProject(db, args.companyId, line.projectId);
  }
  const fiscalYearId = await ensureFiscalYear(db, args.companyId, args.entryDate);
  const periodId = args.allowLockedPeriod
    ? (await db.query(
        `SELECT id FROM accounting_periods
         WHERE company_id = $1 AND starts_on <= $2::date AND ends_on >= $2::date
         ORDER BY starts_on DESC LIMIT 1`,
        [args.companyId, asDateOnly(args.entryDate)],
      )).rows[0]?.id as string | undefined
    : await assertPeriodOpen(db, args.companyId, args.entryDate);

  const totalDebit = round2(args.lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
  const totalCredit = round2(args.lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));
  if (!args.lines.length || Math.abs(totalDebit - totalCredit) > 0.005) {
    throw badRequest('Journal entry debits must equal credits');
  }
  const accountIds = [...new Set(args.lines.map((line) => line.accountId))];
  const accounts = await db.query(
    `SELECT id, is_active FROM chart_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])`,
    [args.companyId, accountIds],
  );
  if (accounts.rows.length !== accountIds.length) throw badRequest('Journal line account does not belong to company');
  const inactive = accounts.rows.find((row) => !row.is_active);
  if (inactive && args.source?.type !== 'journal_reversal') throw badRequest('Inactive chart accounts cannot be used for posting');

  const number = await nextJournalNumber(db, args.companyId, fiscalYearId);
  const je = await db.query(
    `INSERT INTO journal_entries (
       company_id, fiscal_year_id, period_id, number, entry_date, status,
       source_type, source_id, memo, branch_id, posted_at, posted_by, created_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      args.companyId,
      fiscalYearId,
      periodId ?? null,
      number,
      asDateOnly(args.entryDate),
      args.status ?? 'posted',
      args.source?.type ?? null,
      args.source?.id ?? null,
      args.memo ?? null,
      args.branchId ?? null,
      (args.status ?? 'posted') === 'posted' ? new Date() : null,
      (args.status ?? 'posted') === 'posted' ? args.userId ?? null : null,
      args.userId ?? null,
    ],
  );

  let lineNo = 1;
  for (const line of args.lines) {
    await db.query(
      `INSERT INTO journal_entry_lines
       (company_id, journal_entry_id, account_id, description, debit, credit, line_no, branch_id, cost_center_id, client_id, project_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        args.companyId,
        je.rows[0].id,
        line.accountId,
        line.description ?? null,
        round2(Number(line.debit ?? 0)),
        round2(Number(line.credit ?? 0)),
        lineNo++,
        line.branchId ?? args.branchId ?? null,
        line.costCenterId ?? null,
        line.clientId ?? null,
        line.projectId ?? null,
      ],
    );
  }

  return je.rows[0];
}

export async function postDraftJournalEntry(db: Queryable, companyId: string, journalEntryId: string, userId?: string | null) {
  const je = await db.query(
    `SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2 FOR UPDATE`,
    [journalEntryId, companyId],
  );
  if (!je.rowCount) throw notFound('Journal entry not found');
  if (je.rows[0].status !== 'draft') throw conflict('Only draft journal entries can be posted');
  await assertPeriodOpen(db, companyId, je.rows[0].entry_date);

  const totals = await db.query(
    `SELECT COALESCE(SUM(debit),0)::numeric AS debit, COALESCE(SUM(credit),0)::numeric AS credit
     FROM journal_entry_lines WHERE journal_entry_id = $1 AND company_id = $2`,
    [journalEntryId, companyId],
  );
  if (Math.abs(Number(totals.rows[0].debit) - Number(totals.rows[0].credit)) > 0.005) {
    throw badRequest('Journal entry debits must equal credits');
  }

  const updated = await db.query(
    `UPDATE journal_entries
     SET status = 'posted', posted_at = NOW(), posted_by = $3, updated_at = NOW()
     WHERE id = $1 AND company_id = $2 RETURNING *`,
    [journalEntryId, companyId, userId ?? null],
  );
  return updated.rows[0];
}

export async function reverseJournalEntry(db: Queryable, companyId: string, journalEntryId: string, userId?: string | null) {
  const original = await db.query(
    `SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2 FOR UPDATE`,
    [journalEntryId, companyId],
  );
  if (!original.rowCount) throw notFound('Journal entry not found');
  if (original.rows[0].status !== 'posted') throw conflict('Only posted journal entries can be reversed');

  const lines = await db.query(
    `SELECT account_id, description, debit, credit, branch_id, cost_center_id
     FROM journal_entry_lines WHERE journal_entry_id = $1 AND company_id = $2 ORDER BY line_no`,
    [journalEntryId, companyId],
  );
  const reversal = await createJournalEntry(db, {
    companyId,
    entryDate: new Date(),
    memo: `Reverse ${original.rows[0].number}`,
    source: { type: 'journal_reversal', id: journalEntryId },
    userId,
    branchId: original.rows[0].branch_id ?? null,
    lines: lines.rows.map((line) => ({
      accountId: line.account_id,
      description: line.description,
      debit: Number(line.credit),
      credit: Number(line.debit),
      branchId: line.branch_id ?? null,
      costCenterId: line.cost_center_id ?? null,
    })),
  });
  await db.query(
    `UPDATE journal_entries SET status = 'reversed', reversed_entry_id = $3, updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [journalEntryId, companyId, reversal.id],
  );
  return reversal;
}

export async function getSettings(db: Queryable, companyId: string) {
  await ensureAccountingSetup(db, companyId);
  const settings = await db.query(`SELECT * FROM accounting_settings WHERE company_id = $1`, [companyId]);
  return settings.rows[0];
}

function requireAccount(accountId: string | null | undefined, label: string) {
  if (!accountId) throw badRequest(`Missing accounting account for ${label}`);
  return accountId;
}

async function moneyAccountChartAccount(db: Queryable, companyId: string, accountId: string) {
  const account = await db.query(
    `SELECT a.type, a.chart_account_id, s.cash_account_id, s.bank_account_id, s.wallet_account_id
     FROM accounts a CROSS JOIN accounting_settings s
     WHERE a.id = $1 AND a.company_id = $2 AND a.is_active = TRUE AND s.company_id = $2`,
    [accountId, companyId],
  );
  if (!account.rowCount) throw notFound('Active account not found');
  return account.rows[0].chart_account_id
    ?? (account.rows[0].type === 'bank'
      ? account.rows[0].bank_account_id
      : account.rows[0].type === 'wallet'
        ? account.rows[0].wallet_account_id
        : account.rows[0].cash_account_id);
}

export async function postSalesInvoice(db: Queryable, companyId: string, invoiceId: string, userId?: string | null) {
  const invoice = await db.query(`SELECT * FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, companyId]);
  if (!invoice.rowCount || invoice.rows[0].journal_entry_id) return invoice.rows[0]?.journal_entry_id;
  const s = await getSettings(db, companyId);
  const inv = invoice.rows[0];
  const revenue = round2(Number(inv.subtotal) - Number(inv.discount ?? 0));
  // VAT-01 safeguard: never post a journal entry for an invoice whose
  // stored total doesn't reconcile with subtotal - discount + vat. This is
  // the last gate before the figures reach the general ledger.
  const expectedTotal = round2(Number(inv.subtotal) - Number(inv.discount ?? 0) + Number(inv.vat_amount ?? 0));
  if (Math.abs(expectedTotal - Number(inv.total)) > 0.01) {
    throw badRequest(`Invoice ${inv.number} total does not reconcile with subtotal, discount and VAT — refusing to post`);
  }
  const lines: JournalLineInput[] = [
    { accountId: s.accounts_receivable_account_id, debit: Number(inv.total), description: `Invoice ${inv.number}`, branchId: inv.branch_id, clientId: inv.client_id, costCenterId: inv.cost_center_id ?? null, projectId: inv.project_id ?? null },
  ];
  const revenueGroups = await db.query(
    `SELECT
       ii.cost_center_id,
       ii.project_id,
       COALESCE(p.sales_account_id, pc.sales_account_id, parent_pc.sales_account_id, $3::uuid) AS account_id,
       COALESCE(SUM(ii.quantity * ii.unit_price),0) AS amount
     FROM invoice_items ii
     LEFT JOIN products p ON p.id = ii.product_id AND p.company_id = ii.company_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
     WHERE ii.invoice_id = $1 AND ii.company_id = $2
     GROUP BY 1, 2, 3`,
    [invoiceId, companyId, s.sales_revenue_account_id],
  );
  const subtotal = Number(inv.subtotal) || 0;
  const revenueRows = revenueGroups.rows.map((row) => {
    const gross = Number(row.amount);
    const discountShare = subtotal > 0 ? round2(Number(inv.discount ?? 0) * (gross / subtotal)) : 0;
    return { costCenterId: row.cost_center_id ?? null, projectId: row.project_id ?? null, accountId: row.account_id as string | null, amount: round2(gross - discountShare) };
  });
  const allocatedRevenue = round2(revenueRows.reduce((sum, row) => sum + row.amount, 0));
  if (revenueRows.length > 0) {
    revenueRows[revenueRows.length - 1].amount = round2(revenueRows[revenueRows.length - 1].amount + (revenue - allocatedRevenue));
  }
  for (const row of revenueRows) {
    if (row.amount > 0) {
      lines.push({ accountId: s.sales_revenue_account_id, credit: row.amount, description: `Invoice ${inv.number}`, branchId: inv.branch_id, costCenterId: row.costCenterId, projectId: row.projectId });
      lines[lines.length - 1].accountId = requireAccount(row.accountId ?? s.sales_revenue_account_id, 'sales revenue');
    }
  }
  if (revenueGroups.rows.length === 0 && revenue > 0) {
    lines.push({ accountId: s.sales_revenue_account_id, credit: revenue, description: `Invoice ${inv.number}`, branchId: inv.branch_id, costCenterId: inv.cost_center_id ?? null, projectId: inv.project_id ?? null });
  }
  if (Number(inv.vat_amount) > 0) lines.push({ accountId: s.sales_vat_account_id, credit: Number(inv.vat_amount), description: `Invoice ${inv.number}`, branchId: inv.branch_id, costCenterId: inv.cost_center_id ?? null, projectId: inv.project_id ?? null });

  const cogs = await db.query(
    `SELECT
       ii.cost_center_id,
       ii.project_id,
       COALESCE(p.cogs_account_id, pc.cogs_account_id, parent_pc.cogs_account_id, $3::uuid) AS cogs_account_id,
       COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id, $4::uuid) AS inventory_account_id,
       COALESCE(SUM(ii.quantity * COALESCE(NULLIF(p.average_cost, 0), p.cost, 0)),0) AS amount
     FROM invoice_items ii JOIN products p ON p.id = ii.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
     WHERE ii.invoice_id = $1 AND ii.company_id = $2
       AND p.product_type = 'stock'
     GROUP BY 1, 2, 3, 4`,
    [invoiceId, companyId, s.cogs_account_id, s.inventory_account_id],
  );
  for (const row of cogs.rows) {
    const cogsAmount = round2(Number(row.amount ?? 0));
    if (cogsAmount > 0) {
      lines.push({ accountId: requireAccount(row.cogs_account_id ?? s.cogs_account_id, 'cost of goods sold'), debit: cogsAmount, description: `COGS ${inv.number}`, branchId: inv.branch_id, costCenterId: row.cost_center_id ?? null, projectId: row.project_id ?? null });
      lines.push({ accountId: requireAccount(row.inventory_account_id ?? s.inventory_account_id, 'inventory'), credit: cogsAmount, description: `COGS ${inv.number}`, branchId: inv.branch_id, costCenterId: row.cost_center_id ?? null, projectId: row.project_id ?? null });
    }
  }

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: inv.issue_date,
    memo: `Sales invoice ${inv.number}`,
    source: { type: 'invoice', id: invoiceId },
    userId,
    branchId: inv.branch_id ?? null,
    lines,
  });
  await db.query(`UPDATE invoices SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, invoiceId, companyId]);
  return je.id;
}

// Recomputes an invoice's paid/remaining/status from every source that affects
// it (payments, posted credit notes, posted debit notes) instead of each
// caller mutating `remaining` independently from only its own delta — that
// pattern let a payment recompute silently overwrite a credit note's effect
// (and vice versa) since each only knew about its own side of the balance.
export async function recomputeInvoiceBalance(db: Queryable, companyId: string, invoiceId: string) {
  const inv = await db.query(`SELECT total FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [invoiceId, companyId]);
  if (!inv.rowCount) return;
  const total = Number(inv.rows[0].total);
  const paidRs = await db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoice_id = $1 AND company_id = $2`, [invoiceId, companyId]);
  const creditRs = await db.query(`SELECT COALESCE(SUM(total),0) AS s FROM credit_notes WHERE original_invoice_id = $1 AND company_id = $2 AND status = 'posted'`, [invoiceId, companyId]);
  const debitRs = await db.query(`SELECT COALESCE(SUM(total),0) AS s FROM debit_notes WHERE original_invoice_id = $1 AND company_id = $2 AND status = 'posted'`, [invoiceId, companyId]);
  // Bad-debt write-offs also reduce what's left owed on an invoice (see
  // modules/bad-debts/routes.ts) — without this, recomputing the balance
  // after any later payment/credit-note/debit-note event on the same
  // invoice would silently undo the write-off's effect on remaining/status.
  const writeOffRs = await db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM bad_debt_write_offs WHERE invoice_id = $1 AND company_id = $2 AND status != 'cancelled'`, [invoiceId, companyId]);
  const paid = round2(Number(paidRs.rows[0].s));
  const creditTotal = round2(Number(creditRs.rows[0].s));
  const debitTotal = round2(Number(debitRs.rows[0].s));
  const writeOffTotal = round2(Number(writeOffRs.rows[0].s));
  // Not floored at 0: a negative remaining means the company owes the
  // customer a refund/credit (e.g. a credit note posted after the invoice
  // was already fully paid) — that must stay visible, not vanish.
  const remaining = round2(total - paid - creditTotal + debitTotal - writeOffTotal);
  const status = remaining <= 0.005 ? 'paid' : paid > 0 ? 'partial' : 'sent';
  await db.query(`UPDATE invoices SET paid = $1, remaining = $2, status = $3 WHERE id = $4 AND company_id = $5`, [paid, remaining, status, invoiceId, companyId]);
}

export async function postCustomerPayment(db: Queryable, companyId: string, paymentId: string, userId?: string | null) {
  const payment = await db.query(
    `SELECT p.*, i.number AS invoice_number FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE p.id = $1 AND p.company_id = $2`,
    [paymentId, companyId],
  );
  if (!payment.rowCount || payment.rows[0].journal_entry_id) return payment.rows[0]?.journal_entry_id;
  const s = await getSettings(db, companyId);
  const pay = payment.rows[0];
  const cashAccountId = await moneyAccountChartAccount(db, companyId, payment.rows[0].account_id);
  const creditAccountId = pay.collection_type === 'general_receipt'
    ? requireAccount(pay.credit_account_id, 'general receipt credit')
    : requireAccount(s.accounts_receivable_account_id, 'accounts receivable');
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: pay.paid_at,
    memo: pay.collection_type === 'general_receipt' ? `General receipt ${pay.reference ?? paymentId}` : `Collection for invoice ${pay.invoice_number}`,
    source: { type: 'payment', id: paymentId },
    userId,
    branchId: pay.branch_id ?? null,
    lines: [
      { accountId: cashAccountId, debit: Number(pay.amount), description: pay.reference ?? pay.notes, branchId: pay.branch_id },
      { accountId: creditAccountId, credit: Number(pay.amount), description: pay.reference ?? pay.notes, branchId: pay.branch_id, clientId: pay.collection_type === 'general_receipt' ? null : pay.client_id },
    ],
  });
  await db.query(`UPDATE payments SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, paymentId, companyId]);
  return je.id;
}

export async function postPayout(db: Queryable, companyId: string, payoutId: string, userId?: string | null) {
  const payout = await db.query(`SELECT * FROM payouts WHERE id = $1 AND company_id = $2`, [payoutId, companyId]);
  if (!payout.rowCount || payout.rows[0].journal_entry_id) return payout.rows[0]?.journal_entry_id;
  const s = await getSettings(db, companyId);
  const debitAccountId = payout.rows[0].debit_account_id ?? s.general_expenses_account_id;
  const cashAccountId = await moneyAccountChartAccount(db, companyId, payout.rows[0].account_id);
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: payout.rows[0].paid_at,
    memo: `Expense payout ${payout.rows[0].reference ?? payoutId}`,
    source: { type: 'payout', id: payoutId },
    userId,
    branchId: payout.rows[0].branch_id ?? null,
    lines: [
      { accountId: requireAccount(debitAccountId, 'payout debit account'), debit: Number(payout.rows[0].amount), description: payout.rows[0].notes, branchId: payout.rows[0].branch_id, costCenterId: payout.rows[0].cost_center_id },
      { accountId: cashAccountId, credit: Number(payout.rows[0].amount), description: payout.rows[0].notes, branchId: payout.rows[0].branch_id },
    ],
  });
  await db.query(`UPDATE payouts SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, payoutId, companyId]);
  return je.id;
}

export async function postSupplierPayment(db: Queryable, companyId: string, supplierPaymentId: string, userId?: string | null) {
  const payment = await db.query(`SELECT * FROM supplier_payments WHERE id = $1 AND company_id = $2`, [supplierPaymentId, companyId]);
  if (!payment.rowCount || payment.rows[0].journal_entry_id) return payment.rows[0]?.journal_entry_id;
  const s = await getSettings(db, companyId);
  const cashAccountId = await moneyAccountChartAccount(db, companyId, payment.rows[0].account_id);
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: payment.rows[0].paid_at,
    memo: `Supplier payment ${payment.rows[0].reference ?? supplierPaymentId}`,
    source: { type: 'supplier_payment', id: supplierPaymentId },
    userId,
    branchId: payment.rows[0].branch_id ?? null,
    lines: [
      { accountId: s.accounts_payable_account_id, debit: Number(payment.rows[0].amount), description: payment.rows[0].notes, branchId: payment.rows[0].branch_id },
      { accountId: cashAccountId, credit: Number(payment.rows[0].amount), description: payment.rows[0].notes, branchId: payment.rows[0].branch_id },
    ],
  });
  await db.query(`UPDATE supplier_payments SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, supplierPaymentId, companyId]);
  return je.id;
}
