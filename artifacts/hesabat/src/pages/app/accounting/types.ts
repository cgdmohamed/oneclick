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
  payment: 'تحصيل',
  payout: 'مصروف',
  purchase_invoice: 'فاتورة شراء',
  supplier_payment: 'دفعة مورد',
  stock_movement: 'حركة مخزون',
  opening_balance: 'أرصدة افتتاحية',
  journal_reversal: 'قيد عكسي',
}[source ?? ''] ?? (source || 'يدوي'));
