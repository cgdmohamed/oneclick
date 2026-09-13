import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseInvoice, PurchaseReturn } from './types';

interface Supplier { id: string; name: string }
interface Product {
  id: string;
  name: string;
  cost?: string | number;
  average_cost?: string | number;
  vat_status?: 'taxable' | 'exempt' | 'zero_rated';
  vat_rate?: string | number | null;
}
interface ItemForm { product_id: string; quantity: string; unit_cost: string; vat_rate: string }

const blankItem = (): ItemForm => ({ product_id: '', quantity: '1', unit_cost: '', vat_rate: '15' });

const NewPurchaseReturn = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [returnNumber, setReturnNumber] = useState(`PR-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState(true);
  const [items, setItems] = useState<ItemForm[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get<{ data: Supplier[] }>('/api/suppliers?page_size=300')).data ?? [] });
  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<{ data: Product[] }>('/api/products?page_size=300')).data ?? [] });
  const invoices = useQuery({ queryKey: ['purchase-invoices'], queryFn: async () => (await api.get<{ data: PurchaseInvoice[] }>('/api/purchases/invoices?page_size=300')).data ?? [] });
  const linkedInvoice = useQuery({
    enabled: Boolean(invoiceId),
    queryKey: ['purchase-invoice', invoiceId],
    queryFn: async () => (await api.get<{ data: PurchaseInvoice }>(`/api/purchases/invoices/${invoiceId}`)).data,
  });
  const supplierInvoices = (invoices.data ?? []).filter((inv) => !supplierId || inv.supplier_id === supplierId);
  const productName = (id: string) => (products.data ?? []).find((p) => p.id === id)?.name ?? 'منتج';
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
    const vat = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0) * (Number(item.vat_rate || 0) / 100), 0);
    return { subtotal, vat, total: subtotal + vat };
  }, [items]);
  const updateItem = (idx: number, patch: Partial<ItemForm>) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  const fillFromInvoice = () => {
    const invoice = linkedInvoice.data;
    if (!invoice?.items?.length) return;
    setSupplierId(invoice.supplier_id);
    setItems(invoice.items.filter((item) => item.product_id).map((item) => ({
      product_id: item.product_id ?? '',
      quantity: String(item.quantity),
      unit_cost: String(item.unit_cost),
      vat_rate: String(item.vat_rate),
    })));
  };
  const submit = async () => {
    if (!supplierId) return toast.error('اختر المورد');
    if (!returnNumber.trim()) return toast.error('أدخل رقم المرتجع');
    const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0 && Number(i.unit_cost) >= 0);
    if (!validItems.length) return toast.error('أضف منتجاً واحداً على الأقل');
    setSaving(true);
    try {
      const res = await api.post<{ data: PurchaseReturn }>('/api/purchases/returns', {
        supplier_id: supplierId,
        original_purchase_invoice_id: invoiceId || null,
        return_number: returnNumber,
        return_date: new Date(returnDate).toISOString(),
        notes: notes || null,
        draft,
        items: validItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          vat_rate: Number(item.vat_rate || 0),
        })),
      });
      await qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      await qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
      toast.success(draft ? 'تم حفظ مسودة المرتجع' : 'تم ترحيل مرتجع الشراء');
      navigate(`/app/purchases/returns/${res.data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ مرتجع الشراء');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <Link to="/app/purchases/returns" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للمرتجعات</Link>
      <PageHeader title="مرتجع شراء جديد" description="يرحل المرتجع بتخفيض المخزون والذمم الدائنة وضريبة المدخلات" />
      <Card className="p-4 border-border/60">
        <div className="grid lg:grid-cols-4 gap-4">
          <div><Label>المورد</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setInvoiceId(''); }}><option value="">اختر المورد</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><Label>فاتورة الشراء الأصلية</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">بدون ربط</option>{supplierInvoices.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}</select></div>
          <div><Label>رقم المرتجع</Label><Input className="mt-1.5" value={returnNumber} onChange={(e) => setReturnNumber(e.target.value)} /></div>
          <div><Label>الحالة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft ? 'draft' : 'posted'} onChange={(e) => setDraft(e.target.value === 'draft')}><option value="draft">مسودة</option><option value="posted">ترحيل مباشر</option></select></div>
          <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} /></div>
          {invoiceId && <div className="flex items-end"><Button type="button" variant="outline" onClick={fillFromInvoice}>تعبئة من الفاتورة</Button></div>}
        </div>
        <div className="mt-4"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      </Card>
      <Card className="p-4 border-border/60 space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid xl:grid-cols-[1.6fr_0.8fr_0.9fr_0.7fr_auto] gap-2 items-end">
            <div><Label>المنتج</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={item.product_id} onChange={(e) => {
              const p = (products.data ?? []).find((prod) => prod.id === e.target.value);
              updateItem(idx, {
                product_id: e.target.value,
                unit_cost: String(p?.cost ?? p?.average_cost ?? item.unit_cost),
                vat_rate: String(p ? (p.vat_status === 'taxable' ? Number(p.vat_rate ?? item.vat_rate) : 0) : item.vat_rate),
              });
            }}><option value="">اختر منتجاً</option>{(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><Label>الكمية</Label><Input className="mt-1.5" type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></div>
            <div><Label>تكلفة الوحدة</Label><Input className="mt-1.5" type="number" value={item.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: e.target.value })} /></div>
            <div><Label>VAT %</Label><Input className="mt-1.5" type="number" value={item.vat_rate} onChange={(e) => updateItem(idx, { vat_rate: e.target.value })} /></div>
            <Button variant="ghost" size="icon" className="text-destructive" title={productName(item.product_id)} onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setItems((prev) => [...prev, blankItem()])}><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
      </Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">قبل الضريبة: {formatCurrency(totals.subtotal)} · الضريبة: {formatCurrency(totals.vat)} · الإجمالي: <span className="font-semibold text-foreground">{formatCurrency(totals.total)}</span></div>
        <Button onClick={submit} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ مرتجع الشراء'}</Button>
      </div>
    </div>
  );
};

export default NewPurchaseReturn;
