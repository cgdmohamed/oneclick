# OneClick/Hesabat Full Accounting V1 QA Results

Date: 2026-07-18
Scope: Egypt-only, EGP-only accounting V1.

## QA Method

This pass reviewed the implemented backend posting routes, journal engine, report queries, UI report pages, and documentation. Typecheck and API build were executed locally.

A live database accounting scenario run was not available in this session, so the journal "Actual" entries below are verified from implemented posting code paths rather than from persisted production data. Items marked "Requires live DB run" should be executed against a seeded company before production sign-off.

## Test Dataset

Use one company with:

- Currency: EGP / ج.م
- Branch: Cairo
- Cost center: Operations
- Customer: QA Customer
- Supplier: QA Supplier
- Product: QA Stock Item, opening quantity 10, average cost 100.00 EGP
- Bank account: QA Bank
- Cash account: QA Cash
- Employee: QA Employee, basic salary 10,000.00 EGP
- Fixed asset: QA Laptop, cost 24,000.00 EGP, salvage 0.00, useful life 24 months
- VAT rate: 14% for QA scenario, or the company configured VAT rate if different

## Scenario Results

| Scenario | Expected journal entry | Actual implementation | Status |
|---|---|---|---|
| Sales invoice with VAT | Dr Accounts Receivable; Cr Sales Revenue; Cr VAT Payable; plus Dr COGS / Cr Inventory for stock items | `postSalesInvoice` posts AR, revenue, VAT, COGS, and inventory using accounting settings; source linked as `invoice` | Pass by code review |
| Customer collection | Dr Cash/Bank/Wallet; Cr Accounts Receivable | `postCustomerPayment` posts selected money account chart account against AR; source linked as `payment` | Pass after QA fix |
| Sales return / credit note | Dr Sales Returns; Dr VAT Payable; Cr Accounts Receivable; Dr Inventory / Cr COGS for stock products | Credit note posting uses configured Sales Returns, VAT Payable, AR, Inventory, and COGS; source linked as `credit_note` | Pass by code review |
| Purchase invoice with VAT | Dr Inventory or Expense; Dr VAT Input; Cr Accounts Payable | Purchase invoice posting uses Inventory or expense account, VAT Input, and AP; source linked as `purchase_invoice` | Pass by code review |
| Supplier payment | Dr Accounts Payable; Cr Cash/Bank/Wallet | `postSupplierPayment` posts AP against selected money account chart account; source linked as `supplier_payment` | Pass after QA fix |
| Purchase return | Dr Accounts Payable; Cr Inventory; Cr VAT Input | Purchase return posting reduces stock, posts AP/Inventory/VAT Input; source linked as `purchase_return` | Pass by code review |
| Inventory sale with COGS | Dr COGS; Cr Inventory | Sales invoice stock items calculate COGS from product cost/average cost and post COGS lines | Pass by code review |
| Payout / expense | Dr General Expenses; Cr Cash/Bank/Wallet | `postPayout` posts General Expenses and selected money account; source linked as `payout` | Pass after QA fix |
| Bad debt allowance | Dr Bad Debt Expense; Cr Allowance for Doubtful Debts | Bad debt allowance route posts configured accounts; source linked as `doubtful_debt_allowance` | Pass by code review |
| Bad debt write-off | Dr Allowance for Doubtful Debts; Cr Accounts Receivable | Write-off route posts allowance against AR; source linked as `bad_debt_write_off` | Pass by code review |
| Payroll run | Dr Salaries/component expense; Cr Employee Payables and payroll payable component accounts | Payroll run posts basic salary, earnings, deductions, employer contributions, and employee payable; source linked as `payroll_run` | Pass by code review |
| Payroll payment | Dr Employee Payables; Cr Bank/Cash | Payroll payment posts employee payable against selected active money account; source linked as `payroll_payment` | Pass after QA fix |
| Fixed asset creation | Asset register record created | Current V1 creates fixed asset register records but does not post acquisition journal automatically | Known limitation |
| Depreciation run | Dr Depreciation Expense; Cr Accumulated Depreciation | Depreciation run posts straight-line depreciation by asset/category accounts; source linked as `depreciation_run` | Pass by code review |
| Bank reconciliation with bank charge | Dr Bank Charges Expense; Cr Bank | Bank reconciliation adjustment posts configured bank charge expense and bank account; source linked as `bank_charge` | Pass by code review |
| Year-end closing | Close revenue/expense balances into retained earnings or income summary | Closing preview and creation use posted journal balances and block duplicate closing | Pass by code review |

