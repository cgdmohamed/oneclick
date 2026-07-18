import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Package, Printer, Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, API_URL, getAuthHeaders } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';

interface ProductDetailRow {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  product_type: 'stock' | 'service' | 'non_stock' | 'expense';
  price: string | number;
  cost: string | number;
  quantity: string | number;
  average_cost: string | number;
  inventory_value: string | number;
  vat_status: 'taxable' | 'exempt' | 'zero_rated';
  vat_rate: string | number;
  category_name: string | null;
  parent_category_name: string | null;
  subcategory_name: string | null;
  supplier_name: string | null;
  sales_account_code: string | null;
  sales_account_name: string | null;
  inventory_account_code: string | null;
  inventory_account_name: string | null;
  cogs_account_code: string | null;
  cogs_account_name: string | null;
  has_stock_ledger: boolean;
  has_opening_stock: boolean;
}

interface StockLedgerRow {
  id: string;
  movement_date: string;
  source_type: string;
  source_reference: string | null;
  quantity_in: string | number;
  quantity_out: string | number;
  unit_cost: string | number;
  total_value: string | number;
  balance_quantity: string | number;
  balance_value: string | number;
  journal_entry_number?: string | null;
}

interface ActivityRow {
  id: string;
  number: string;
  issue_date?: string;
  invoice_date?: string;
  date?: string;
  quantity: string | number;
  unit_price?: string | number;
  unit_cost?: string | number;
  unit_amount?: string | number;
  line_total: string | number;
  status: string;
  client_name?: string | null;
  supplier_name?: string | null;
  type?: string;
  return_condition?: string | null;
  return_to_stock?: boolean | null;
}

interface ProductDetailPayload {
  product: ProductDetailRow;
  sales: ActivityRow[];
  purchases: ActivityRow[];
  returns: ActivityRow[];
}

const typeLabel = (type: string) => type === 'service' ? 'خدمة' : type === 'non_stock' ? 'غير مخزني' : type === 'expense' ? 'مصروف' : 'مخزني';
const vatLabel = (status: string, rate: string | number) => status === 'taxable' ? `${Number(rate)}%` : status === 'exempt' ? 'معفى' : 'صفرية';
const accountLabel = (code?: string | null, name?: string | null) => code || name ? `${code ?? ''}${code && name ? ' - ' : ''}${name ?? ''}` : '—';
const sourceLabel = (source: string) => ({
  opening_stock: 'رصيد افتتاحي',
  purchase_invoice: 'فاتورة شراء',
  invoice: 'فاتورة بيع',
  purchase_return: 'مرتجع شراء',
  purchase_return_cancel: 'إلغاء مرتجع شراء',
  credit_note: 'إشعار دائن',
  credit_note_cancel: 'إلغاء إشعار دائن',
  stock_movement: 'حركة مخزون',
  write_off: 'شطب / هالك مخزون',
  write_off_cancel: 'إلغاء شطب مخزون',
}[source] ?? source);
const returnConditionLabel = (value?: string | null) => ({
  resellable: 'صالح للبيع',
  damaged: 'تالف',
  inspection: 'تحت الفحص',
  scrap: 'خردة',
}[value ?? ''] ?? value ?? '—');

