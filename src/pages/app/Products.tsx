import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, AlertTriangle, ImageIcon, Loader2, Package, Tags, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { products as initial, stockMovements } from '@/data/mock';
import type { Product } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { useResource } from '@/hooks/useResource';
import { useInvoices } from '@/hooks/entities';
import { api, isApiConfigured, resolveAssetUrl } from '@/lib/api';

interface ProductRow {
  id: string;
  company_id: string;
  sku: string | null;
  name: string;
  price: string | number;
  cost: string | number;
  quantity: number;
  alert_level: number;
  image_url: string | null;
  is_active: boolean;
}

const empty: Product = { id: '', companyId: 'co-1', name: '', code: '', category: '', price: 0, quantity: 0, alertLevel: 5, status: 'active' };

const Products = () => {
  const { list, save, remove } = useResource<Product, ProductRow>({
    path: '/api/products',
    key: 'products',
    initial,
    fromRow: (r) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      code: r.sku ?? '',
      price: Number(r.price),
      quantity: r.quantity,
      alertLevel: r.alert_level,
      imageUrl: r.image_url ?? undefined,
      status: r.is_active ? 'active' : 'inactive',
    }),
    toRow: (p) => ({
      name: p.name,
      sku: p.code || null,
      price: p.price,
      quantity: p.quantity,
      alert_level: p.alertLevel,
      image_url: p.imageUrl ?? null,
      is_active: p.status !== 'inactive',
    }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product>(empty);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const { list: invoices } = useInvoices();

  const submit = async () => {
    if (!editing.name || !editing.code) return toast.error('أكمل بيانات المنتج');
    await save(editing);
    setOpen(false);
  };

  const usageCount = (p: Product) => {
    const inMovements = stockMovements.filter(m => m.productId === p.id).length;
    const inInvoices = invoices.reduce(
      (n, inv) => n + inv.items.filter(it => it.productId === p.id).length, 0,
    );
    return inMovements + inInvoices;
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    if (usageCount(toDelete) > 0) {
      toast.error('لا يمكن حذف المنتج لأنه مستخدم في فواتير أو حركات مخزون');
      setToDelete(null);
      return;
    }
    await remove(toDelete.id);
    setToDelete(null);
  };

  const columns: Column<Product>[] = [
    { key: 'image', header: '', cell: r => (
      <div className="h-10 w-10 rounded-lg border border-border/60 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
        {r.imageUrl
          ? <img src={resolveAssetUrl(r.imageUrl)} alt={r.name} className="h-full w-full object-cover" />
          : <Package className="h-4 w-4 text-muted-foreground/60" />}
      </div>
    ), className: 'w-14' },
    { key: 'name', header: 'المنتج', cell: r => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{r.name}</span>
        {r.quantity <= r.alertLevel && <AlertTriangle className="h-4 w-4 text-warning" />}
      </div>
    )},
    { key: 'code', header: 'الكود', cell: r => <span className="text-muted-foreground text-sm">{r.code}</span> },
    { key: 'category', header: 'التصنيف', cell: r => <span className="text-muted-foreground text-sm">{r.category || '—'}</span> },
    { key: 'price', header: 'السعر', cell: r => formatCurrency(r.price) },
    { key: 'qty', header: 'الكمية', cell: r => <span className={r.quantity <= r.alertLevel ? 'text-destructive font-semibold' : ''}>{r.quantity}</span> },
    { key: 'alert', header: 'حد التنبيه', cell: r => r.alertLevel },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} /> },
    { key: 'actions', header: '', cell: r => {
      const used = usageCount(r) > 0;
      return (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={used}
            title={used ? 'مستخدم في فواتير أو حركات مخزون' : 'حذف'}
            onClick={() => setToDelete(r)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    }},
  ];

  const lowStock = list.filter(p => p.quantity <= p.alertLevel);

  return (
    <div>
      <PageHeader title="المنتجات والمخزون" description="إدارة المنتجات وحركة المخزون"
        actions={<Button onClick={() => { setEditing({ ...empty, id: `pr-${Date.now()}` }); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> منتج جديد</Button>} />

      {lowStock.length > 0 && (
        <Card className="p-4 mb-5 border-warning/40 bg-warning/5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">{lowStock.length}</span> منتج وصل لحد التنبيه — يُنصح بإعادة التزويد.
          </div>
        </Card>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="movements">حركة المخزون</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4 space-y-6">
          {Array.from(new Set(list.map(p => p.category || 'غير مصنف'))).sort().map(cat => {
            const items = list.filter(p => (p.category || 'غير مصنف') === cat);
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold">{cat}</h3>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                <DataTable data={items} columns={columns} searchKeys={['name','code']} searchPlaceholder="ابحث بالمنتج أو الكود..." />
              </div>
            );
          })}
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <DataTable
            data={stockMovements}
            columns={[
              { key: 'date', header: 'التاريخ', cell: r => formatDateShort(r.date) },
              { key: 'product', header: 'المنتج', cell: r => list.find(p => p.id === r.productId)?.name ?? '—' },
              { key: 'type', header: 'النوع', cell: r => <StatusBadge status={r.type === 'in' ? 'active' : 'expired'} label={r.type === 'in' ? 'إدخال' : 'إخراج'} /> },
              { key: 'qty', header: 'الكمية', cell: r => r.quantity },
              { key: 'reason', header: 'السبب', cell: r => <span className="text-sm text-muted-foreground">{r.reason}</span> },
            ]}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>منتج</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <ProductImageField
              value={editing.imageUrl}
              onChange={(url) => setEditing(s => ({ ...s, imageUrl: url }))}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>اسم المنتج</Label><Input className="mt-1.5" value={editing.name} onChange={e => setEditing(s => ({ ...s, name: e.target.value }))} /></div>
              <div><Label>الكود</Label><Input className="mt-1.5" value={editing.code} onChange={e => setEditing(s => ({ ...s, code: e.target.value }))} /></div>
              <div className="sm:col-span-2"><Label>التصنيف</Label><Input className="mt-1.5" placeholder="مثال: إلكترونيات" value={editing.category ?? ''} onChange={e => setEditing(s => ({ ...s, category: e.target.value }))} /></div>
              <div><Label>السعر</Label><Input type="number" className="mt-1.5" value={editing.price} onChange={e => setEditing(s => ({ ...s, price: Number(e.target.value) }))} /></div>
              <div><Label>الكمية</Label><Input type="number" className="mt-1.5" value={editing.quantity} onChange={e => setEditing(s => ({ ...s, quantity: Number(e.target.value) }))} /></div>
              <div><Label>حد التنبيه</Label><Input type="number" className="mt-1.5" value={editing.alertLevel} onChange={e => setEditing(s => ({ ...s, alertLevel: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المنتج</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف "{toDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const ProductImageField = ({ value, onChange }: { value?: string; onChange: (url: string | undefined) => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const preview = resolveAssetUrl(value);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('يجب اختيار صورة');
    if (file.size > 2 * 1024 * 1024) return toast.error('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت');
    if (isApiConfigured()) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', 'attachment');
        const res = await api.upload<{ data: { url: string } }>('/api/uploads', form);
        onChange(res.data.url);
      } catch {
        toast.error('تعذّر رفع الصورة');
      } finally { setUploading(false); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <Label>صورة المنتج</Label>
      <div className="mt-1.5 flex items-start gap-3">
        <div className="h-20 w-20 rounded-lg border border-dashed border-border/70 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : preview ? <img src={preview} alt="" className="h-full w-full object-cover" />
            : <ImageIcon className="h-6 w-6 text-muted-foreground/60" />}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">PNG / JPG حتى 2 ميجا. تظهر في قائمة المنتجات والفواتير.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? 'جارٍ الرفع…' : value ? 'تغيير الصورة' : 'رفع صورة'}
            </Button>
            {value && !uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>إزالة</Button>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
};

export default Products;
