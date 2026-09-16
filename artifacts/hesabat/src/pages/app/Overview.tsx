import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import {
  AlertTriangle,
  Boxes,
  CreditCard,
  FileText,
  Landmark,
  Package,
  Receipt,
  Scale,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { useCurrentFeatureSet } from '@/hooks/usePlanAccess';

type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

interface CategoryRow { id: string; name: string; parent_id?: string | null }
interface DimensionRow { id: string; name: string; code?: string | null; is_active: boolean }
interface Kpis {
  totalSales: string; netSales: string; totalCollections: string; outstandingReceivables: string;
  totalPurchases: string; totalExpenses: string; netProfit: string; inventoryValue: string;
  vatPayable: string; overdueInvoices: number; lowStockItems: number; outOfStockItems: number;
  cashBankBalance: string; salesChangePct: number;
}
interface ProductMetric {
  id: string; name: string; sku?: string | null; barcode?: string | null;
  category_name?: string | null; subcategory_name?: string | null;
  quantity_sold?: string | number; sales_amount?: string | number; gross_profit?: string | number;
  margin_pct?: string | number; current_stock?: string | number; alert_level?: string | number;
  inventory_value?: string | number;
  returned_quantity?: string | number; returned_amount?: string | number;
  written_off_quantity?: string | number; written_off_amount?: string | number;
  last_sale_at?: string | null; write_off_date?: string | null;
}
interface ReceivableRow { id: string; name?: string; customer_name?: string; number?: string; due_date?: string; remaining?: string | number; overdue_amount?: string | number; invoice_count?: number; oldest_due_date?: string }
interface PayableRow { id: string; name?: string; supplier_name?: string; number?: string; due_date?: string; remaining?: string | number; payable_amount?: string | number; invoice_count?: number; oldest_due_date?: string }
interface AccountingHealth {
  draft_journals: number; unbalanced_journals: number; unposted_invoices: number; unposted_payments: number;
  unposted_purchases: number; open_periods: number; locked_periods: number; incomplete_settings_count: number;
  missing_settings: string[];
}
interface DashboardSummary {
  filters: { categories: CategoryRow[] };
  kpis: Kpis;
  salesTrend: Array<{ date: string; sales: string | number }>;
  topProductsByRevenue: ProductMetric[];
  topProductsByQuantity: ProductMetric[];
  topProductsByProfit: ProductMetric[];
  lowStockBestSellers: ProductMetric[];
  slowMovingProducts: ProductMetric[];
  mostReturnedProducts: ProductMetric[];
  mostWrittenOffProducts: ProductMetric[];
  inventoryAlerts: {
    lowStockProducts: ProductMetric[];
    outOfStockProducts: ProductMetric[];
    overstockSlowMovingProducts: ProductMetric[];
    highValueSlowMovingProducts: ProductMetric[];
    productsWithRecentWriteOffs: ProductMetric[];
    productsWithHighReturnRate: ProductMetric[];
  };
  receivables: { topOverdueCustomers: ReceivableRow[]; upcomingReceivables: ReceivableRow[] };
  payables: { topSupplierPayables: PayableRow[]; upcomingSupplierPayments: PayableRow[] };
  accountingHealth: AccountingHealth;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const startOfWeek = (date: Date) => {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
};
const presetRange = (preset: DatePreset) => {
  const now = new Date();
  if (preset === 'today') return { from: iso(now), to: iso(now) };
  if (preset === 'week') return { from: iso(startOfWeek(now)), to: iso(now) };
  if (preset === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (preset === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return { from: '', to: '' };
};

const money = (value: string | number | undefined) => formatCurrency(Number(value ?? 0));
const pct = (value: string | number | undefined) => `${Number(value ?? 0).toFixed(1)}%`;
const productMeta = (row: ProductMetric) => [row.sku, row.barcode].filter(Boolean).join(' / ') || '—';
const categoryText = (row: ProductMetric) => [row.category_name, row.subcategory_name].filter(Boolean).join(' / ') || '—';

const ProductTable = ({ rows, emptyTitle = 'لا توجد بيانات' }: { rows: ProductMetric[]; emptyTitle?: string }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="py-2 text-start font-semibold">المنتج</th>
          <th className="py-2 text-start font-semibold">الكود / الباركود</th>
          <th className="py-2 text-start font-semibold">التصنيف</th>
          <th className="py-2 text-end font-semibold">الكمية</th>
          <th className="py-2 text-end font-semibold">المبيعات</th>
          <th className="py-2 text-end font-semibold">مجمل الربح</th>
          <th className="py-2 text-end font-semibold">الهامش</th>
          <th className="py-2 text-end font-semibold">المخزون</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">{emptyTitle}</td></tr>
        ) : rows.map((row) => (
          <tr key={row.id} className="border-b border-border/40">
            <td className="py-2 font-medium"><Link to={`/app/products/${row.id}`} className="text-primary">{row.name}</Link></td>
            <td className="py-2 text-muted-foreground">{productMeta(row)}</td>
            <td className="py-2 text-muted-foreground">{categoryText(row)}</td>
            <td className="py-2 text-end">{Number(row.quantity_sold ?? row.returned_quantity ?? row.written_off_quantity ?? 0)}</td>
            <td className="py-2 text-end">{money(row.sales_amount ?? row.returned_amount ?? row.written_off_amount)}</td>
            <td className="py-2 text-end">{money(row.gross_profit)}</td>
            <td className="py-2 text-end">{pct(row.margin_pct)}</td>
            <td className="py-2 text-end">{Number(row.current_stock ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SmallList = ({ title, rows, children }: { title: string; rows: unknown[]; children: React.ReactNode }) => (
  <Card className="p-5 border-border/60 shadow-soft">
    <h3 className="font-semibold mb-3">{title}</h3>
    {rows.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">لا توجد بيانات</p> : children}
  </Card>
);

const Overview = () => {
  const apiOn = isApiConfigured();
  const { features } = useCurrentFeatureSet();
  const canSeeAccounting = features.has('accounting');
  const [preset, setPreset] = useState<DatePreset>('month');
  const presetDates = presetRange(preset);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [branchId, setBranchId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetDates;
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    if (branchId) params.set('branch_id', branchId);
    if (costCenterId) params.set('cost_center_id', costCenterId);
    if (categoryId) params.set('category_id', categoryId);
    if (subcategoryId) params.set('subcategory_id', subcategoryId);
    return params.toString();
  }, [range.from, range.to, branchId, costCenterId, categoryId, subcategoryId]);

  const dashboard = useQuery({
    enabled: apiOn,
    queryKey: ['dashboard-summary', query],
    queryFn: async () => (await api.get<{ data: DashboardSummary }>(`/api/dashboard/summary${query ? `?${query}` : ''}`)).data,
    refetchInterval: 60_000,
  });
  const branches = useQuery({
    enabled: apiOn,
    queryKey: ['branches'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/branches')).data ?? [],
  });
  const costCenters = useQuery({
    enabled: apiOn,
    queryKey: ['cost-centers'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/cost-centers')).data ?? [],
  });

  const data = dashboard.data;
  const categories = data?.filters.categories ?? [];
  const mainCategories = categories.filter((c) => !c.parent_id);
  const subcategoriesFor = (parentId: string) => categories.filter((c) => c.parent_id === parentId);
  const trendRows = data?.salesTrend.map((row) => ({ date: formatDateShort(String(row.date)), sales: Number(row.sales) })) ?? [];
  const k = data?.kpis;

  if (!apiOn) {
    return (
      <div className="space-y-6">
        <PageHeader title="نظرة عامة" description="لوحة متابعة الأعمال والمحاسبة" />
        <Card className="p-8 text-center text-muted-foreground">الاتصال بالخادم غير مفعّل في هذا العرض.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="نظرة عامة" description="مبيعات، مخزون، تحصيلات، موردون وصحة محاسبية" />

      <Card className="p-4 border-border/60">
        <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end">
          <div>
            <Label>الفترة</Label>
            <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)}>
              <option value="today">اليوم</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month">هذا الشهر</option>
              <option value="year">هذه السنة</option>
              <option value="custom">مخصص</option>
            </select>
          </div>
          <div><Label>من</Label><Input className="mt-1.5" type="date" value={range.from} disabled={preset !== 'custom'} onChange={(e) => setCustomFrom(e.target.value)} /></div>
          <div><Label>إلى</Label><Input className="mt-1.5" type="date" value={range.to} disabled={preset !== 'custom'} onChange={(e) => setCustomTo(e.target.value)} /></div>
          <div>
            <Label>الفرع</Label>
            <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">كل الفروع</option>
              {(branches.data ?? []).filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <Label>مركز التكلفة</Label>
            <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
              <option value="">كل مراكز التكلفة</option>
              {(costCenters.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
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
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي المبيعات" value={money(k?.totalSales)} icon={Wallet} accent="primary" trend={k ? { value: `${k.salesChangePct >= 0 ? '+' : ''}${k.salesChangePct}% عن الفترة السابقة`, positive: k.salesChangePct >= 0 } : undefined} />
        <StatCard title="صافي المبيعات" value={money(k?.netSales)} icon={TrendingUp} accent="success" />
        <StatCard title="إجمالي التحصيل" value={money(k?.totalCollections)} icon={CreditCard} accent="success" />
        <StatCard title="الذمم المدينة" value={money(k?.outstandingReceivables)} icon={Receipt} accent="warning" />
        <StatCard title="إجمالي المشتريات" value={money(k?.totalPurchases)} icon={ShoppingCart} accent="info" />
        <StatCard title="إجمالي المصروفات" value={money(k?.totalExpenses)} icon={TrendingDown} accent="destructive" />
        <StatCard title="صافي الربح" value={money(k?.netProfit)} icon={Scale} accent={Number(k?.netProfit ?? 0) >= 0 ? 'success' : 'destructive'} />
        <StatCard title="قيمة المخزون" value={money(k?.inventoryValue)} icon={Boxes} accent="primary" />
        <StatCard title="ضريبة مستحقة" value={money(k?.vatPayable)} icon={FileText} accent="warning" />
        <StatCard title="فواتير متأخرة" value={k?.overdueInvoices ?? 0} icon={AlertTriangle} accent="destructive" />
        <StatCard title="مخزون منخفض" value={k?.lowStockItems ?? 0} icon={Package} accent="destructive" hint={`نفد: ${k?.outOfStockItems ?? 0}`} />
        <StatCard title="رصيد النقد والبنوك" value={money(k?.cashBankBalance)} icon={Landmark} accent="info" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">الملخص</TabsTrigger>
          <TabsTrigger value="sales">المبيعات</TabsTrigger>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="inventory">المخزون</TabsTrigger>
          <TabsTrigger value="receivables">الذمم</TabsTrigger>
          {canSeeAccounting && <TabsTrigger value="accounting">الصحة المحاسبية</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 p-5 border-border/60 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">المبيعات اليومية</h3>
              <span className="text-xs text-muted-foreground">{range.from || '—'} إلى {range.to || '—'}</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendRows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <SmallList title="أفضل المنتجات ربحاً" rows={data?.topProductsByProfit ?? []}>
            <ProductTable rows={(data?.topProductsByProfit ?? []).slice(0, 5)} />
          </SmallList>
        </TabsContent>

        <TabsContent value="sales" className="mt-4 space-y-5">
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">أفضل المنتجات حسب الإيراد</h3><ProductTable rows={data?.topProductsByRevenue ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">أفضل المنتجات حسب الكمية</h3><ProductTable rows={data?.topProductsByQuantity ?? []} /></Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4 space-y-5">
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">أفضل المنتجات حسب مجمل الربح</h3><ProductTable rows={data?.topProductsByProfit ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">أفضل المنتجات منخفضة المخزون</h3><ProductTable rows={data?.lowStockBestSellers ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">المنتجات بطيئة الحركة</h3><ProductTable rows={data?.slowMovingProducts ?? []} /></Card>
          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">الأكثر ارتجاعاً</h3><ProductTable rows={data?.mostReturnedProducts ?? []} /></Card>
            <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">الأكثر شطباً / تلفاً</h3><ProductTable rows={data?.mostWrittenOffProducts ?? []} /></Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4 grid lg:grid-cols-2 gap-5">
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">منتجات منخفضة المخزون</h3><ProductTable rows={data?.inventoryAlerts.lowStockProducts ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">منتجات نفدت من المخزون</h3><ProductTable rows={data?.inventoryAlerts.outOfStockProducts ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">تكدس / بطء حركة</h3><ProductTable rows={data?.inventoryAlerts.overstockSlowMovingProducts ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">بطيئة الحركة عالية القيمة</h3><ProductTable rows={data?.inventoryAlerts.highValueSlowMovingProducts ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">شطب حديث</h3><ProductTable rows={data?.inventoryAlerts.productsWithRecentWriteOffs ?? []} /></Card>
          <Card className="p-5 border-border/60 shadow-soft"><h3 className="font-semibold mb-3">منتجات ذات معدل مرتجعات مرتفع</h3><ProductTable rows={data?.inventoryAlerts.productsWithHighReturnRate ?? []} /></Card>
        </TabsContent>

        <TabsContent value="receivables" className="mt-4 grid lg:grid-cols-2 gap-5">
          <SmallList title="أكبر العملاء المتأخرين" rows={data?.receivables.topOverdueCustomers ?? []}>
            <div className="space-y-2">{(data?.receivables.topOverdueCustomers ?? []).map((r) => <div key={r.id} className="flex justify-between gap-3 rounded-md bg-muted/30 p-3"><span>{r.name}</span><span className="font-semibold text-destructive whitespace-nowrap">{money(r.overdue_amount)}</span></div>)}</div>
          </SmallList>
          <SmallList title="تحصيلات قادمة" rows={data?.receivables.upcomingReceivables ?? []}>
            <div className="space-y-2">{(data?.receivables.upcomingReceivables ?? []).map((r) => <div key={r.id} className="flex justify-between gap-3 rounded-md bg-muted/30 p-3"><span>{r.customer_name} - {r.number}</span><span className="whitespace-nowrap">{formatDateShort(r.due_date ?? '')} · {money(r.remaining)}</span></div>)}</div>
          </SmallList>
          <SmallList title="أكبر الموردين المستحقين" rows={data?.payables.topSupplierPayables ?? []}>
            <div className="space-y-2">{(data?.payables.topSupplierPayables ?? []).map((r) => <div key={r.id} className="flex justify-between gap-3 rounded-md bg-muted/30 p-3"><span>{r.name}</span><span className="font-semibold text-warning whitespace-nowrap">{money(r.payable_amount)}</span></div>)}</div>
          </SmallList>
          <SmallList title="مدفوعات موردين قادمة" rows={data?.payables.upcomingSupplierPayments ?? []}>
            <div className="space-y-2">{(data?.payables.upcomingSupplierPayments ?? []).map((r) => <div key={r.id} className="flex justify-between gap-3 rounded-md bg-muted/30 p-3"><span>{r.supplier_name} - {r.number}</span><span className="whitespace-nowrap">{formatDateShort(r.due_date ?? '')} · {money(r.remaining)}</span></div>)}</div>
          </SmallList>
        </TabsContent>

        {canSeeAccounting && (
          <TabsContent value="accounting" className="mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <StatCard title="قيود مسودة" value={data?.accountingHealth.draft_journals ?? 0} icon={FileText} accent="warning" />
              <StatCard title="قيود غير متوازنة" value={data?.accountingHealth.unbalanced_journals ?? 0} icon={AlertTriangle} accent={(data?.accountingHealth.unbalanced_journals ?? 0) === 0 ? 'success' : 'destructive'} />
              <StatCard title="فواتير غير مرحلة" value={data?.accountingHealth.unposted_invoices ?? 0} icon={Receipt} accent="warning" />
              <StatCard title="تحصيلات غير مرحلة" value={data?.accountingHealth.unposted_payments ?? 0} icon={CreditCard} accent="warning" />
              <StatCard title="مشتريات غير مرحلة" value={data?.accountingHealth.unposted_purchases ?? 0} icon={ShoppingCart} accent="warning" />
              <StatCard title="فترات مفتوحة" value={data?.accountingHealth.open_periods ?? 0} icon={Scale} accent="info" />
              <StatCard title="فترات مقفلة" value={data?.accountingHealth.locked_periods ?? 0} icon={ShieldCheck} accent="success" />
              <StatCard title="إعدادات ناقصة" value={data?.accountingHealth.incomplete_settings_count ?? 0} icon={AlertTriangle} accent={(data?.accountingHealth.incomplete_settings_count ?? 0) === 0 ? 'success' : 'destructive'} />
            </div>
            {(data?.accountingHealth.missing_settings.length ?? 0) > 0 && (
              <Card className="mt-5 p-5 border-warning/40 bg-warning/5">
                <h3 className="font-semibold mb-2">إعدادات محاسبية تحتاج استكمال</h3>
                <p className="text-sm text-muted-foreground">{data?.accountingHealth.missing_settings.join('، ')}</p>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Overview;
