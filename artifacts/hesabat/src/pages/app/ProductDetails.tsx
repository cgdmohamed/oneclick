import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Download, Package, Printer, Plus, ImageIcon, Tag, Layers, Truck,
  Barcode as BarcodeIcon, Percent, ArrowUpCircle, ArrowDownCircle, Clock, FileText,
  type LucideIcon,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, API_URL, getAuthHeaders, resolveAssetUrl } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { printElementOnly } from '@/lib/print';
import { toast } from 'sonner';

interface ProductDetailRow {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  image_url: string | null;
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
  journal_entry_id?: string | null;
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

  const timelineEntries = useMemo(() => [...(stockCard.data ?? [])].reverse(), [stockCard.data]);
  const lowStock = product?.product_type === 'stock' && Number(product.quantity) <= 0;

  if (!product && detail.isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل...</div>;

  return (
    <div className="space-y-5">
      <Link to="/app/products" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowRight className="h-4 w-4" /> العودة للمنتجات
      </Link>

      {product && (
        <Card className="p-5 border-border/60 shadow-soft">
          <div className="flex flex-wrap items-center gap-5">
            <div className="h-20 w-20 rounded-xl border border-border/60 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
              {product.image_url
                ? <img src={resolveAssetUrl(product.image_url)} alt={product.name} className="h-full w-full object-cover" />
                : <ImageIcon className="h-8 w-8 text-muted-foreground/50" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold truncate">{product.name}</h1>
                <Badge variant="secondary">{typeLabel(product.product_type)}</Badge>
                {lowStock && <Badge variant="destructive">نفدت الكمية</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-muted-foreground">
                {product.sku && <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> {product.sku}</span>}
                {product.barcode && <span className="inline-flex items-center gap-1.5"><BarcodeIcon className="h-3.5 w-3.5" /> {product.barcode}</span>}
                {(product.parent_category_name ?? product.category_name) && <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> {product.parent_category_name ?? product.category_name}</span>}
                {product.supplier_name && <span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> {product.supplier_name}</span>}
              </div>
            </div>
            {openingAllowed && <Button onClick={() => setOpeningOpen(true)}><Plus className="h-4 w-4 me-1" /> رصيد افتتاحي</Button>}
          </div>
        </Card>
      )}

      {product && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Package} accent="text-blue-600 bg-blue-600/10" label="الكمية الحالية" value={String(Number(product.quantity))} />
          <StatCard icon={ArrowUpCircle} accent="text-amber-600 bg-amber-600/10" label="متوسط التكلفة" value={formatCurrency(Number(product.average_cost ?? product.cost))} />
          <StatCard icon={Layers} accent="text-emerald-600 bg-emerald-600/10" label="قيمة المخزون" value={formatCurrency(Number(product.inventory_value ?? 0))} />
          <StatCard icon={Percent} accent="text-violet-600 bg-violet-600/10" label="الضريبة" value={vatLabel(product.vat_status, product.vat_rate)} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2">
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
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
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
              <Card className="p-4 border-border/60 no-print">
                <div className="grid sm:grid-cols-4 gap-3 items-end">
                  <div><Label>من</Label><Input className="mt-1.5" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                  <div><Label>إلى</Label><Input className="mt-1.5" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
                  <Button onClick={() => setApplied({ from, to })}>تطبيق</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={printElementOnly}><Printer className="h-4 w-4 me-1" /> طباعة</Button>
                    <Button variant="outline" onClick={exportStockCard}><Download className="h-4 w-4 me-1" /> CSV</Button>
                  </div>
                </div>
              </Card>
              <div data-print-area className="print-area">
                <div className="hidden print:block mb-3">
                  <h1 className="text-xl font-bold">كارت الصنف — {product?.name}</h1>
                </div>
                <DataTable data={stockCard.data ?? []} columns={stockColumns} pageSize={25} emptyTitle="لا توجد حركات مخزون لهذا المنتج" />
              </div>
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
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
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
        </div>

        <Card className="p-5 border-border/60 lg:sticky lg:top-4">
          <div className="flex items-center gap-2 font-semibold mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" /> السجل الزمني
          </div>
          {timelineEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد سجل حركات بعد لهذا المنتج.</p>
          ) : (
            <div className="relative max-h-[560px] overflow-y-auto app-scrollbar ps-1">
              <div className="absolute top-1 bottom-1 start-[15px] w-px bg-border" />
              <div className="space-y-4">
                {timelineEntries.map((entry) => {
                  const qtyIn = Number(entry.quantity_in);
                  const qtyOut = Number(entry.quantity_out);
                  const isIn = qtyIn > 0;
                  const Icon = isIn ? ArrowUpCircle : ArrowDownCircle;
                  return (
                    <div key={entry.id} className="relative flex gap-3 ps-8">
                      <div className={`absolute start-0 top-0 h-8 w-8 rounded-full flex items-center justify-center ${isIn ? 'text-emerald-600 bg-emerald-600/10' : 'text-rose-600 bg-rose-600/10'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{sourceLabel(entry.source_type)}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateShort(entry.movement_date)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {entry.source_reference ?? entry.journal_entry_number ?? '—'}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className={isIn ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                            {isIn ? `+${qtyIn}` : `-${qtyOut}`}
                          </span>
                          <span className="text-muted-foreground">الرصيد بعدها: {Number(entry.balance_quantity)}</span>
                        </div>
                        {entry.journal_entry_id && (
                          <Link to={`/app/accounting/journals/${entry.journal_entry_id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                            <FileText className="h-3 w-3" /> عرض القيد
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

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

const StatCard = ({ icon: Icon, accent, label, value }: { icon: LucideIcon; accent: string; label: string; value: string }) => (
  <Card className="p-4 border-border/60">
    <div className="flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold mt-0.5 tabular-nums whitespace-nowrap">{value}</div>
      </div>
    </div>
  </Card>
);

const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 text-start">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-medium mt-1 tabular-nums break-words">{value}</div>
  </div>
);

export default ProductDetails;
