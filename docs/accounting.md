# OneClick/Hesabat Accounting Setup

## Scope

- OneClick/Hesabat is Egypt-only and EGP-only.
- All monetary amounts are treated as Egyptian Pounds: `EGP` / `ج.م`.
- Existing currency columns are retained for compatibility, but they are not used for multi-currency accounting.
- No FX rates, currency conversion, revaluation, exchange gains/losses, or FX difference accounting are implemented.
- Migration note: existing numeric amounts, including legacy records marked with any non-EGP currency code, are assumed to be EGP display-wise. No amount conversion is performed.
- Financial accounting reports must reconcile to posted journal entries. Operational reports may still use operational documents for workflow views.

## Setup Steps

1. Open **Accounting Settings** and run default initialization.
2. Review the Chart of Accounts and adjust codes/names as needed.
3. Map every required default account:
   - Accounts Receivable
   - Accounts Payable
   - Sales Revenue
   - Sales VAT / VAT Payable
   - Purchase VAT / VAT Input
   - Inventory
   - Cost of Goods Sold
   - Cash
   - Bank
   - Wallet
   - General Expenses
   - Sales Returns
   - Bad Debt Expense
   - Allowance for Doubtful Debts
   - Fixed Assets
   - Accumulated Depreciation
   - Depreciation Expense
   - Salaries Expense
   - Employee Payables
   - Payroll Tax / Social Insurance / Payroll Deductions Payable
   - Bank Charges Expense
   - Interest Income
   - Retained Earnings / Opening Balance Equity
   - Current Year Profit/Loss or Income Summary
   - Inventory Adjustment
4. Create fiscal years and accounting periods.
5. Run Opening Balances only after reviewing the migration summary.

## Posting

- Sales invoices post receivables, revenue, VAT, and COGS when inventory items have cost.
- Sales returns / credit notes post against Accounts Receivable, Sales Returns, VAT Payable, Inventory, and COGS.
- Customer collections post cash/bank/wallet against receivables.
- Payouts post general expenses against cash/bank/wallet.
- Purchase invoices post inventory or expenses, VAT input, and payables.
- Purchase returns reduce Accounts Payable, Inventory, and VAT Input.
- Supplier payments post payables against cash/bank/wallet.
- Stock adjustments post inventory against the inventory adjustment account.
- Bad debt allowance is manual: Dr Bad Debt Expense, Cr Allowance for Doubtful Debts.
- Bad debt write-off is manual: Dr Allowance for Doubtful Debts, Cr Accounts Receivable.
- Payroll posting uses configurable salary components and posts salaries/payroll liabilities through journal entries. Payroll payment clears Employee Payables against Cash/Bank.
- Fixed assets use straight-line depreciation in V1. Depreciation runs post Dr Depreciation Expense, Cr Accumulated Depreciation.
- Bank reconciliation adjustments post simple bank charge or bank interest journals.
- Year-end closing closes revenue and expense account balances to retained earnings or income summary handling.

## Dimensions

- Branches and cost centers are optional accounting dimensions.
- Journal entries can carry a branch; journal entry lines can carry branch and cost center.
- Business transactions pass branch/cost center where the source document supports them.
- Reports can filter by branch and cost center, but there is no inter-branch accounting, allocation engine, or consolidation logic.

## Returns

- Purchase returns decrease inventory and supplier payable, reverse VAT Input, and write stock ledger movement.
- Sales returns / credit notes reduce customer receivables, reverse output VAT/revenue through Sales Returns, and return stock where products are involved.

## Reports

- General Ledger, Account Statement, Trial Balance, Income Statement, Balance Sheet, VAT Report, Customer Ledger, and Supplier Ledger are based on posted journal entries.
- Trial Balance checks total debit equals total credit.
- Balance Sheet checks Assets = Liabilities + Equity.
- Income Statement checks net income equals revenue minus expenses.
- Customer Ledger reconciles customer balances to the Accounts Receivable ledger account.
- Supplier Ledger reconciles supplier balances to the Accounts Payable ledger account.
- VAT Report reconciles VAT Output and VAT Input from their configured ledger accounts.
- Report pages warn when accounting settings are incomplete, draft journals exist in the selected range, or unlocked periods are in scope.

## Bank Reconciliation

- Bank Reconciliation V1 supports manual statement entry, pasted CSV import, manual matching to bank journal lines, unmatching, and completion.
- No bank API integration, OCR, or automatic matching engine is implemented.
- Simple adjustment journals are supported for bank charges and bank interest.

## Payroll

- Payroll V1 is Egypt-focused and EGP-only.
- Salary components are configurable as earnings, deductions, or employer contributions.
- Tax/social insurance rates are not hardcoded. Amounts are entered manually in V1.
- Employee self-service, attendance, advanced HR, and tax filing workflows are out of scope.

## Fixed Assets

- Fixed Assets V1 supports asset categories, fixed asset register, depreciation schedule, and straight-line depreciation runs.
- Creating a fixed asset record does not automatically post the acquisition journal in V1. Post acquisition through a purchase invoice or manual journal if the Fixed Assets ledger account must agree with the asset register.
- Revaluation, impairment, and complex disposal workflows are out of scope.

## Period Locks

Locked periods prevent posting invoices, payments, payouts, purchases, stock movements, and journal entries dated inside the period.

## Reversals

Posted journal entries are not edited. Use **Reverse** to create a linked reversing entry while preserving the original.

## QA Checklist

- Trial Balance debit total equals credit total.
- Sales invoice: Dr Accounts Receivable, Cr Sales Revenue, Cr VAT Payable.
- Collection: Dr Cash/Bank/Wallet, Cr Accounts Receivable.
- Payout: Dr Expense, Cr Cash/Bank/Wallet.
- Purchase invoice: Dr Inventory or Expense, Dr VAT Input, Cr Accounts Payable.
- Purchase return: Dr Accounts Payable, Cr Inventory, Cr VAT Input.
- Credit note: Dr Sales Returns, Dr VAT Payable, Cr Accounts Receivable; inventory return posts Dr Inventory, Cr COGS.
- Supplier payment: Dr Accounts Payable, Cr Cash/Bank/Wallet.
- Inventory sale posts Dr COGS, Cr Inventory.
- Payroll post and payroll payment create balanced journal entries.
- Fixed asset depreciation creates balanced journal entries and blocks duplicate period depreciation.
- Bank reconciliation lines can be matched/unmatched; bank charge/interest adjustments create balanced journal entries.
- VAT report agrees with VAT Input and VAT Output ledger accounts.
- Customer Ledger agrees with Accounts Receivable ledger.
- Supplier Ledger agrees with Accounts Payable ledger.
- Balance Sheet equation balances.
- Locked periods block posting/editing.
- Reversed entries remain linked and do not mutate the original.

## Excluded From This Phase

Multi-currency accounting, FX difference accounting, FX rates, revaluation, bank API integrations, OCR, automatic bank matching, advanced BI, automated IFRS/ECL models, advanced payroll tax filing, employee self-service, HR attendance, asset revaluation, impairment, complex disposal, projects, manufacturing/BOM, budgeting, cash-flow forecasting, mobile app, external accountant portal, external integrations, and advanced approval workflows.