## Controls Verified

| Control | Result |
|---|---|
| Debit total equals credit total | Enforced by `createJournalEntry` for all generated and manual journals |
| Correct accounts are used from Accounting Settings | Posting services call `getSettings`; QA fixed inactive chart account blocking |
| Branch and cost center carried where applicable | Sales, purchases, payouts, payroll, depreciation, and journal lines carry dimensions where source supports them |
| Journal entry linked to source document | Source type/id is set for invoices, payments, payouts, purchases, returns, credit notes, bad debts, payroll, depreciation, bank adjustments, and closing |
| Locked periods block posting | Posting routes call `assertPeriodOpen`; closing and depreciation also check relevant periods |
| Posted records cannot be edited directly | Posted journals cannot be edited; posted documents generally use cancel/reverse actions |
| Reversal creates linked reversing entry | `reverseJournalEntry` creates reversing journal and marks original as reversed without changing original lines |
| Transactions from another company cannot be linked | QA fixed customer payment invoice/account validation; supplier/payment/payout paths validate company ownership |
| Inactive account cannot be used for new posting | QA fixed chart account validation and active operational money-account validation |
| Negative stock prevented | Sales invoice and purchase return paths block negative stock |
| Duplicate depreciation blocked | Depreciation preview excludes assets already depreciated for non-cancelled run in the same period |
| Duplicate year-end closing blocked | Closing checks fiscal-year closing state/source before creating closing entry |
| Bank reconciliation difference control | Completion blocks non-zero difference unless `allow_difference` is explicitly true |

## Report Reconciliation Results

| Report | Reconciliation basis | Result |
|---|---|---|
| General Ledger | Posted/reversed `journal_entry_lines` | Pass by query review |
| Account Statement | Posted/reversed `journal_entry_lines` for selected account | Pass by query review |
| Trial Balance | Posted/reversed `journal_entry_lines`; summary exposes debit/credit difference | Pass by query review |
| Income Statement | Posted/reversed revenue and expense journal lines, excluding year-end closing source | Pass by query review |
| Balance Sheet | Posted/reversed asset/liability/equity journal lines through selected date | Pass by query review |
| VAT Report | VAT Output and VAT Input configured ledger accounts | Pass by query review |
| Customer Ledger | Accounts Receivable ledger by source-linked customer documents | Pass by query review, but live data required for documents without customer-resolvable source |
| Supplier Ledger | Accounts Payable ledger by source-linked supplier documents | Pass by query review, but live data required for documents without supplier-resolvable source |
| Inventory Valuation | Product balances and inventory value | Requires live DB reconciliation to stock ledger and Inventory ledger account |
| Payroll liabilities | Payroll run/payment journals | Requires live DB reconciliation to Employee Payables and payroll payable accounts |
| Fixed asset register | Asset register and depreciation runs | Limitation: acquisition journal is not automatic, so register only agrees with Fixed Assets ledger if acquisition is posted separately |

## UI Review

| Item | Result |
|---|---|
| Amounts display EGP / ج.م | Pass by code review of currency utilities and UI usage |
| No visible multi-currency UI | Pass by previous EGP-only implementation review |
| Accounting reports have date filters | Pass for financial report page |
| Branch/cost center filters | Implemented where report endpoints support dimensions |
| Empty states and errors | Existing shared table empty states and API error toasts are present |
| Hidden/out-of-scope modules | No FX, multi-currency, OCR, bank API, advanced BI, or advanced approval UI was added |

## Fixes Made During QA

