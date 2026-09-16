import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { AlertTriangle, ArrowRight, Printer } from 'lucide-react';

const titleMap: Record<string, string> = {
  'general-ledger': 'دفتر الأستاذ العام',
  'account-statement': 'كشف حساب',
  'trial-balance': 'ميزان المراجعة',
  'income-statement': 'قائمة الدخل',
  'balance-sheet': 'الميزانية / المركز المالي',
  'customer-ledger': 'دفتر أستاذ العملاء',
  'ar-aging': 'أعمار الديون',
  'supplier-ledger': 'دفتر أستاذ الموردين',
  vat: 'تقرير ضريبة القيمة المضافة',
  inventory: 'تقييم المخزون',
  'fixed-asset-register': 'سجل الأصول الثابتة',
  'depreciation-schedule': 'جدول الإهلاك',
  'accumulated-depreciation': 'ملخص مجمع الإهلاك',
  'payroll-summary': 'ملخص الرواتب',
  'payroll-by-employee': 'الرواتب حسب الموظف',
  'payroll-by-dimension': 'الرواتب حسب الفرع ومركز التكلفة',
};

const summaryLabel = (key: string) => ({
  total_debit: 'إجمالي المدين',
  total_credit: 'إجمالي الدائن',
  balanced: 'متوازن',
  total_revenue: 'إجمالي الإيرادات',
  total_expenses: 'إجمالي المصروفات',
  net_profit: 'صافي الربح',
  net_loss: 'صافي الخسارة',
  assets: 'الأصول',
  liabilities: 'الالتزامات',
  equity: 'حقوق الملكية',
  current_year_profit_loss: 'صافي ربح/خسارة الفترة',
  equity_total: 'إجمالي حقوق الملكية',
  liabilities_and_equity: 'إجمالي الالتزامات وحقوق الملكية',
  output_vat: 'ضريبة المخرجات',
  input_vat: 'ضريبة المدخلات',
  net_vat: 'صافي الضريبة',
  ar_ledger_balance: 'رصيد العملاء في الأستاذ',
  ap_ledger_balance: 'رصيد الموردين في الأستاذ',
  outstanding_total: 'إجمالي الرصيد المستحق',
  difference: 'الفرق',
}[key] ?? key.replaceAll('_', ' '));

const endpointFor = (type: string) => {
  if (type === 'account-statement') return '/api/reports/account-statement';
  if (type === 'inventory') return '/api/reports/inventory';
  if (type === 'fixed-asset-register') return '/api/reports/fixed-assets/register';
  if (type === 'depreciation-schedule') return '/api/reports/fixed-assets/depreciation-schedule';
  if (type === 'accumulated-depreciation') return '/api/reports/fixed-assets/accumulated-summary';
  if (type === 'payroll-summary') return '/api/reports/payroll/summary';
  if (type === 'payroll-by-employee') return '/api/reports/payroll/by-employee';
  if (type === 'payroll-by-dimension') return '/api/reports/payroll/by-dimension';
  return `/api/reports/${type}`;
};
interface DimensionRow { id: string; code: string | null; name: string; is_active: boolean }
interface CustomerRow { id: string; name: string }
interface SupplierRow { id: string; name: string }
interface AccountRow { id: string; code: string; name: string; is_active: boolean }
interface CategoryRow { id: string; name: string; parent_id?: string | null; parent_name?: string | null }

