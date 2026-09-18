export interface ChartAccount {
  id: string;
  parent_id: string | null;
  parent_code?: string | null;
  parent_name?: string | null;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal_balance: 'debit' | 'credit';
  is_active: boolean;
}

export interface FiscalYear {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_closed: boolean;
  closing_journal_entry_id?: string | null;
  closed_at?: string | null;
}

export interface AccountingPeriod {
  id: string;
  fiscal_year_id: string;
  fiscal_year_name?: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_locked: boolean;
}

export interface JournalEntry {
  id: string;
  number: string;
  entry_date: string;
  status: 'draft' | 'posted' | 'reversed';
  source_type: string | null;
  source_id: string | null;
  memo: string | null;
  reversed_entry_id: string | null;
}

export interface JournalLine {
  id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  description: string | null;
  debit: string | number;
  credit: string | number;
}

export interface PurchaseInvoice {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  number: string;
  supplier_number: string | null;
  invoice_date: string;
  due_date: string | null;
  status: 'draft' | 'posted' | 'paid' | 'partial' | 'cancelled';
  subtotal: string | number;
  vat_amount: string | number;
  total: string | number;
  paid: string | number;
  remaining: string | number;
  journal_entry_id: string | null;
  notes: string | null;
  items?: PurchaseInvoiceItem[];
}

export interface PurchaseInvoiceItem {
  id: string;
  product_id: string | null;
  expense_account_id: string | null;
  description: string;
  quantity: string | number;
  unit_cost: string | number;
  vat_rate: string | number;
  line_total: string | number;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  purchase_invoice_id: string | null;
  purchase_invoice_number?: string | null;
  account_id: string;
  account_name?: string;
  amount: string | number;
  paid_at: string;
  method: string;
  reference: string | null;
  notes: string | null;
  journal_entry_id: string | null;
}

export interface PurchaseReturn {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  original_purchase_invoice_id: string | null;
  original_purchase_invoice_number?: string | null;
  return_number: string;
  return_date: string;
  status: 'draft' | 'posted' | 'cancelled';
  subtotal: string | number;
  vat_amount: string | number;
  total: string | number;
  journal_entry_id: string | null;
  notes: string | null;
  items?: PurchaseReturnItem[];
}

export interface PurchaseReturnItem {
  id: string;
  product_id: string;
  product_name?: string;
  quantity: string | number;
  unit_cost: string | number;
  vat_rate: string | number;
  line_total: string | number;
}

export interface CreditNote {
  id: string;
  customer_id: string;
  customer_name?: string;
  original_invoice_id: string | null;
  original_invoice_number?: string | null;
  credit_note_number: string;
  credit_note_date: string;
  status: 'draft' | 'posted' | 'cancelled';
  subtotal: string | number;
  vat_amount: string | number;
  total: string | number;
  journal_entry_id: string | null;
  notes: string | null;
  items?: CreditNoteItem[];
}

export interface CreditNoteItem {
  id: string;
  product_id: string | null;
  product_name?: string | null;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  vat_rate: string | number;
  line_total: string | number;
  return_condition: 'resellable' | 'damaged' | 'inspection' | 'scrap';
  return_to_stock: boolean;
  original_invoice_item_id: string | null;
}

export interface DebitNote {
  id: string;
  customer_id: string;
  customer_name?: string;
  original_invoice_id: string | null;
  original_invoice_number?: string | null;
  debit_note_number: string;
  debit_note_date: string;
  status: 'draft' | 'posted' | 'cancelled';
  subtotal: string | number;
  vat_amount: string | number;
  total: string | number;
  journal_entry_id: string | null;
  notes: string | null;
  items?: DebitNoteItem[];
}

export interface DebitNoteItem {
  id: string;
  product_id: string | null;
  product_name?: string | null;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  vat_rate: string | number;
  line_total: string | number;
  original_invoice_item_id: string | null;
}

export interface AssetCategory {
  id: string;
  name: string;
  fixed_asset_account_id: string | null;
  accumulated_depreciation_account_id: string | null;
  depreciation_expense_account_id: string | null;
  default_useful_life_months: number;
  is_active: boolean;
}

export interface FixedAsset {
  id: string;
  asset_code: string;
  name: string;
  category_id: string;
  category_name?: string;
  purchase_date: string;
  acquisition_cost: string | number;
  salvage_value: string | number;
  useful_life_months: number;
  depreciation_start_date: string;
  status: 'active' | 'fully_depreciated' | 'disposed';
  branch_id: string | null;
  cost_center_id: string | null;
  notes: string | null;
  accumulated_depreciation?: string | number;
  net_book_value?: string | number;
  depreciation_lines?: DepreciationRunLine[];
}

