import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ArrowRight, Download, Printer } from 'lucide-react';
import { payments as mockPayments } from '@/data/mock';
import { useClients, useAccounts, useInvoices, useProducts } from '@/hooks/entities';
import { api, isApiConfigured } from '@/lib/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { formatCurrency, formatDateShort, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { InvoicesCharts, PaymentsCharts, RemainingCharts, ByAccountCharts } from '@/components/common/ReportCharts';

const titleMap: Record<string, string> = {
  invoices:          'تقرير الفواتير',
  payments:          'تقرير التحصيلات',
  payouts:           'تقرير المصروفات',
  remaining:         'تقرير المتبقي',
  'sales-returns':   'تقرير مرتجعات المبيعات',
  'by-method':       'تقرير حسب وسيلة الدفع',
  'by-account':      'تقرير حسب الحساب المالي',
  suppliers:         'تقرير نشاط الموردين',
  inventory:         'تقرير المخزون',
  'stock-risk':      'تقرير مخاطر المخزون',
  'inventory-write-offs': 'تقرير هالك / شطب المخزون',
  'product-sales':    'تحليل مبيعات المنتجات',
  'accounts-summary':'ملخص الحسابات المالية',
};

interface FlatPayment {
  id: string; date: string; invoiceId: string;
  invoiceNumber?: string; method: string; accountId: string;
  accountName?: string; amount: number;
}

interface PayoutReport {
  id: string; amount: string | number; method: string; paid_at: string;
  reference: string | null; notes: string | null;
  supplier_name: string | null; category_name: string | null; account_name: string;
  branch_name?: string | null; cost_center_name?: string | null;
}

interface SupplierReport {
  id: string; name: string; phone: string | null; email: string | null; is_active: boolean;
  product_count: number; payout_count: number; total_payouts: string | number; last_payout_at: string | null;
}

interface InventoryRow {
  id: string; name: string; sku: string | null; quantity: number; alert_level: number;
  product_type?: string; price: string | number; cost: string | number; average_cost?: string | number; unit: string; is_active: boolean;
  category_name: string | null; subcategory_name?: string | null; supplier_name: string | null; stock_value: string | number;
}

interface InventoryWriteOffReportRow {
  id: string; write_off_number: string; write_off_date: string; reason: string;
  product_name: string; sku: string | null; category_name: string | null; subcategory_name?: string | null;
  quantity: string | number; unit_cost: string | number; total_cost: string | number;
  branch_name: string | null; cost_center_name: string | null;
}

interface SalesReturnReportRow {
  id: string; credit_note_number: string; credit_note_date: string; status: string;
  customer_name: string; product_name: string | null; sku: string | null; description: string;
  quantity: string | number; unit_price: string | number; vat_rate: string | number; line_total: string | number;
  category_name?: string | null; subcategory_name?: string | null; return_condition: string; return_to_stock: boolean;
}

interface AccountSummaryRow {
  id: string; name: string; type: string; balance: string | number;
  total_collections: string | number; total_payouts: string | number;
}

interface ProductSalesRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  product_type: string;
  category: string | null;
  subcategory: string | null;
  quantity_sold: string | number;
  quantity_returned: string | number;
  net_quantity_sold: string | number;
  gross_sales: string | number;
  sales_returns: string | number;
  net_sales: string | number;
  cogs: string | number;
  gross_profit: string | number;
  margin_percent: string | number;
  current_stock: string | number;
  inventory_value: string | number;
}

interface StockRiskRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  subcategory: string | null;
  current_stock: string | number;
  average_cost: string | number;
  inventory_value: string | number;
  quantity_sold: string | number;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  low_stock: boolean;
  out_of_stock: boolean;
  slow_moving: boolean;
  high_value_slow_moving: boolean;
  suggested_action: string;
}

interface DimensionRow { id: string; code: string | null; name: string; is_active: boolean }
interface CategoryRow { id: string; name: string; parent_id?: string | null; parent_name?: string | null; is_active?: boolean }