const FinancialReportDetail = () => {
  const { type = 'trial-balance' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '', branchId: '', costCenterId: '', customerId: '', supplierId: '', accountId: '', categoryId: '', subcategoryId: '' });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/branches')).data ?? [],
  });
  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/cost-centers')).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<{ data: CustomerRow[] }>('/api/clients?page_size=300')).data ?? [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<{ data: SupplierRow[] }>('/api/suppliers?page_size=300')).data ?? [],
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: async () => (await api.get<{ data: AccountRow[] }>('/api/accounting/chart-accounts')).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    enabled: type === 'inventory',
    queryKey: ['product-categories'],
    queryFn: async () => (await api.get<{ data: CategoryRow[] }>('/api/categories')).data ?? [],
  });
  const mainCategories = categories.filter((c) => !c.parent_id);
  const subcategoriesFor = (parentId: string) => categories.filter((c) => c.parent_id === parentId);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.from && !['balance-sheet', 'inventory'].includes(type)) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    if (applied.branchId && !['inventory'].includes(type)) params.set('branch_id', applied.branchId);
    if (applied.customerId && ['ar-aging', 'customer-ledger'].includes(type)) params.set('customer_id', applied.customerId);
    if (applied.supplierId && type === 'supplier-ledger') params.set('supplier_id', applied.supplierId);
    if (applied.accountId && ['general-ledger', 'account-statement'].includes(type)) params.set('account_id', applied.accountId);
    if (applied.categoryId && type === 'inventory') params.set('category_id', applied.categoryId);
    if (applied.subcategoryId && type === 'inventory') params.set('subcategory_id', applied.subcategoryId);
    if (applied.costCenterId && ['general-ledger', 'account-statement', 'trial-balance', 'income-statement', 'customer-ledger', 'supplier-ledger', 'vat'].includes(type)) params.set('cost_center_id', applied.costCenterId);
    return params.toString();
  }, [applied, type]);
  const { data } = useQuery({
    queryKey: ['financial-report', type, query],
    queryFn: async () => api.get<{ data: any[] | Record<string, unknown>; summary?: Record<string, string | number | boolean>; warnings?: string[] }>(`${endpointFor(type)}${query ? `?${query}` : ''}`),
  });
  const rows = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
  // While the query is still loading (data undefined) this must fall back to
  // {}, not to data?.data — that was undefined too, and Object.keys(undefined)
  // below throws, crashing every report page during its own loading state.
  const summary = data?.summary ?? {};
  const warnings = data?.warnings ?? [];
  const cols = useMemo<Column<any>[]>(() => {
    if (type === 'general-ledger') return [
      { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.entry_date) },
      { key: 'number', header: 'القيد', cell: (r) => r.number },
      { key: 'account', header: 'الحساب', cell: (r) => `${r.account_code} - ${r.account_name}` },
      { key: 'memo', header: 'البيان', cell: (r) => r.memo ?? r.description ?? '—' },
      { key: 'branch', header: 'الفرع', cell: (r) => r.branch_name ?? '—' },
      { key: 'cost_center', header: 'مركز التكلفة', cell: (r) => r.cost_center_name ?? '—' },
      { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
      { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
    ];
    if (type === 'account-statement') return [
      { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.entry_date) },
      { key: 'number', header: 'القيد', cell: (r) => r.number },
      { key: 'memo', header: 'البيان', cell: (r) => r.memo ?? r.description ?? '—' },
      { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
      { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
      { key: 'running', header: 'الرصيد الجاري', cell: (r) => formatCurrency(Number(r.running_balance)), className: 'text-end' },
    ];
    if (type === 'trial-balance') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'الحساب', cell: (r) => r.name },
      { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
      { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
      { key: 'balance', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.balance)), className: 'text-end' },
    ];
    if (type === 'income-statement') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'الحساب', cell: (r) => r.name },
      { key: 'type', header: 'النوع', cell: (r) => r.type },
      { key: 'amount', header: 'المبلغ', cell: (r) => formatCurrency(Math.abs(Number(r.amount))), className: 'text-end' },
    ];
    if (type === 'balance-sheet') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'الحساب', cell: (r) => r.name },
      { key: 'type', header: 'النوع', cell: (r) => r.type },
      { key: 'balance', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.type === 'asset' ? r.debit_balance : r.credit_balance)), className: 'text-end' },
    ];
    if (type === 'customer-ledger' || type === 'supplier-ledger') return [
      { key: 'name', header: type === 'customer-ledger' ? 'العميل' : 'المورد', cell: (r) => r.name },
      { key: 'debit', header: 'مدين دفتر الأستاذ', cell: (r) => formatCurrency(Number(r.ledger_debit ?? 0)), className: 'text-end' },
      { key: 'credit', header: 'دائن دفتر الأستاذ', cell: (r) => formatCurrency(Number(r.ledger_credit ?? 0)), className: 'text-end' },
      { key: 'outstanding', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.outstanding)), className: 'text-end' },
    ];
    if (type === 'ar-aging') return [
      { key: 'customer', header: 'العميل', cell: (r) => r.customer_name },
      { key: 'invoice', header: 'الفاتورة', cell: (r) => r.invoice_number },
      { key: 'due', header: 'الاستحقاق', cell: (r) => r.due_date ? formatDateShort(r.due_date) : '—' },
      { key: 'current', header: 'حالي', cell: (r) => formatCurrency(Number(r.current)), className: 'text-end' },
      { key: 'd1', header: '1-30', cell: (r) => formatCurrency(Number(r.days_1_30)), className: 'text-end' },
      { key: 'd31', header: '31-60', cell: (r) => formatCurrency(Number(r.days_31_60)), className: 'text-end' },
      { key: 'd61', header: '61-90', cell: (r) => formatCurrency(Number(r.days_61_90)), className: 'text-end' },
      { key: 'd90', header: 'أكثر من 90', cell: (r) => formatCurrency(Number(r.over_90)), className: 'text-end' },
      { key: 'total', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.remaining)), className: 'text-end' },
    ];
    if (type === 'inventory') return [
      { key: 'name', header: 'المنتج', cell: (r) => r.name },
      { key: 'type', header: 'النوع', cell: (r) => r.product_type === 'stock' ? 'مخزني' : r.product_type },
      { key: 'category', header: 'التصنيف', cell: (r) => r.category_name ?? '—' },
      { key: 'subcategory', header: 'التصنيف الفرعي', cell: (r) => r.subcategory_name ?? '—' },
      { key: 'qty', header: 'الكمية', cell: (r) => `${r.quantity} ${r.unit}` },
      { key: 'cost', header: 'متوسط التكلفة', cell: (r) => formatCurrency(Number(r.average_cost ?? r.cost)), className: 'text-end' },
      { key: 'value', header: 'قيمة المخزون', cell: (r) => formatCurrency(Number(r.stock_value)), className: 'text-end' },
    ];
    if (type === 'vat') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'حساب الضريبة', cell: (r) => r.name },
      { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
      { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
      { key: 'balance', header: 'الرصيد الضريبي', cell: (r) => formatCurrency(Number(r.vat_balance)), className: 'text-end' },
    ];
    if (type === 'fixed-asset-register') return [
      { key: 'code', header: 'الكود', cell: (r) => r.asset_code },
      { key: 'name', header: 'الأصل', cell: (r) => r.name },
      { key: 'category', header: 'التصنيف', cell: (r) => r.category_name },
      { key: 'cost', header: 'التكلفة', cell: (r) => formatCurrency(Number(r.acquisition_cost)), className: 'text-end' },
      { key: 'acc', header: 'مجمع الإهلاك', cell: (r) => formatCurrency(Number(r.accumulated_depreciation)), className: 'text-end' },
      { key: 'nbv', header: 'صافي القيمة', cell: (r) => formatCurrency(Number(r.net_book_value)), className: 'text-end' },
    ];
    if (type === 'depreciation-schedule') return [
      { key: 'asset', header: 'الأصل', cell: (r) => `${r.asset_code} - ${r.asset_name}` },
      { key: 'period', header: 'الفترة', cell: (r) => r.period_name },
      { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.run_date) },
      { key: 'amount', header: 'الإهلاك', cell: (r) => formatCurrency(Number(r.depreciation_amount)), className: 'text-end' },
      { key: 'acc', header: 'المجمع', cell: (r) => formatCurrency(Number(r.accumulated_depreciation_after)), className: 'text-end' },
    ];
    if (type === 'accumulated-depreciation') return [
      { key: 'category', header: 'التصنيف', cell: (r) => r.category_name },
      { key: 'count', header: 'عدد الأصول', cell: (r) => r.asset_count },
      { key: 'cost', header: 'التكلفة', cell: (r) => formatCurrency(Number(r.acquisition_cost)), className: 'text-end' },
      { key: 'acc', header: 'مجمع الإهلاك', cell: (r) => formatCurrency(Number(r.accumulated_depreciation)), className: 'text-end' },
      { key: 'nbv', header: 'صافي القيمة', cell: (r) => formatCurrency(Number(r.net_book_value)), className: 'text-end' },
    ];
    if (type === 'payroll-summary') return [
      { key: 'period', header: 'الفترة', cell: (r) => `${r.period_year}-${String(r.period_month).padStart(2, '0')}` },
      { key: 'status', header: 'الحالة', cell: (r) => r.status },
      { key: 'employees', header: 'الموظفون', cell: (r) => r.employee_count },
      { key: 'earnings', header: 'الاستحقاقات', cell: (r) => formatCurrency(Number(r.total_earnings)), className: 'text-end' },
      { key: 'deductions', header: 'الاستقطاعات', cell: (r) => formatCurrency(Number(r.total_deductions)), className: 'text-end' },
      { key: 'net', header: 'الصافي', cell: (r) => formatCurrency(Number(r.net_salary)), className: 'text-end' },
    ];
    if (type === 'payroll-by-employee') return [
      { key: 'code', header: 'الكود', cell: (r) => r.employee_code },
      { key: 'name', header: 'الموظف', cell: (r) => r.name },
      { key: 'earnings', header: 'الاستحقاقات', cell: (r) => formatCurrency(Number(r.total_earnings)), className: 'text-end' },
      { key: 'deductions', header: 'الاستقطاعات', cell: (r) => formatCurrency(Number(r.total_deductions)), className: 'text-end' },
      { key: 'net', header: 'الصافي', cell: (r) => formatCurrency(Number(r.net_salary)), className: 'text-end' },
    ];
    if (type === 'payroll-by-dimension') return [
      { key: 'branch', header: 'الفرع', cell: (r) => r.branch_name ?? '—' },
      { key: 'cost_center', header: 'مركز التكلفة', cell: (r) => r.cost_center_name ?? '—' },
      { key: 'lines', header: 'البنود', cell: (r) => r.employee_lines },
      { key: 'earnings', header: 'الاستحقاقات', cell: (r) => formatCurrency(Number(r.total_earnings)), className: 'text-end' },
      { key: 'deductions', header: 'الاستقطاعات', cell: (r) => formatCurrency(Number(r.total_deductions)), className: 'text-end' },
      { key: 'net', header: 'الصافي', cell: (r) => formatCurrency(Number(r.net_salary)), className: 'text-end' },
    ];
    return [
      { key: 'key', header: 'البند', cell: (r) => r.id },
      { key: 'value', header: 'القيمة', cell: (r) => JSON.stringify(r) },
    ];
  }, [type]);
  const tableRows = rows.map((row, idx) => ({ id: row.id ?? `${type}-${idx}`, ...row }));
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للتقارير المالية</Link>
      <PageHeader title={titleMap[type] ?? 'تقرير مالي'} actions={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 me-1" /> طباعة</Button>} />
      <Card className="p-4 border-border/60">
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">كل الفروع</option>
              {branches.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} - ` : ''}{b.name}</option>)}
            </select>
            {['general-ledger', 'account-statement'].includes(type) ? (
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">كل الحسابات</option>
                {accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            ) : ['ar-aging', 'customer-ledger'].includes(type) ? (
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">كل العملاء</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : type === 'supplier-ledger' ? (
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">كل الموردين</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : type === 'inventory' ? (
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
                <option value="">كل التصنيفات</option>
                {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : ['trial-balance', 'income-statement', 'vat'].includes(type) ? (
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
                <option value="">كل مراكز التكلفة</option>
                {costCenters.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}
              </select>
            ) : <div />}
            {type === 'inventory' && (
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId || subcategoriesFor(categoryId).length === 0}>
                <option value="">كل التصنيفات الفرعية</option>
                {subcategoriesFor(categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Button onClick={() => setApplied({ from, to, branchId, costCenterId, customerId, supplierId, accountId, categoryId, subcategoryId })}>تطبيق</Button>
            <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setBranchId(''); setCostCenterId(''); setCustomerId(''); setSupplierId(''); setAccountId(''); setCategoryId(''); setSubcategoryId(''); setApplied({ from: '', to: '', branchId: '', costCenterId: '', customerId: '', supplierId: '', accountId: '', categoryId: '', subcategoryId: '' }); }}>مسح</Button>
        </div>
      </Card>
      {warnings.length > 0 && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>تنبيهات التقرير</AlertTitle>
          <AlertDescription>{warnings.join(' · ')}</AlertDescription>
        </Alert>
      )}
      {Object.keys(summary).length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(summary).map(([key, value]) => <Card key={key} className="p-4"><div className="text-xs text-muted-foreground">{summaryLabel(key)}</div><div className="text-xl font-bold mt-1">{typeof value === 'boolean' ? (value ? 'نعم' : 'لا') : typeof value === 'number' || !Number.isNaN(Number(value)) ? formatCurrency(Number(value)) : String(value)}</div></Card>)}
        </div>
      )}
      <DataTable data={tableRows} columns={cols} pageSize={25} emptyTitle="لا توجد بيانات" />
    </div>
  );
};

export default FinancialReportDetail;