- Customer payment now validates invoice belongs to the active company.
- Customer payment now validates selected payment account belongs to the active company and is active.
- Customer payment posting is now transaction-wrapped to avoid partial operational updates if journal posting fails.
- Operational account balance updates in payments and payouts now include `company_id`.
- Payouts, supplier payments, and payroll payments now reject inactive operational money accounts.
- Journal posting now rejects chart accounts from another company and inactive chart accounts for new postings.
- Journal reversal is allowed to reverse historical inactive-account lines without mutating the original.
- Collections now support invoice collections and general receipts; general receipts can post without customer/invoice and credit a selected chart account.
- Payouts now support optional supplier and optional selected debit account, falling back to General Expenses when no debit account is selected.
- Sales invoice creation can include immediate collection, posted in the same transaction as the invoice.
- Purchase invoice creation can include immediate supplier payment, posted in the same transaction as the purchase invoice.
- Supplier payments can infer supplier from the selected purchase invoice.
- Balance Sheet now uses posted/reversed journal lines only and includes current-year profit/loss in equity so expenses do not break the accounting equation.

## Client Feedback QA Scenarios

| Scenario | Expected result | Status |
|---|---|---|
| Sales invoice without collection | Invoice posts AR/Sales/VAT and remains unpaid/sent | Ready for live test |
| Sales invoice with partial collection | Invoice posts sales journal plus collection journal; status partial | Ready for live test |
| Sales invoice with full collection | Invoice posts sales journal plus collection journal; status paid | Ready for live test |
| General receipt without customer/invoice | Dr Cash/Bank/Wallet, Cr selected credit account; no invoice update | Ready for live test |
| Purchase invoice without payment | Purchase/AP journal posts and payable remains open | Ready for live test |
| Purchase invoice with partial payment | Purchase journal plus supplier payment journal; remaining payable updated | Ready for live test |
| Purchase invoice with full payment | Purchase journal plus supplier payment journal; status paid | Ready for live test |
| Payout without supplier using General Expenses | Dr General Expenses, Cr Cash/Bank/Wallet | Ready for live test |
| Payout without supplier using selected debit account | Dr selected debit account, Cr Cash/Bank/Wallet | Ready for live test |
| Balance Sheet after sales, collections, expenses, purchases, supplier payments | Assets = Liabilities + Equity including current-year P/L | Ready for live test |
| Trial Balance after same flow | Total debit equals total credit | Ready for live test |
| Locked periods block posting | Invoice collections, general receipts, payouts, purchases, supplier payments reject locked dates | Ready for live test |

## Known Limitations

- Fixed asset creation does not automatically post Dr Fixed Assets / Cr Cash, Bank, AP, or Opening Equity. Acquisition must be posted through purchase invoice/manual journal for ledger/register agreement.
- Inventory valuation report is operational and should be live-tested against both `stock_ledger` and the Inventory ledger account before production.
- Payroll report summaries are operational; liabilities must be verified against Employee Payables and payroll payable ledger accounts in a live seeded run.
- Report warning for "period not closed" uses unlocked accounting periods as the practical V1 signal.
- CSV bank statement import is simple pasted CSV; no bank API, OCR, or automatic matching.
- No live database scenario run was available in this QA pass.
- Frontend production build is blocked by missing Rollup optional package `@rollup/rollup-win32-x64-msvc` in `node_modules`.

## Remaining Issues Before Production

1. Run the full test dataset against a fresh migrated database and attach actual journal numbers.
2. Resolve frontend Rollup optional dependency installation so the production frontend build passes.
3. Decide whether fixed asset acquisition should remain manual or be posted automatically from purchase/payment workflows.
4. Add live reconciliation evidence for Inventory Valuation, Payroll Liabilities, and Fixed Asset Register.
5. Confirm all migrations from `030` through `038` apply cleanly on an empty DB and an upgraded legacy DB.

## Final Readiness Status

Status: Not production-ready yet.

Reason: Core journal posting and ledger-based financial reports are substantially ready by code review and typecheck, and several QA defects were fixed. Production sign-off still requires a live seeded accounting run, successful frontend build, and documented reconciliation evidence for inventory, payroll liabilities, and fixed assets.