const ReportDetail = () => {
  const { type = 'invoices' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [branchId, setBranchId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [productType, setProductType] = useState('');
  const [highValueThreshold, setHighValueThreshold] = useState('10000');
  const [sortBy, setSortBy] = useState('net_sales');
  const [applied, setApplied] = useState<{ from: string; to: string; branchId: string; costCenterId: string; categoryId: string; subcategoryId: string; productId: string; productType: string; highValueThreshold: string }>({ from: '', to: '', branchId: '', costCenterId: '', categoryId: '', subcategoryId: '', productId: '', productType: '', highValueThreshold: '10000' });

  const { list: clients }  = useClients();
  const { list: accounts } = useAccounts();
  const { list: invoices } = useInvoices();
  const { list: products } = useProducts();

  const apiOn = isApiConfigured();
  const dimensionsEnabled = apiOn && ['payouts', 'product-sales', 'stock-risk'].includes(type);

  const branchesQuery = useQuery({
    enabled: dimensionsEnabled,
    queryKey: ['branches'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/branches')).data ?? [],
  });
  const costCentersQuery = useQuery({
    enabled: dimensionsEnabled,
    queryKey: ['cost-centers'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/cost-centers')).data ?? [],
  });
  const productCategoriesQuery = useQuery({
    enabled: apiOn && ['inventory', 'inventory-write-offs', 'sales-returns', 'product-sales', 'stock-risk'].includes(type),
    queryKey: ['product-categories'],
    queryFn: async () => (await api.get<{ data: CategoryRow[] }>('/api/categories')).data ?? [],
  });
  const mainCategories = (productCategoriesQuery.data ?? []).filter((c) => !c.parent_id);
  const subcategoriesFor = (parentId: string) => (productCategoriesQuery.data ?? []).filter((c) => c.parent_id === parentId);
  const productCategoryQuery = (includeDates = false) => {
    const params = new URLSearchParams();
    if (includeDates && applied.from) params.set('from', applied.from);
    if (includeDates && applied.to) params.set('to', applied.to);
    if (applied.categoryId) params.set('category_id', applied.categoryId);
    if (applied.subcategoryId) params.set('subcategory_id', applied.subcategoryId);
    if (applied.productId) params.set('product_id', applied.productId);
    if (applied.productType) params.set('product_type', applied.productType);
    return params.toString();
  };

  const paymentsQuery = useQuery({
    enabled: apiOn,
    queryKey: ['payments-flat'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        id: string; invoice_id: string; account_id: string; amount: string | number;
        method: string; paid_at: string; invoice_number?: string; account_name?: string;
      }> }>('/api/payments');
      return res.data.map<FlatPayment>((p) => ({
        id: p.id, date: p.paid_at, invoiceId: p.invoice_id, invoiceNumber: p.invoice_number,
        method: p.method, accountId: p.account_id, accountName: p.account_name,
        amount: Number(p.amount),
      }));
    },
  });

  const payoutsQuery = useQuery({
    enabled: apiOn && type === 'payouts',
    queryKey: ['report-payouts', applied.from, applied.to, applied.branchId, applied.costCenterId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set('from', applied.from);
      if (applied.to)   params.set('to', applied.to);
      if (applied.branchId) params.set('branch_id', applied.branchId);
      if (applied.costCenterId) params.set('cost_center_id', applied.costCenterId);
      const res = await api.get<{ data: PayoutReport[] }>(`/api/reports/payouts?${params}`);
      return res.data ?? [];
    },
  });

  const suppliersQuery = useQuery({
    enabled: apiOn && type === 'suppliers',
    queryKey: ['report-suppliers'],
    queryFn: async () => {
      const res = await api.get<{ data: SupplierReport[] }>('/api/reports/suppliers');
      return res.data ?? [];
    },
  });

  const inventoryQuery = useQuery({
    enabled: apiOn && type === 'inventory',
    queryKey: ['report-inventory', applied.categoryId, applied.subcategoryId],
    queryFn: async () => {
      const query = productCategoryQuery();
      const res = await api.get<{ data: InventoryRow[] }>(`/api/reports/inventory${query ? `?${query}` : ''}`);
      return res.data ?? [];
    },
  });

  const inventoryWriteOffsQuery = useQuery({
    enabled: apiOn && type === 'inventory-write-offs',
    queryKey: ['report-inventory-write-offs', applied.from, applied.to, applied.categoryId, applied.subcategoryId],
    queryFn: async () => {
      const query = productCategoryQuery(true);
      const res = await api.get<{ data: InventoryWriteOffReportRow[] }>(`/api/reports/inventory-write-offs${query ? `?${query}` : ''}`);
      return res.data ?? [];
    },
  });

  const salesReturnsQuery = useQuery({
    enabled: apiOn && type === 'sales-returns',
    queryKey: ['report-sales-returns', applied.from, applied.to, applied.categoryId, applied.subcategoryId],
    queryFn: async () => {
      const query = productCategoryQuery(true);
      const res = await api.get<{ data: SalesReturnReportRow[] }>(`/api/reports/sales-returns${query ? `?${query}` : ''}`);
      return res.data ?? [];
    },
  });

  const productSalesQuery = useQuery({
    enabled: apiOn && type === 'product-sales',
    queryKey: ['report-product-sales', applied.from, applied.to, applied.branchId, applied.costCenterId, applied.categoryId, applied.subcategoryId, applied.productId, applied.productType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set('date_from', applied.from);
      if (applied.to) params.set('date_to', applied.to);
      if (applied.branchId) params.set('branch_id', applied.branchId);
      if (applied.costCenterId) params.set('cost_center_id', applied.costCenterId);
      if (applied.categoryId) params.set('category_id', applied.categoryId);
      if (applied.subcategoryId) params.set('subcategory_id', applied.subcategoryId);
      if (applied.productId) params.set('product_id', applied.productId);
      if (applied.productType) params.set('product_type', applied.productType);
      return api.get<{ data: ProductSalesRow[]; summary: Record<string, number> }>(`/api/reports/product-sales?${params}`);
    },
  });

  const stockRiskQuery = useQuery({
    enabled: apiOn && type === 'stock-risk',
    queryKey: ['report-stock-risk', applied.from, applied.to, applied.branchId, applied.categoryId, applied.subcategoryId, applied.productId, applied.highValueThreshold],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set('date_from', applied.from);
      if (applied.to) params.set('date_to', applied.to);
      if (applied.branchId) params.set('branch_id', applied.branchId);
      if (applied.categoryId) params.set('category_id', applied.categoryId);
      if (applied.subcategoryId) params.set('subcategory_id', applied.subcategoryId);
      if (applied.productId) params.set('product_id', applied.productId);
      if (applied.highValueThreshold) params.set('high_value_threshold', applied.highValueThreshold);
      return api.get<{ data: StockRiskRow[]; summary: Record<string, number | string> }>(`/api/reports/stock-risk?${params}`);
    },
  });

  const accountsSummaryQuery = useQuery({
    enabled: apiOn && type === 'accounts-summary',
    queryKey: ['report-accounts-summary'],
    queryFn: async () => {
      const res = await api.get<{ data: AccountSummaryRow[] }>('/api/reports/accounts-summary');
      return res.data ?? [];
    },
  });

  const flatPayments = useMemo<FlatPayment[]>(() => {
    if (apiOn) return paymentsQuery.data ?? [];
    return mockPayments.flatMap((p) =>
      p.splits.map((s) => ({
        id: `${p.id}-${s.method}-${s.accountId}`,
        date: p.date, invoiceId: p.invoiceId,
        method: s.method, accountId: s.accountId, amount: s.amount,
      })),
    );
  }, [apiOn, paymentsQuery.data]);

  const inRange = (dateStr?: string) => {
    if (!dateStr) return true;
    if (applied.from && dateStr < applied.from) return false;
    if (applied.to   && dateStr > applied.to)   return false;
    return true;
  };
  const filteredInvoices = useMemo(() => invoices.filter((i) => inRange(i.issueDate)),  [invoices, applied]);
  const filteredPayments = useMemo(() => flatPayments.filter((p) => inRange(p.date)),   [flatPayments, applied]);
  const productSalesRows = useMemo(() => {
    const rows = [...(productSalesQuery.data?.data ?? [])];
    const value = (row: ProductSalesRow) => {
      if (sortBy === 'quantity_sold') return Number(row.quantity_sold ?? 0);
      if (sortBy === 'gross_profit') return Number(row.gross_profit ?? 0);
      if (sortBy === 'margin_percent') return Number(row.margin_percent ?? 0);
      if (sortBy === 'return_rate') return Number(row.quantity_sold) > 0 ? (Number(row.quantity_returned) / Number(row.quantity_sold)) * 100 : 0;
      return Number(row.net_sales ?? 0);
    };
    return rows.sort((a, b) => value(b) - value(a));
  }, [productSalesQuery.data?.data, sortBy]);
  const productSalesSummary = productSalesQuery.data?.summary;

  const exportProductSales = () => {
    const headers = ['product_name','sku','barcode','category','subcategory','quantity_sold','quantity_returned','net_quantity_sold','gross_sales','sales_returns','net_sales','cogs','gross_profit','margin_percent','current_stock','inventory_value'];
    const escape = (value: unknown) => {
      const s = value == null ? '' : String(value);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(','), ...productSalesRows.map((r) => headers.map((h) => escape((r as unknown as Record<string, unknown>)[h])).join(','))];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'product-sales-analytics.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const renderTable = () => {
    if (type === 'stock-risk') {
      const rows = stockRiskQuery.data?.data ?? [];
      const summary = stockRiskQuery.data?.summary;
      const flagText = (row: StockRiskRow) => [
        row.out_of_stock ? 'نفد' : '',
        row.low_stock ? 'منخفض' : '',
        row.slow_moving ? 'بطيء' : '',
        row.high_value_slow_moving ? 'عالي القيمة' : '',
      ].filter(Boolean).join('، ') || 'طبيعي';

      return (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4"><div className="text-xs text-muted-foreground">منخفض المخزون</div><div className="text-xl font-bold mt-1">{Number(summary?.low_stock ?? 0)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">نفد من المخزون</div><div className="text-xl font-bold mt-1">{Number(summary?.out_of_stock ?? 0)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">بطيء الحركة</div><div className="text-xl font-bold mt-1">{Number(summary?.slow_moving ?? 0)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">بطيء عالي القيمة</div><div className="text-xl font-bold mt-1">{Number(summary?.high_value_slow_moving ?? 0)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">قيمة المخزون</div><div className="text-xl font-bold mt-1">{formatCurrency(Number(summary?.inventory_value ?? 0))}</div></Card>
          </div>
          <DataTable
            data={rows.map((r) => ({ id: r.product_id, ...r }))}
            columns={[
              { key: 'product', header: 'المنتج', cell: (r) => <Link className="text-primary font-medium" to={`/app/products/${r.product_id}`}>{r.product_name}</Link> },
              { key: 'sku', header: 'الكود', cell: (r) => r.sku ?? '—' },
              { key: 'barcode', header: 'الباركود', cell: (r) => r.barcode ?? '—' },
              { key: 'category', header: 'التصنيف', cell: (r) => r.category ?? '—' },
              { key: 'subcategory', header: 'التصنيف الفرعي', cell: (r) => r.subcategory ?? '—' },
              { key: 'stock', header: 'المخزون الحالي', cell: (r) => Number(r.current_stock), className: 'text-end' },
              { key: 'avg_cost', header: 'متوسط التكلفة', cell: (r) => formatCurrency(Number(r.average_cost)), className: 'text-end' },
              { key: 'value', header: 'قيمة المخزون', cell: (r) => formatCurrency(Number(r.inventory_value)), className: 'text-end' },
              { key: 'sold', header: 'مباع بالفترة', cell: (r) => Number(r.quantity_sold), className: 'text-end' },
              { key: 'last_sale', header: 'آخر بيع', cell: (r) => r.last_sale_date ? formatDateShort(r.last_sale_date) : '—' },
              { key: 'days', header: 'أيام منذ آخر بيع', cell: (r) => r.days_since_last_sale ?? '—', className: 'text-end' },
              { key: 'flags', header: 'المخاطر', cell: (r) => <span className={r.out_of_stock || r.high_value_slow_moving ? 'text-destructive font-semibold' : r.low_stock || r.slow_moving ? 'text-warning font-semibold' : 'text-success'}>{flagText(r)}</span> },
              { key: 'action', header: 'الإجراء المقترح', cell: (r) => r.suggested_action },
            ] as Column<StockRiskRow & { id: string }>[]}
            pageSize={25}
            emptyTitle="لا توجد مخاطر مخزون"
          />
        </div>
      );
    }
    if (type === 'product-sales') {
      return (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4"><div className="text-xs text-muted-foreground">صافي المبيعات</div><div className="text-xl font-bold mt-1">{formatCurrency(Number(productSalesSummary?.net_sales ?? 0))}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">مجمل الربح</div><div className="text-xl font-bold mt-1">{formatCurrency(Number(productSalesSummary?.gross_profit ?? 0))}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">الهامش</div><div className="text-xl font-bold mt-1">{Number(productSalesSummary?.margin_percent ?? 0).toFixed(2)}%</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">الكمية الصافية</div><div className="text-xl font-bold mt-1">{Number(productSalesSummary?.net_quantity_sold ?? 0)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">قيمة المخزون</div><div className="text-xl font-bold mt-1">{formatCurrency(Number(productSalesSummary?.inventory_value ?? 0))}</div></Card>
          </div>
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold">أفضل 10 منتجات</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
                <Button variant="outline" size="sm" onClick={exportProductSales}><Download className="h-4 w-4 ml-1" /> CSV</Button>
              </div>
            </div>
            <DataTable
              data={productSalesRows.slice(0, 10).map((r) => ({ id: r.product_id, ...r }))}
              columns={[
                { key: 'product', header: 'المنتج', cell: (r) => <Link className="text-primary font-medium" to={`/app/products/${r.product_id}`}>{r.product_name}</Link> },
                { key: 'sku', header: 'الكود / الباركود', cell: (r) => [r.sku, r.barcode].filter(Boolean).join(' / ') || '—' },
                { key: 'category', header: 'التصنيف', cell: (r) => [r.category, r.subcategory].filter(Boolean).join(' / ') || '—' },
                { key: 'net_sales', header: 'صافي المبيعات', cell: (r) => formatCurrency(Number(r.net_sales)), className: 'text-end' },
                { key: 'profit', header: 'مجمل الربح', cell: (r) => formatCurrency(Number(r.gross_profit)), className: 'text-end' },
                { key: 'margin', header: 'الهامش', cell: (r) => `${Number(r.margin_percent).toFixed(2)}%`, className: 'text-end' },
              ] as Column<ProductSalesRow & { id: string }>[]}
              pageSize={10}
              emptyTitle="لا توجد مبيعات منتجات"
            />
          </Card>
          <DataTable
            data={productSalesRows.map((r) => ({ id: r.product_id, ...r }))}
            columns={[
              { key: 'product', header: 'المنتج', cell: (r) => <Link className="text-primary font-medium" to={`/app/products/${r.product_id}`}>{r.product_name}</Link> },
              { key: 'sku', header: 'الكود', cell: (r) => r.sku ?? '—' },
              { key: 'barcode', header: 'الباركود', cell: (r) => r.barcode ?? '—' },
              { key: 'category', header: 'التصنيف', cell: (r) => r.category ?? '—' },
              { key: 'subcategory', header: 'التصنيف الفرعي', cell: (r) => r.subcategory ?? '—' },
              { key: 'sold', header: 'مباع', cell: (r) => Number(r.quantity_sold), className: 'text-end' },
              { key: 'returned', header: 'مرتجع', cell: (r) => Number(r.quantity_returned), className: 'text-end' },
              { key: 'net_qty', header: 'صافي الكمية', cell: (r) => Number(r.net_quantity_sold), className: 'text-end' },
              { key: 'gross', header: 'إجمالي المبيعات', cell: (r) => formatCurrency(Number(r.gross_sales)), className: 'text-end' },
              { key: 'returns', header: 'المرتجعات', cell: (r) => formatCurrency(Number(r.sales_returns)), className: 'text-end' },
              { key: 'net', header: 'صافي المبيعات', cell: (r) => formatCurrency(Number(r.net_sales)), className: 'text-end' },
              { key: 'cogs', header: 'التكلفة', cell: (r) => formatCurrency(Number(r.cogs)), className: 'text-end' },
              { key: 'profit', header: 'مجمل الربح', cell: (r) => formatCurrency(Number(r.gross_profit)), className: 'text-end' },
              { key: 'margin', header: 'الهامش', cell: (r) => `${Number(r.margin_percent).toFixed(2)}%`, className: 'text-end' },
              { key: 'stock', header: 'المخزون', cell: (r) => Number(r.current_stock), className: 'text-end' },
              { key: 'value', header: 'قيمة المخزون', cell: (r) => formatCurrency(Number(r.inventory_value)), className: 'text-end' },
            ] as Column<ProductSalesRow & { id: string }>[]}
            pageSize={25}
            emptyTitle="لا توجد مبيعات منتجات"
          />
        </div>
      );
    }
    if (type === 'invoices') {
      return <DataTable data={filteredInvoices} columns={[
        { key: 'num',    header: 'الرقم',    cell: (r) => <Link to={`/app/invoices/${r.id}`} className="text-primary">{r.number}</Link> },
        { key: 'client', header: 'العميل',   cell: (r) => r.clientName ?? clients.find((c) => c.id === r.clientId)?.name },
        { key: 'date',   header: 'التاريخ',  cell: (r) => formatDateShort(r.issueDate) },
        { key: 'total',  header: 'الإجمالي', cell: (r) => formatCurrency(r.total) },
        { key: 'paid',   header: 'المدفوع',  cell: (r) => formatCurrency(r.paid) },
        { key: 'rem',    header: 'المتبقي',  cell: (r) => formatCurrency(r.remaining) },
        { key: 'status', header: 'الحالة',   cell: (r) => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
      ]} />;
    }
    if (type === 'remaining') {
      const data = filteredInvoices.filter((i) => i.remaining > 0);
      return <DataTable data={data} columns={[
        { key: 'num',    header: 'الرقم',       cell: (r) => r.number },
        { key: 'client', header: 'العميل',      cell: (r) => r.clientName ?? clients.find((c) => c.id === r.clientId)?.name },
        { key: 'due',    header: 'الاستحقاق',  cell: (r) => formatDateShort(r.dueDate) },
        { key: 'total',  header: 'الإجمالي',   cell: (r) => formatCurrency(r.total) },
        { key: 'rem',    header: 'المتبقي',     cell: (r) => <span className="text-destructive font-semibold">{formatCurrency(r.remaining)}</span> },
        { key: 'status', header: 'الحالة',      cell: (r) => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
      ]} />;
    }
    if (type === 'payments') {
      return <DataTable data={filteredPayments} columns={[
        { key: 'date',    header: 'التاريخ',   cell: (r) => formatDateShort(r.date) },
        { key: 'inv',     header: 'الفاتورة',  cell: (r) => r.invoiceNumber ?? invoices.find((i) => i.id === r.invoiceId)?.number },
        { key: 'method',  header: 'الطريقة',   cell: (r) => paymentMethodLabel(r.method) },
        { key: 'account', header: 'الحساب',    cell: (r) => r.accountName ?? accounts.find((a) => a.id === r.accountId)?.name },
        { key: 'amount',  header: 'المبلغ',    cell: (r) => formatCurrency(r.amount) },
      ] as Column<FlatPayment>[]} />;
    }
    if (type === 'payouts') {
      return <DataTable data={payoutsQuery.data ?? []} columns={[
        { key: 'date',     header: 'التاريخ',    cell: (r) => formatDateShort(r.paid_at) },
        { key: 'supplier', header: 'المورد',     cell: (r) => r.supplier_name ?? '—' },
        { key: 'category', header: 'التصنيف',   cell: (r) => r.category_name ?? '—' },
        { key: 'account',  header: 'الحساب',    cell: (r) => r.account_name },
        { key: 'branch',   header: 'الفرع',     cell: (r) => r.branch_name ?? '—' },
        { key: 'cost_center', header: 'مركز التكلفة', cell: (r) => r.cost_center_name ?? '—' },
        { key: 'method',   header: 'الطريقة',   cell: (r) => paymentMethodLabel(r.method) },
        { key: 'amount',   header: 'المبلغ',    cell: (r) => <span className="font-semibold text-destructive">{formatCurrency(Number(r.amount))}</span> },
        { key: 'ref',      header: 'المرجع',    cell: (r) => r.reference ?? '—' },
      ] as Column<PayoutReport>[]} />;
    }
    if (type === 'by-method') {
      const grouped = ['cash','bank','wallet'].map((m) => ({
        id: m, method: paymentMethodLabel(m),
        count: filteredPayments.filter((p) => p.method === m).length,
        total: filteredPayments.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0),
      }));
      return <DataTable data={grouped} columns={[
        { key: 'method', header: 'الطريقة',      cell: (r) => <span className="font-medium">{r.method}</span> },
        { key: 'count',  header: 'عدد العمليات', cell: (r) => r.count },
        { key: 'total',  header: 'الإجمالي',     cell: (r) => formatCurrency(r.total) },
      ]} />;
    }
    if (type === 'by-account') {
      const grouped = accounts.map((a) => ({
        id: a.id, name: a.name, type: a.type,
        count: filteredPayments.filter((p) => p.accountId === a.id).length,
        total: filteredPayments.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.amount, 0),
        balance: a.balance,
      }));
      return <DataTable data={grouped} columns={[
        { key: 'name',    header: 'الحساب',         cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'count',   header: 'عدد التحصيلات', cell: (r) => r.count },
        { key: 'total',   header: 'إجمالي المحصل', cell: (r) => formatCurrency(r.total) },
        { key: 'balance', header: 'الرصيد الحالي', cell: (r) => formatCurrency(r.balance) },
      ]} />;
    }
    if (type === 'suppliers') {
      return <DataTable data={suppliersQuery.data ?? []} columns={[
        { key: 'name',    header: 'المورد',          cell: (r) => <Link to={`/app/suppliers/${r.id}`} className="text-primary font-medium">{r.name}</Link> },
        { key: 'prods',   header: 'المنتجات',        cell: (r) => r.product_count },
        { key: 'payouts', header: 'عدد المصروفات',  cell: (r) => r.payout_count },
        { key: 'total',   header: 'إجمالي المدفوع', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.total_payouts))}</span> },
        { key: 'last',    header: 'آخر دفعة',        cell: (r) => r.last_payout_at ? formatDateShort(r.last_payout_at) : '—' },
        { key: 'status',  header: 'الحالة',          cell: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} label={r.is_active ? 'نشط' : 'غير نشط'} /> },
      ] as Column<SupplierReport>[]} />;
    }
    if (type === 'inventory') {
      return <DataTable data={inventoryQuery.data ?? []} columns={[
        { key: 'name',     header: 'المنتج',       cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'sku',      header: 'SKU',           cell: (r) => r.sku ?? '—' },
        { key: 'type',     header: 'النوع',         cell: (r) => r.product_type === 'stock' ? 'مخزني' : r.product_type ?? '—' },
        { key: 'category', header: 'التصنيف',      cell: (r) => r.category_name ?? '—' },
        { key: 'subcategory', header: 'التصنيف الفرعي', cell: (r) => r.subcategory_name ?? '—' },
        { key: 'supplier', header: 'المورد',        cell: (r) => r.supplier_name ?? '—' },
        { key: 'qty',      header: 'الكمية',        cell: (r) => <span className={r.quantity <= r.alert_level ? 'text-destructive font-semibold' : 'font-semibold'}>{r.quantity} {r.unit}</span> },
        { key: 'avg_cost', header: 'متوسط التكلفة', cell: (r) => formatCurrency(Number(r.average_cost ?? r.cost)) },
        { key: 'value',    header: 'قيمة المخزون', cell: (r) => formatCurrency(Number(r.stock_value)) },
      ] as Column<InventoryRow>[]} />;
    }
    if (type === 'sales-returns') {
      const label = (v: string) => ({ resellable: 'صالح للبيع', damaged: 'تالف', inspection: 'تحت الفحص', scrap: 'خردة' }[v] ?? v);
      return <DataTable data={salesReturnsQuery.data ?? []} columns={[
        { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.credit_note_date) },
        { key: 'number', header: 'الإشعار', cell: (r) => r.credit_note_number },
        { key: 'customer', header: 'العميل', cell: (r) => r.customer_name },
        { key: 'product', header: 'المنتج', cell: (r) => r.product_name ?? r.description },
        { key: 'category', header: 'التصنيف', cell: (r) => r.category_name ?? '—' },
        { key: 'subcategory', header: 'التصنيف الفرعي', cell: (r) => r.subcategory_name ?? '—' },
        { key: 'condition', header: 'حالة المرتجع', cell: (r) => label(r.return_condition) },
        { key: 'stock', header: 'عاد للمخزون', cell: (r) => r.return_to_stock ? 'نعم' : 'لا' },
        { key: 'qty', header: 'الكمية', cell: (r) => Number(r.quantity), className: 'text-end' },
        { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.line_total)), className: 'text-end' },
        { key: 'status', header: 'الحالة', cell: (r) => r.status },
      ] as Column<SalesReturnReportRow>[]} />;
    }
    if (type === 'inventory-write-offs') {
      return <DataTable data={inventoryWriteOffsQuery.data ?? []} columns={[
        { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.write_off_date) },
        { key: 'number', header: 'المستند', cell: (r) => r.write_off_number },
        { key: 'product', header: 'المنتج', cell: (r) => <span className="font-medium">{r.product_name}</span> },
        { key: 'category', header: 'التصنيف', cell: (r) => r.category_name ?? '—' },
        { key: 'subcategory', header: 'التصنيف الفرعي', cell: (r) => r.subcategory_name ?? '—' },
        { key: 'reason', header: 'السبب', cell: (r) => r.reason },
        { key: 'branch', header: 'الفرع', cell: (r) => r.branch_name ?? '—' },
        { key: 'cost_center', header: 'مركز التكلفة', cell: (r) => r.cost_center_name ?? '—' },
        { key: 'qty', header: 'الكمية', cell: (r) => Number(r.quantity), className: 'text-end' },
        { key: 'unit', header: 'تكلفة الوحدة', cell: (r) => formatCurrency(Number(r.unit_cost)), className: 'text-end' },
        { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total_cost)), className: 'text-end' },
      ] as Column<InventoryWriteOffReportRow>[]} />;
    }
    if (type === 'accounts-summary') {
      return <DataTable data={accountsSummaryQuery.data ?? []} columns={[
        { key: 'name',        header: 'الحساب',           cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'type',        header: 'النوع',            cell: (r) => r.type },
        { key: 'collections', header: 'إجمالي التحصيل', cell: (r) => <span className="text-success">{formatCurrency(Number(r.total_collections))}</span> },
        { key: 'payouts',     header: 'إجمالي المصروف', cell: (r) => <span className="text-destructive">{formatCurrency(Number(r.total_payouts))}</span> },
        { key: 'balance',     header: 'الرصيد',           cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.balance))}</span> },
      ] as Column<AccountSummaryRow>[]} />;
    }
    return null;
  };

  const hasFilter   = applied.from || applied.to || applied.branchId || applied.costCenterId || applied.categoryId || applied.subcategoryId || applied.productId || applied.productType || applied.highValueThreshold !== '10000';
  const categoryFilterEnabled = ['inventory', 'inventory-write-offs', 'sales-returns', 'product-sales', 'stock-risk'].includes(type);
  const showFilter  = categoryFilterEnabled || !['suppliers','accounts-summary'].includes(type);

  return (
    <div>
      <Link to="/app/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowRight className="h-4 w-4" /> العودة للتقارير
      </Link>
      <PageHeader title={titleMap[type] ?? 'تقرير'} />

      {showFilter && (
        <Card className="p-4 mb-5 border-border/60">
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div><Label>من تاريخ</Label><Input type="date" className="mt-1.5" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>إلى تاريخ</Label><Input type="date" className="mt-1.5" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            {type === 'product-sales' || type === 'stock-risk' ? (
              <>
                <div>
                  <Label>الفرع</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">كل الفروع</option>
                    {(branchesQuery.data ?? []).filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                {type === 'product-sales' && (
                  <div>
                    <Label>مركز التكلفة</Label>
                    <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
                      <option value="">كل مراكز التكلفة</option>
                      {(costCentersQuery.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <Label>التصنيف</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
                    <option value="">كل التصنيفات</option>
                    {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>التصنيف الفرعي</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId || subcategoriesFor(categoryId).length === 0}>
                    <option value="">كل التصنيفات الفرعية</option>
                    {subcategoriesFor(categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>المنتج</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={productId} onChange={(e) => setProductId(e.target.value)}>
                    <option value="">كل المنتجات</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {type === 'product-sales' ? (
                  <>
                    <div>
                      <Label>نوع المنتج</Label>
                      <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={productType} onChange={(e) => setProductType(e.target.value)}>
                        <option value="">كل الأنواع</option>
                        <option value="stock">مخزني</option>
                        <option value="service">خدمة</option>
                        <option value="non_stock">غير مخزني</option>
                        <option value="expense">مصروف</option>
                      </select>
                    </div>
                    <div>
                      <Label>ترتيب حسب</Label>
                      <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="net_sales">صافي المبيعات</option>
                        <option value="quantity_sold">الكمية المباعة</option>
                        <option value="gross_profit">مجمل الربح</option>
                        <option value="margin_percent">الهامش %</option>
                        <option value="return_rate">معدل المرتجعات</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <Label>حد القيمة العالية</Label>
                    <Input type="number" min="0" step="100" className="mt-1.5" value={highValueThreshold} onChange={(e) => setHighValueThreshold(e.target.value)} />
                  </div>
                )}
              </>
            ) : type === 'payouts' ? (
              <>
                <div>
                  <Label>الفرع</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">كل الفروع</option>
                    {(branchesQuery.data ?? []).filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>مركز التكلفة</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
                    <option value="">كل مراكز التكلفة</option>
                    {(costCentersQuery.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </>
            ) : categoryFilterEnabled ? (
              <>
                <div>
                  <Label>التصنيف</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
                    <option value="">كل التصنيفات</option>
                    {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>التصنيف الفرعي</Label>
                  <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId || subcategoriesFor(categoryId).length === 0}>
                    <option value="">كل التصنيفات الفرعية</option>
                    {subcategoriesFor(categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </>
            ) : <><div /><div /></>}
            <Button onClick={() => setApplied({ from, to, branchId, costCenterId, categoryId, subcategoryId, productId, productType, highValueThreshold })}>تطبيق الفلتر</Button>
            {hasFilter ? (
              <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setBranchId(''); setCostCenterId(''); setCategoryId(''); setSubcategoryId(''); setProductId(''); setProductType(''); setHighValueThreshold('10000'); setApplied({ from: '', to: '', branchId: '', costCenterId: '', categoryId: '', subcategoryId: '', productId: '', productType: '', highValueThreshold: '10000' }); }}>مسح الفلتر</Button>
            ) : <div />}
          </div>
        </Card>
      )}

      {type === 'invoices'   && <InvoicesCharts invoices={filteredInvoices} />}
      {type === 'remaining'  && <RemainingCharts invoices={filteredInvoices} />}
      {(type === 'payments'  || type === 'by-method') && <PaymentsCharts payments={filteredPayments} />}
      {type === 'by-account' && <ByAccountCharts accounts={accounts} payments={filteredPayments} />}

      {renderTable()}
    </div>
  );
};

export default ReportDetail;
