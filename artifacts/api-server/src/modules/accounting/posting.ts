import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

export type JournalLineInput = {
  accountId: string;
  description?: string | null;
  debit?: number;
  credit?: number;
};

type SourceRef = {
  type: string;
  id: string;
};

const defaultAccounts = [
  ['1100', 'Accounts Receivable', 'asset', 'debit', 'accounts_receivable_account_id'],
  ['1200', 'Inventory', 'asset', 'debit', 'inventory_account_id'],
  ['1010', 'Cash', 'asset', 'debit', 'cash_account_id'],
  ['1020', 'Bank', 'asset', 'debit', 'bank_account_id'],
  ['1030', 'Wallet', 'asset', 'debit', 'wallet_account_id'],
  ['2100', 'Accounts Payable', 'liability', 'credit', 'accounts_payable_account_id'],
  ['2200', 'VAT Payable', 'liability', 'credit', 'sales_vat_account_id'],
  ['1300', 'VAT Input', 'asset', 'debit', 'purchase_vat_account_id'],
  ['3100', 'Retained Earnings / Opening Balance Equity', 'equity', 'credit', 'retained_earnings_account_id'],
  ['4100', 'Sales Revenue', 'revenue', 'credit', 'sales_revenue_account_id'],
  ['5100', 'Cost of Goods Sold', 'expense', 'debit', 'cogs_account_id'],
  ['5200', 'General Expenses', 'expense', 'debit', 'general_expenses_account_id'],
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
       sales_revenue_account_id, sales_vat_account_id, purchase_vat_account_id,
       inventory_account_id, cogs_account_id, cash_account_id, bank_account_id,
       wallet_account_id, general_expenses_account_id, retained_earnings_account_id,
       inventory_adjustment_account_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (company_id) DO UPDATE SET
       accounts_receivable_account_id = COALESCE(accounting_settings.accounts_receivable_account_id, EXCLUDED.accounts_receivable_account_id),
       accounts_payable_account_id = COALESCE(accounting_settings.accounts_payable_account_id, EXCLUDED.accounts_payable_account_id),
       sales_revenue_account_id = COALESCE(accounting_settings.sales_revenue_account_id, EXCLUDED.sales_revenue_account_id),
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
       updated_at = NOW()`,
    [
      companyId,
      ids.accounts_receivable_account_id,
      ids.accounts_payable_account_id,
      ids.sales_revenue_account_id,
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
}) {
  await ensureAccountingSetup(db, args.companyId);
  const fiscalYearId = await ensureFiscalYear(db, args.companyId, args.entryDate);
  const periodId = await assertPeriodOpen(db, args.companyId, args.entryDate);

  const totalDebit = round2(args.lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
  const totalCredit = round2(args.lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));
  if (!args.lines.length || Math.abs(totalDebit - totalCredit) > 0.005) {
    throw badRequest('Journal entry debits must equal credits');
  }

  const number = await nextJournalNumber(db, args.companyId, fiscalYearId);
  const je = await db.query(
    `INSERT INTO journal_entries (
       company_id, fiscal_year_id, period_id, number, entry_date, status,
       source_type, source_id, memo, posted_at, posted_by, created_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      (args.status ?? 'posted') === 'posted' ? new Date() : null,
      (args.status ?? 'posted') === 'posted' ? args.userId ?? null : null,
      args.userId ?? null,
    ],
  );

  let lineNo = 1;
  for (const line of args.lines) {
    await db.query(
      `INSERT INTO journal_entry_lines
       (company_id, journal_entry_id, account_id, description, debit, credit, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        args.companyId,
        je.rows[0].id,
        line.accountId,
        line.description ?? null,
        round2(Number(line.debit ?? 0)),
        round2(Number(line.credit ?? 0)),
        lineNo++,
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
    `SELECT account_id, description, debit, credit
     FROM journal_entry_lines WHERE journal_entry_id = $1 AND company_id = $2 ORDER BY line_no`,
    [journalEntryId, companyId],
  );
  const reversal = await createJournalEntry(db, {
    companyId,
    entryDate: new Date(),
    memo: `Reverse ${original.rows[0].number}`,
    source: { type: 'journal_reversal', id: journalEntryId },
    userId,
    lines: lines.rows.map((line) => ({
      accountId: line.account_id,
      description: line.description,
      debit: Number(line.credit),
      credit: Number(line.debit),
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

async function moneyAccountChartAccount(db: Queryable, companyId: string, accountId: string) {
  const account = await db.query(
    `SELECT a.type, a.chart_account_id, s.cash_account_id, s.bank_account_id, s.wallet_account_id
     FROM accounts a CROSS JOIN accounting_settings s
     WHERE a.id = $1 AND a.company_id = $2 AND s.company_id = $2`,
    [accountId, companyId],
  );
  if (!account.rowCount) throw notFound('Account not found');
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
  const lines: JournalLineInput[] = [
    { accountId: s.accounts_receivable_account_id, debit: Number(inv.total), description: `Invoice ${inv.number}` },
    { accountId: s.sales_revenue_account_id, credit: revenue, description: `Invoice ${inv.number}` },
  ];
  if (Number(inv.vat_amount) > 0) lines.push({ accountId: s.sales_vat_account_id, credit: Number(inv.vat_amount), description: `Invoice ${inv.number}` });

  const cogs = await db.query(
    `SELECT COALESCE(SUM(ii.quantity * COALESCE(NULLIF(p.average_cost, 0), p.cost, 0)),0) AS amount
     FROM invoice_items ii JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = $1 AND ii.company_id = $2`,
    [invoiceId, companyId],
  );
  const cogsAmount = round2(Number(cogs.rows[0].amount ?? 0));
  if (cogsAmount > 0) {
    lines.push({ accountId: s.cogs_account_id, debit: cogsAmount, description: `COGS ${inv.number}` });
    lines.push({ accountId: s.inventory_account_id, credit: cogsAmount, description: `COGS ${inv.number}` });
  }

  const je = await createJournalEntry(db, {
    companyId,
    entryDate: inv.issue_date,
    memo: `Sales invoice ${inv.number}`,
    source: { type: 'invoice', id: invoiceId },
    userId,
    lines,
  });
  await db.query(`UPDATE invoices SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, invoiceId, companyId]);
  return je.id;
}

