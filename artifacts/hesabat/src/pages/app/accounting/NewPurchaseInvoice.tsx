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
import type { ChartAccount, PurchaseInvoice } from './types';

interface Supplier { id: string; name: string; }
interface Product {
  id: string;
  name: string;
  barcode?: string | null;
  product_type?: 'stock' | 'service' | 'non_stock' | 'expense';
  cost?: string | number;
  vat_status?: 'taxable' | 'exempt' | 'zero_rated';
  vat_rate?: string | number;
}
interface ItemForm {
  product_id: string;
  expense_account_id: string;
  description: string;
  quantity: string;
  unit_cost: string;
  vat_rate: string;
}

const blankItem = (): ItemForm => ({ product_id: '', expense_account_id: '', description: '', quantity: '1', unit_cost: '', vat_rate: '15' });

const NewPurchaseInvoice = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [number, setNumber] = useState('');
  const [supplierNumber, setSupplierNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState(false);
  const [items, setItems] = useState<ItemForm[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get<{ data: Supplier[] }>('/api/suppliers?page_size=300')).data ?? [] });
  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<{ data: Product[] }>('/api/products?page_size=300')).data ?? [] });
  const accounts = useQuery({ queryKey: ['chart-accounts'], queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [] });
  const expenseAccounts = (accounts.data ?? []).filter((a) => a.type === 'expense' && a.is_active);
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
    const vat = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0) * (Number(item.vat_rate || 0) / 100), 0);
    return { subtotal, vat, total: subtotal + vat };
  }, [items]);
  const updateItem = (idx: number, patch: Partial<ItemForm>) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  const submit = async () => {
    if (!supplierId) return toast.error('اختر المورد');
    if (!number.trim()) return toast.error('أدخل رقم فاتورة الشراء');
    const validItems = items.filter((i) => i.description && Number(i.quantity) > 0 && Number(i.unit_cost) >= 0);
    if (!validItems.length) return toast.error('أضف بنداً واحداً على الأقل');
    setSaving(true);
    try {
      const res = await api.post<{ data: PurchaseInvoice }>('/api/purchases/invoices', {
        supplier_id: supplierId,
        number,
        supplier_number: supplierNumber || null,
        invoice_date: new Date(invoiceDate).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes || null,
        draft,
        items: validItems.map((item) => ({
          product_id: item.product_id || null,
          expense_account_id: item.product_id ? null : item.expense_account_id || null,
          description: item.description,
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          vat_rate: Number(item.vat_rate || 0),
        })),
      });
      await qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
      toast.success(draft ? 'تم حفظ مسودة الشراء' : 'تم ترحيل فاتورة الشراء');
      navigate(`/app/purchases/invoices/${res.data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ فاتورة الشراء');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <Link to="/app/purchases/invoices" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة لفواتير الشراء</Link>
      <PageHeader title="فاتورة شراء جديدة" description="يمكن أن تزيد المخزون أو تسجل مصروفاً على المورد" />
      <Card className="p-4 border-border/60">
        <div className="grid lg:grid-cols-4 gap-4">
          <div><Label>المورد</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">اختر المورد</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><Label>رقم الفاتورة</Label><Input className="mt-1.5" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          <div><Label>رقم المورد</Label><Input className="mt-1.5" value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} /></div>
          <div><Label>الحالة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft ? 'draft' : 'posted'} onChange={(e) => setDraft(e.target.value === 'draft')}><option value="posted">ترحيل مباشر</option><option value="draft">مسودة</option></select></div>
          <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
          <div><Label>تاريخ الاستحقاق</Label><Input className="mt-1.5" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>
        <div className="mt-4"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      </Card>
      <Card className="p-4 border-border/60 space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid xl:grid-cols-[1.3fr_1.5fr_0.7fr_0.8fr_0.7fr_auto] gap-2 items-end">
            <div><Label>منتج أو مصروف</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={item.product_id || `expense:${item.expense_account_id}`} onChange={(e) => {
              const value = e.target.value;
              if (value.startsWith('expense:')) updateItem(idx, { product_id: '', expense_account_id: value.replace('expense:', '') });
              else {
                const p = (products.data ?? []).find((prod) => prod.id === value);
                updateItem(idx, {
                  product_id: value,
                  expense_account_id: p?.product_type === 'stock' ? '' : item.expense_account_id,
                  description: p?.name ?? item.description,
                  unit_cost: String(p?.cost ?? item.unit_cost),
                  vat_rate: String(p?.vat_status === 'taxable' ? Number(p?.vat_rate ?? item.vat_rate) : 0),
                });
              }
            }}><option value="">اختر</option>{(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.barcode ? ` - ${p.barcode}` : ''}</option>)}{expenseAccounts.map((a) => <option key={a.id} value={`expense:${a.id}`}>مصروف: {a.code} - {a.name}</option>)}</select></div>
            <div><Label>الوصف</Label><Input className="mt-1.5" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} /></div>
            <div><Label>الكمية</Label><Input className="mt-1.5" type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></div>
            <div><Label>تكلفة الوحدة</Label><Input className="mt-1.5" type="number" value={item.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: e.target.value })} /></div>
            <div><Label>VAT %</Label><Input className="mt-1.5" type="number" value={item.vat_rate} onChange={(e) => updateItem(idx, { vat_rate: e.target.value })} /></div>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setItems((prev) => [...prev, blankItem()])}><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
      </Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">قبل الضريبة: {formatCurrency(totals.subtotal)} · الضريبة: {formatCurrency(totals.vat)} · الإجمالي: <span className="font-semibold text-foreground">{formatCurrency(totals.total)}</span></div>
        <Button onClick={submit} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ فاتورة الشراء'}</Button>
      </div>
    </div>
  );
};

export default NewPurchaseInvoice;
