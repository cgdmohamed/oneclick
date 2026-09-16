import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DebitNote } from './types';

interface Customer { id: string; name: string }
interface Product {
  id: string;
  name: string;
  price: string | number;
  vat_status?: 'taxable' | 'exempt' | 'zero_rated';
  vat_rate?: string | number | null;
}
interface InvoiceRow { id: string; client_id: string; number: string; status: string }
interface InvoiceItem { id: string; product_id: string | null; description: string; quantity: string | number; unit_price: string | number; vat_rate?: string | number }
interface InvoiceDetails extends InvoiceRow { items: InvoiceItem[] }
interface ItemForm {
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
  original_invoice_item_id?: string | null;
}

const blankItem = (): ItemForm => ({ product_id: '', description: '', quantity: '1', unit_price: '', vat_rate: '15', original_invoice_item_id: null });

const NewDebitNote = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const invoiceParam = params.get('invoice');
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState(invoiceParam ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'draft' | 'posted'>('draft');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemForm[]>([blankItem()]);

  const customers = useQuery({ queryKey: ['clients'], queryFn: async () => (await api.get<{ data: Customer[] }>('/api/clients?page_size=300')).data ?? [] });
  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<{ data: Product[] }>('/api/products?page_size=300')).data ?? [] });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: async () => (await api.get<{ data: InvoiceRow[] }>('/api/invoices?page_size=300')).data ?? [] });
  const selectedInvoice = useQuery({
    enabled: !!invoiceId,
    queryKey: ['invoice', invoiceId],
    queryFn: async () => (await api.get<{ data: InvoiceDetails }>(`/api/invoices/${invoiceId}`)).data,
  });

  useEffect(() => {
    if (selectedInvoice.data?.client_id) setCustomerId(selectedInvoice.data.client_id);
  }, [selectedInvoice.data?.client_id]);

  const customerInvoices = (invoices.data ?? []).filter((invoice) => !customerId || invoice.client_id === customerId);
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
    const vat = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0) * (Number(item.vat_rate || 0) / 100), 0);
    return { subtotal, vat, total: subtotal + vat };
  }, [items]);

  const updateItem = (idx: number, patch: Partial<ItemForm>) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  const pickProduct = (idx: number, productId: string) => {
    if (productId === 'none') {
      updateItem(idx, { product_id: '' });
      return;
    }
    const product = (products.data ?? []).find((p) => p.id === productId);
    updateItem(idx, {
      product_id: productId,
      description: product?.name ?? items[idx]?.description ?? '',
      unit_price: product ? String(product.price ?? 0) : items[idx]?.unit_price ?? '',
      vat_rate: product ? String(product.vat_status === 'taxable' ? Number(product.vat_rate ?? 15) : 0) : items[idx]?.vat_rate ?? '15',
    });
  };

  const submit = async () => {
    try {
      const payload = {
        customer_id: customerId,
        original_invoice_id: invoiceId || null,
        debit_note_date: new Date(date).toISOString(),
        status,
        notes: notes || null,
        items: items.map((item) => ({
          product_id: item.product_id || null,
          description: item.description,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          vat_rate: Number(item.vat_rate || 0),
          original_invoice_item_id: item.original_invoice_item_id ?? null,
        })),
      };
      const res = await api.post<{ data: DebitNote }>('/api/debit-notes', payload);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['debit-notes'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
      toast.success(status === 'posted' ? 'تم إنشاء وترحيل الإشعار المدين' : 'تم حفظ الإشعار المدين كمسودة');
      navigate(`/app/debit-notes/${res.data.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر حفظ الإشعار المدين');
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/app/debit-notes" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للإشعارات المدينة</Link>
      <PageHeader title="إشعار مدين جديد" description="زيادة قيمة فاتورة سابقة ورفع رصيد العميل المستحق" actions={<Button onClick={submit}>حفظ</Button>} />
      <Card className="p-4 border-border/60 space-y-4">
        <div className="grid md:grid-cols-4 gap-4">
          <div><Label>العميل</Label><div className="mt-1.5"><SearchableSelect value={customerId} onValueChange={(v) => { setCustomerId(v); setInvoiceId(''); }} options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder="اختر العميل" searchPlaceholder="ابحث عن عميل..." /></div></div>
          <div><Label>الفاتورة الأصلية</Label><Select value={invoiceId || 'none'} onValueChange={(v) => setInvoiceId(v === 'none' ? '' : v)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بدون ربط</SelectItem>{customerInvoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.number}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>رقم الإشعار</Label><Input className="mt-1.5 text-muted-foreground" value="سيُحدَّد تلقائيًا بعد الحفظ" disabled /></div>
          <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>الحالة</Label><Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'posted')}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">مسودة</SelectItem><SelectItem value="posted">مرحل مباشرة</SelectItem></SelectContent></Select></div>
          <div className="md:col-span-3"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </Card>
      <Card className="p-4 border-border/60 space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid md:grid-cols-6 gap-3 items-end">
            <div><Label>المنتج</Label><div className="mt-1.5"><SearchableSelect value={item.product_id || 'none'} onValueChange={(v) => pickProduct(idx, v)} options={[{ value: 'none', label: 'بدون منتج' }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} searchPlaceholder="ابحث عن منتج..." /></div></div>
            <div className="md:col-span-2"><Label>الوصف</Label><Input className="mt-1.5" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} /></div>
            <div><Label>الكمية</Label><Input className="mt-1.5" type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></div>
            <div><Label>سعر الوحدة</Label><Input className="mt-1.5" type="number" value={item.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} /></div>
            <div className="flex gap-2 items-end">
              <div className="flex-1"><Label>نسبة الضريبة %</Label><Input className="mt-1.5" type="number" value={item.vat_rate} onChange={(e) => updateItem(idx, { vat_rate: e.target.value })} /></div>
              <Button variant="ghost" size="icon" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={() => setItems((prev) => [...prev, blankItem()])}><Plus className="h-4 w-4 ml-1" /> سطر جديد</Button>
        <div className="text-sm text-muted-foreground">قبل الضريبة: {formatCurrency(totals.subtotal)} · الضريبة: {formatCurrency(totals.vat)} · الإجمالي: <span className="font-semibold text-foreground">{formatCurrency(totals.total)}</span></div>
      </Card>
    </div>
  );
};

export default NewDebitNote;