export async function postCustomerPayment(db: Queryable, companyId: string, paymentId: string, userId?: string | null) {
  const payment = await db.query(
    `SELECT p.*, i.number AS invoice_number FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE p.id = $1 AND p.company_id = $2`,
    [paymentId, companyId],
  );
  if (!payment.rowCount || payment.rows[0].journal_entry_id) return payment.rows[0]?.journal_entry_id;
  const s = await getSettings(db, companyId);
  const cashAccountId = await moneyAccountChartAccount(db, companyId, payment.rows[0].account_id);
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: payment.rows[0].paid_at,
    memo: `Collection for invoice ${payment.rows[0].invoice_number}`,
    source: { type: 'payment', id: paymentId },
    userId,
    lines: [
      { accountId: cashAccountId, debit: Number(payment.rows[0].amount), description: payment.rows[0].reference },
      { accountId: s.accounts_receivable_account_id, credit: Number(payment.rows[0].amount), description: payment.rows[0].reference },
    ],
  });
  await db.query(`UPDATE payments SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, paymentId, companyId]);
  return je.id;
}

export async function postPayout(db: Queryable, companyId: string, payoutId: string, userId?: string | null) {
  const payout = await db.query(`SELECT * FROM payouts WHERE id = $1 AND company_id = $2`, [payoutId, companyId]);
  if (!payout.rowCount || payout.rows[0].journal_entry_id) return payout.rows[0]?.journal_entry_id;
  const s = await getSettings(db, companyId);
  const cashAccountId = await moneyAccountChartAccount(db, companyId, payout.rows[0].account_id);
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: payout.rows[0].paid_at,
    memo: `Expense payout ${payout.rows[0].reference ?? payoutId}`,
    source: { type: 'payout', id: payoutId },
    userId,
    lines: [
      { accountId: s.general_expenses_account_id, debit: Number(payout.rows[0].amount), description: payout.rows[0].notes },
      { accountId: cashAccountId, credit: Number(payout.rows[0].amount), description: payout.rows[0].notes },
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
    lines: [
      { accountId: s.accounts_payable_account_id, debit: Number(payment.rows[0].amount), description: payment.rows[0].notes },
      { accountId: cashAccountId, credit: Number(payment.rows[0].amount), description: payment.rows[0].notes },
    ],
  });
  await db.query(`UPDATE supplier_payments SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, supplierPaymentId, companyId]);
  return je.id;
}
