import { useRef, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, AlertTriangle, ImageIcon, Loader2, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { products as initial, stockMovements } from '@/data/mock';
import type { Product } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { useResource } from '@/hooks/useResource';
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

const empty: Product = { id: '', companyId: 'co-1', name: '', code: '', price: 0, quantity: 0, alertLevel: 5, status: 'active' };

const Products = () => {
  const { list, save } = useResource<Product, ProductRow>({
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

  const submit = async () => {
    if (!editing.name || !editing.code) return toast.error('أكمل بيانات المنتج');
    await save(editing);
    setOpen(false);
  };

  const columns: Column<Product>[] = [
    { key: 'name', header: 'المنتج', cell: r => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{r.name}</span>
        {r.quantity <= r.alertLevel && <AlertTriangle className="h-4 w-4 text-warning" />}
      </div>
    )},
    { key: 'code', header: 'الكود', cell: r => <span className="text-muted-foreground text-sm">{r.code}</span> },
    { key: 'price', header: 'السعر', cell: r => formatCurrency(r.price) },
    { key: 'qty', header: 'الكمية', cell: r => <span className={r.quantity <= r.alertLevel ? 'text-destructive font-semibold' : ''}>{r.quantity}</span> },
    { key: 'alert', header: 'حد التنبيه', cell: r => r.alertLevel },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} /> },
    { key: 'actions', header: '', cell: r => (
      <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
    )},
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
        <TabsContent value="products" className="mt-4">
          <DataTable data={list} columns={columns} searchKeys={['name','code']} searchPlaceholder="ابحث بالمنتج أو الكود..." />
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
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>اسم المنتج</Label><Input className="mt-1.5" value={editing.name} onChange={e => setEditing(s => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>الكود</Label><Input className="mt-1.5" value={editing.code} onChange={e => setEditing(s => ({ ...s, code: e.target.value }))} /></div>
            <div><Label>السعر</Label><Input type="number" className="mt-1.5" value={editing.price} onChange={e => setEditing(s => ({ ...s, price: Number(e.target.value) }))} /></div>
            <div><Label>الكمية</Label><Input type="number" className="mt-1.5" value={editing.quantity} onChange={e => setEditing(s => ({ ...s, quantity: Number(e.target.value) }))} /></div>
            <div><Label>حد التنبيه</Label><Input type="number" className="mt-1.5" value={editing.alertLevel} onChange={e => setEditing(s => ({ ...s, alertLevel: Number(e.target.value) }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
