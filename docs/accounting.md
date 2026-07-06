# OneClick/Hesabat Accounting Setup

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
   - Retained Earnings / Opening Balance Equity
   - Inventory Adjustment
4. Create fiscal years and accounting periods.
5. Run Opening Balances only after reviewing the migration summary.

## Posting

- Sales invoices post receivables, revenue, VAT, and COGS when inventory items have cost.
- Customer collections post cash/bank/wallet against receivables.
- Payouts post general expenses against cash/bank/wallet.
- Purchase invoices post inventory or expenses, VAT input, and payables.
- Supplier payments post payables against cash/bank/wallet.
- Stock adjustments post inventory against the inventory adjustment account.

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
- Supplier payment: Dr Accounts Payable, Cr Cash/Bank/Wallet.
- Inventory sale posts Dr COGS, Cr Inventory.
- Locked periods block posting/editing.
- Reversed entries remain linked and do not mutate the original.

## Excluded From This Phase

ZATCA/e-invoicing, payroll, fixed assets, multi-currency accounting, advanced bank reconciliation, cost centers, branches, projects, manufacturing/BOM, budgeting, cash-flow forecasting, mobile app, external accountant portal, external integrations, and advanced approval workflows.

Purchase returns are intentionally hidden from the UI until the complete accounting and inventory reversal workflow is implemented.
