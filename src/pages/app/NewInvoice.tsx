import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { InvoiceSummary } from '@/components/common/InvoiceSummary';
import { useClients, useProducts } from '@/hooks/entities';
import { api, ApiError, isApiConfigured } from '@/lib/api';

interface Item { id: string; name: string; quantity: number; unitPrice: number; productId?: string }

const NewInvoice = () => {
  const navigate = useNavigate();
  const { list: clients } = useClients();
  const { list: products } = useProducts();
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState<Item[]>([{ id: 'i1', name: '', quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState(15);
  const [discount, setDiscount] = useState(0);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10));
  const [saving, setSaving] = useState(false);

  // Default client when list loads
  if (!clientId && clients[0]) setClientId(clients[0].id);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0);
    const tax = +(subtotal * (taxRate/100)).toFixed(2);
    const total = +(subtotal + tax - discount).toFixed(2);
    return { subtotal, tax, total };
  }, [items, taxRate, discount]);

  const addItem = () => setItems(prev => [...prev, { id: `i${Date.now()}`, name: '', quantity: 1, unitPrice: 0 }]);
  const update = (i: number, patch: Partial<Item>) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const pickProduct = (i: number, pid: string) => {
    const p = products.find(x => x.id === pid);
    if (p) update(i, { productId: pid, name: p.name, unitPrice: p.price });
  };

  const save = async () => {
    if (!clientId) return toast.error('اختر عميلاً');
    if (items.some(it => !it.name || it.quantity <= 0)) return toast.error('أكمل بيانات بنود الفاتورة');
    setSaving(true);
    try {
      if (isApiConfigured()) {
        const body = {
          client_id: clientId,
          due_date: new Date(dueDate).toISOString(),
          discount,
          items: items.map(it => ({
            product_id: it.productId ?? null,
            description: it.name,
            quantity: it.quantity,
            unit_price: it.unitPrice,
            vat_rate: taxRate,
          })),
        };
        const res = await api.post<{ data: { id: string } }>('/api/invoices', body);
        toast.success('تم حفظ الفاتورة');
        navigate(`/app/invoices/${res.data.id}`);
      } else {
        toast.success('تم حفظ الفاتورة (بيانات تجريبية)');
        navigate('/app/invoices');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر حفظ الفاتورة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="فاتورة جديدة" description="أنشئ فاتورة لعميلك" />

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5 space-y-5 border-border/60 shadow-soft">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>العميل</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر عميلاً" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ الاستحقاق</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">بنود الفاتورة</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-border/70 bg-card">
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">المنتج</Label>
                    <Select value={it.productId ?? ''} onValueChange={(v) => pickProduct(i, v)}>
                      <SelectTrigger><SelectValue placeholder="اختياري — اختر من المنتجات" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">الوصف</Label>
                    <Input value={it.name} onChange={e => update(i, { name: e.target.value })} placeholder="اسم المنتج/الخدمة" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs">الكمية</Label>
                    <Input type="number" min={1} value={it.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Label className="text-xs">سعر الوحدة</Label>
                    <Input type="number" min={0} value={it.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="col-span-12 text-end text-sm text-muted-foreground">
                    الإجمالي: <span className="font-semibold text-foreground">{formatCurrency(it.quantity * it.unitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>نسبة الضريبة (%)</Label>
              <Input type="number" min={0} value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="mt-1.5" />
            </div>
            <div>
              <Label>الخصم</Label>
              <Input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))} className="mt-1.5" />
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <InvoiceSummary subtotal={totals.subtotal} tax={totals.tax} discount={discount} total={totals.total} paid={0} remaining={totals.total} />
          <Card className="p-5 border-border/60 space-y-2">
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ الفاتورة'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default NewInvoice;