const ProductDetails = () => {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [openingOpen, setOpeningOpen] = useState(false);
  const [opening, setOpening] = useState({
    opening_quantity: '0',
    opening_unit_cost: '0',
    opening_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const detail = useQuery({
    queryKey: ['product-detail', id],
    queryFn: async () => (await api.get<{ data: ProductDetailPayload }>(`/api/products/${id}/detail`)).data,
  });
  const stockCard = useQuery({
    queryKey: ['product-stock-card', id, applied.from, applied.to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set('from', applied.from);
      if (applied.to) params.set('to', applied.to);
      return (await api.get<{ data: StockLedgerRow[] }>(`/api/products/${id}/stock-card?${params}`)).data ?? [];
    },
  });

  const openingMutation = useMutation({
    mutationFn: async () => api.post(`/api/products/${id}/opening-stock`, {
      opening_quantity: Number(opening.opening_quantity),
      opening_unit_cost: Number(opening.opening_unit_cost),
      opening_date: new Date(opening.opening_date).toISOString(),
      notes: opening.notes || null,
    }),
    onSuccess: async () => {
      toast.success('تم تسجيل الرصيد الافتتاحي');
      setOpeningOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['product-detail', id] }),
        qc.invalidateQueries({ queryKey: ['product-stock-card', id] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'تعذّر تسجيل الرصيد الافتتاحي'),
  });

  const product = detail.data?.product;
  const openingAllowed = product?.product_type === 'stock' && !product.has_stock_ledger && !product.has_opening_stock;

  const stockColumns = useMemo<Column<StockLedgerRow>[]>(() => [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.movement_date) },
    { key: 'source', header: 'المصدر', cell: (r) => sourceLabel(r.source_type) },
    { key: 'ref', header: 'المرجع', cell: (r) => r.source_reference ?? r.journal_entry_number ?? '—' },
    { key: 'in', header: 'وارد', cell: (r) => Number(r.quantity_in), className: 'text-end' },
    { key: 'out', header: 'صادر', cell: (r) => Number(r.quantity_out), className: 'text-end' },
    { key: 'cost', header: 'تكلفة الوحدة', cell: (r) => formatCurrency(Number(r.unit_cost)), className: 'text-end' },
    { key: 'value', header: 'القيمة', cell: (r) => formatCurrency(Number(r.total_value)), className: 'text-end' },
    { key: 'bal_qty', header: 'رصيد الكمية', cell: (r) => Number(r.balance_quantity), className: 'text-end' },
    { key: 'bal_value', header: 'رصيد القيمة', cell: (r) => formatCurrency(Number(r.balance_value)), className: 'text-end' },
  ], []);

  const activityColumns = (party: 'client' | 'supplier'): Column<ActivityRow>[] => [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.issue_date ?? r.invoice_date ?? r.date ?? '') },
    { key: 'number', header: 'الرقم', cell: (r) => r.number },
    { key: 'party', header: party === 'client' ? 'العميل' : 'المورد', cell: (r) => party === 'client' ? r.client_name ?? '—' : r.supplier_name ?? '—' },
    { key: 'qty', header: 'الكمية', cell: (r) => Number(r.quantity), className: 'text-end' },
    { key: 'unit', header: 'سعر/تكلفة الوحدة', cell: (r) => formatCurrency(Number(r.unit_price ?? r.unit_cost ?? r.unit_amount ?? 0)), className: 'text-end' },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.line_total)), className: 'text-end' },
    { key: 'status', header: 'الحالة', cell: (r) => r.status },
  ];

  const exportStockCard = async () => {
    const params = new URLSearchParams();
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    const res = await fetch(`${API_URL}/api/products/${id}/stock-card/export?${params}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) return toast.error('تعذّر تصدير كارت الصنف');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'product-stock-card.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  if (!product && detail.isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل...</div>;

  return (
    <div className="space-y-5">
      <Link to="/app/products" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowRight className="h-4 w-4" /> العودة للمنتجات
      </Link>
      <PageHeader
        title={product?.name ?? 'تفاصيل المنتج'}
        description={product?.sku ? `SKU: ${product.sku}` : undefined}
        actions={openingAllowed ? <Button onClick={() => setOpeningOpen(true)}><Plus className="h-4 w-4 me-1" /> رصيد افتتاحي</Button> : undefined}
      />

      {product && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 text-start"><div className="text-xs text-muted-foreground">الكمية الحالية</div><div className="text-2xl font-bold mt-1 tabular-nums whitespace-nowrap">{Number(product.quantity)}</div></Card>
          <Card className="p-4 text-start"><div className="text-xs text-muted-foreground">متوسط التكلفة</div><div className="text-2xl font-bold mt-1 tabular-nums whitespace-nowrap">{formatCurrency(Number(product.average_cost ?? product.cost))}</div></Card>
          <Card className="p-4 text-start"><div className="text-xs text-muted-foreground">قيمة المخزون</div><div className="text-2xl font-bold mt-1 tabular-nums whitespace-nowrap">{formatCurrency(Number(product.inventory_value ?? 0))}</div></Card>
          <Card className="p-4 text-start"><div className="text-xs text-muted-foreground">الضريبة</div><div className="text-2xl font-bold mt-1 tabular-nums whitespace-nowrap">{vatLabel(product.vat_status, product.vat_rate)}</div></Card>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="stock">كارت الصنف</TabsTrigger>
          <TabsTrigger value="sales">المبيعات</TabsTrigger>
          <TabsTrigger value="purchases">المشتريات</TabsTrigger>
          <TabsTrigger value="returns">المرتجعات</TabsTrigger>
          <TabsTrigger value="accounting">المحاسبة</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-5 border-border/60">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <Info label="النوع" value={product ? typeLabel(product.product_type) : '—'} />
              <Info label="التصنيف" value={product?.parent_category_name ?? product?.category_name ?? '—'} />
              <Info label="التصنيف الفرعي" value={product?.subcategory_name ?? '—'} />
              <Info label="المورد" value={product?.supplier_name ?? '—'} />
              <Info label="الباركود" value={product?.barcode ?? '—'} />
              <Info label="سعر البيع" value={formatCurrency(Number(product?.price ?? 0))} />
              <Info label="الوصف" value={product?.description ?? '—'} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-4">
          <Card className="p-4 border-border/60">
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <div><Label>من</Label><Input className="mt-1.5" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>إلى</Label><Input className="mt-1.5" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <Button onClick={() => setApplied({ from, to })}>تطبيق</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 me-1" /> طباعة</Button>
                <Button variant="outline" onClick={exportStockCard}><Download className="h-4 w-4 me-1" /> CSV</Button>
              </div>
            </div>
          </Card>
          <DataTable data={stockCard.data ?? []} columns={stockColumns} pageSize={25} emptyTitle="لا توجد حركات مخزون لهذا المنتج" />
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <DataTable data={detail.data?.sales ?? []} columns={activityColumns('client')} emptyTitle="لا توجد مبيعات لهذا المنتج" />
        </TabsContent>
        <TabsContent value="purchases" className="mt-4">
          <DataTable data={detail.data?.purchases ?? []} columns={activityColumns('supplier')} emptyTitle="لا توجد مشتريات لهذا المنتج" />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <DataTable data={detail.data?.returns ?? []} columns={[
            { key: 'type', header: 'النوع', cell: (r) => r.type === 'credit_note' ? 'مرتجع بيع' : 'مرتجع شراء' },
            { key: 'condition', header: 'حالة المرتجع', cell: (r) => r.type === 'credit_note' ? returnConditionLabel(r.return_condition) : '—' },
            { key: 'stock', header: 'عاد للمخزون', cell: (r) => r.type === 'credit_note' ? (r.return_to_stock ? 'نعم' : 'لا') : '—' },
            ...activityColumns('supplier'),
          ]} emptyTitle="لا توجد مرتجعات لهذا المنتج" />
        </TabsContent>
        <TabsContent value="accounting" className="mt-4">
          <Card className="p-5 border-border/60">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <Info label="حساب المبيعات" value={accountLabel(product?.sales_account_code, product?.sales_account_name)} />
              <Info label="حساب المخزون" value={accountLabel(product?.inventory_account_code, product?.inventory_account_name)} />
              <Info label="حساب تكلفة البضاعة" value={accountLabel(product?.cogs_account_code, product?.cogs_account_name)} />
              <Info label="الضريبة" value={product ? vatLabel(product.vat_status, product.vat_rate) : '—'} />
              <Info label="الكمية الحالية" value={String(Number(product?.quantity ?? 0))} />
              <Info label="قيمة المخزون" value={formatCurrency(Number(product?.inventory_value ?? 0))} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> رصيد افتتاحي</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>الكمية الافتتاحية</Label><Input className="mt-1.5" type="number" min={0} value={opening.opening_quantity} onChange={(e) => setOpening(s => ({ ...s, opening_quantity: e.target.value }))} /></div>
            <div><Label>تكلفة الوحدة</Label><Input className="mt-1.5" type="number" min={0} step="0.01" value={opening.opening_unit_cost} onChange={(e) => setOpening(s => ({ ...s, opening_unit_cost: e.target.value }))} /></div>
            <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={opening.opening_date} onChange={(e) => setOpening(s => ({ ...s, opening_date: e.target.value }))} /></div>
            <div><Label>ملاحظات</Label><Textarea className="mt-1.5" rows={2} value={opening.notes} onChange={(e) => setOpening(s => ({ ...s, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningOpen(false)}>إلغاء</Button>
            <Button onClick={() => openingMutation.mutate()} disabled={openingMutation.isPending}>{openingMutation.isPending ? 'جارٍ الترحيل...' : 'ترحيل'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 text-start">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-medium mt-1 tabular-nums break-words">{value}</div>
  </div>
);

export default ProductDetails;