export interface DepreciationRun {
  id: string;
  period_id: string;
  period_name?: string;
  starts_on?: string;
  ends_on?: string;
  run_date: string;
  status: 'draft' | 'posted' | 'cancelled';
  journal_entry_id: string | null;
  total?: string | number;
}

export interface DepreciationRunLine {
  id?: string;
  asset_id: string;
  asset_code?: string;
  asset_name?: string;
  depreciation_amount: string | number;
  accumulated_depreciation_after: string | number;
  run_date?: string;
  period_name?: string;
  journal_entry_id?: string | null;
}

export interface Employee {
  id: string;
  employee_code: string;
  name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  hire_date: string;
  status: 'active' | 'inactive';
  branch_id: string | null;
  branch_name?: string | null;
  cost_center_id: string | null;
  cost_center_name?: string | null;
  basic_salary: string | number;
  notes: string | null;
}

export interface SalaryComponent {
  id: string;
  name: string;
  type: 'earning' | 'deduction' | 'employer_contribution';
  account_id: string;
  account_code?: string;
  account_name?: string;
  is_active: boolean;
}

export interface PayrollRun {
  id: string;
  period_month: number;
  period_year: number;
  status: 'draft' | 'posted' | 'paid' | 'cancelled';
  run_date: string;
  journal_entry_id: string | null;
  payment_journal_entry_id?: string | null;
  employee_count?: number;
  net_total?: string | number;
  lines?: PayrollRunLine[];
}

export interface PayrollRunLine {
  id: string;
  employee_id: string;
  employee_code?: string;
  employee_name?: string;
  basic_salary: string | number;
  total_earnings: string | number;
  total_deductions: string | number;
  net_salary: string | number;
  branch_id?: string | null;
  cost_center_id?: string | null;
  components?: Array<{ name: string; type: string; amount: string | number }>;
  proration_days?: number | null;
  proration_total_days?: number | null;
}

export interface BankReconciliation {
  id: string;
  account_id: string;
  account_name?: string;
  bank_name?: string | null;
  iban?: string | null;
  statement_date: string;
  opening_balance: string | number | null;
  closing_balance: string | number;
  status: 'draft' | 'completed' | 'cancelled';
  notes: string | null;
  completed_at: string | null;
  line_count?: number;
  matched_count?: number;
  lines?: BankStatementLine[];
  unmatched_journal_lines?: BankJournalLine[];
  summary?: BankReconciliationSummary;
}

export interface BankStatementLine {
  id: string;
  transaction_date: string;
  description: string;
  debit_amount: string | number;
  credit_amount: string | number;
  reference: string | null;
  matched_journal_line_id: string | null;
  is_matched: boolean;
  journal_number?: string | null;
  journal_entry_id?: string | null;
  journal_description?: string | null;
  journal_debit?: string | number | null;
  journal_credit?: string | number | null;
}

export interface BankJournalLine {
  id: string;
  journal_entry_id: string;
  journal_number: string;
  entry_date: string;
  memo: string | null;
  description: string | null;
  debit: string | number;
  credit: string | number;
}

export interface BankReconciliationSummary {
  statement_debits: string | number;
  statement_credits: string | number;
  line_count: number;
  matched_count: number;
  statement_movement: string | number;
  calculated_statement_balance: string | number | null;
  system_bank_balance: string | number;
  unreconciled_difference: string | number;
}

export const accountTypeLabel = (type: string) => ({
  asset: 'أصول',
  liability: 'التزامات',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات',
}[type] ?? type);

export const normalBalanceLabel = (value: string) => value === 'debit' ? 'مدين' : 'دائن';

export const journalStatusLabel = (status: string) => ({
  draft: 'مسودة',
  posted: 'مرحل',
  reversed: 'معكوس',
}[status] ?? status);

export const sourceLabel = (source?: string | null) => ({
  invoice: 'فاتورة بيع',
  credit_note: 'إشعار دائن',
  doubtful_debt_allowance: 'مخصص ديون مشكوك فيها',
  bad_debt_write_off: 'إعدام دين',
  depreciation_run: 'تشغيل إهلاك',
  payroll_run: 'تشغيل رواتب',
  payroll_payment: 'دفع رواتب',
  bank_charge: 'مصروفات بنكية',
  bank_interest: 'فوائد بنكية',
  payment: 'تحصيل',
  payout: 'مصروف',
  purchase_invoice: 'فاتورة شراء',
  purchase_return: 'مرتجع شراء',
  supplier_payment: 'دفعة مورد',
  stock_movement: 'حركة مخزون',
  opening_balance: 'أرصدة افتتاحية',
  year_end_closing: 'إقفال نهاية السنة',
  journal_reversal: 'قيد عكسي',
}[source ?? ''] ?? (source || 'يدوي'));
