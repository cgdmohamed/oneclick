import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseInvoice, SupplierPayment } from './types';

interface Supplier { id: string; name: string; }
interface Account { id: string; name: string; type: string; }

const SupplierPayments = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', purchase_invoice_id: '', account_id: '', amount: '', paid_at: new Date().toISOString().slice(0, 10), method: 'cash', reference: '', notes: '' });
  const payments = useQuery({ queryKey: ['supplier-payments'], queryFn: async () => (await api.get<{ data: SupplierPayment[] }>('/api/purchases/supplier-payments?page_size=300')).data ?? [] });
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get<{ data: Supplier[] }>('/api/suppliers?page_size=300')).data ?? [] });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: async () => (await api.get<{ data: Account[] }>('/api/accounts?page_size=300')).data ?? [] });
  const invoices = useQuery({ queryKey: ['purchase-invoices'], queryFn: async () => (await api.get<{ data: PurchaseInvoice[] }>('/api/purchases/invoices?page_size=300')).data ?? [] });
  const supplierInvoices = (invoices.data ?? []).filter((i) => i.supplier_id === form.supplier_id && Number(i.remaining) > 0);
  const submit = async () => {
    if (!form.supplier_id || !form.account_id) return toast.error('اختر المورد وحساب الدفع');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    setSaving(true);
    try {
      const res = await api.post<{ data: SupplierPayment }>('/api/purchases/supplier-payments', {
        supplier_id: form.supplier_id,
        purchase_invoice_id: form.purchase_invoice_id || null,
        account_id: form.account_id,
        amount,
        paid_at: new Date(form.paid_at).toISOString(),
        method: form.method,
        reference: form.reference || null,
        notes: form.notes || null,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['supplier-payments'] }),
        qc.invalidateQueries({ queryKey: ['purchase-invoices'] }),
        qc.invalidateQueries({ queryKey: ['accounts'] }),
      ]);
      toast.success(res.data.journal_entry_id ? 'تم تسجيل الدفعة وترحيل القيد' : 'تم تسجيل الدفعة');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر تسجيل دفعة المورد');
    } finally {
      setSaving(false);
    }
  };
  const columns: Column<SupplierPayment>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.paid_at) },
    { key: 'supplier', header: 'المورد', cell: (r) => r.supplier_name ?? '—' },
    { key: 'invoice', header: 'فاتورة الشراء', cell: (r) => r.purchase_invoice_number ? <Link className="text-primary" to={`/app/purchases/invoices/${r.purchase_invoice_id}`}>{r.purchase_invoice_number}</Link> : '—' },
    { key: 'account', header: 'حساب الدفع', cell: (r) => r.account_name ?? '—' },
    { key: 'method', header: 'الطريقة', cell: (r) => paymentMethodLabel(r.method) },
    { key: 'amount', header: 'المبلغ', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span>, className: 'text-end' },
    { key: 'journal', header: 'القيد', cell: (r) => r.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>عرض</Link> : '—' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="دفعات الموردين" description="سداد أرصدة الموردين وربطها بقيود اليوميات" actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> دفعة مورد</Button>} />
      <DataTable data={payments.data ?? []} columns={columns} searchKeys={['supplier_name', 'reference']} emptyTitle="لا توجد دفعات موردين" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>دفعة مورد جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>المورد</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.supplier_id} onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value, purchase_invoice_id: '' }))}><option value="">اختر المورد</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><Label>حساب الدفع</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))}><option value="">اختر الحساب</option>{(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            </div>
            <div><Label>فاتورة الشراء (اختياري)</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.purchase_invoice_id} onChange={(e) => setForm((p) => ({ ...p, purchase_invoice_id: e.target.value }))}><option value="">بدون ربط</option>{supplierInvoices.map((i) => <option key={i.id} value={i.id}>{i.number} - متبقي {formatCurrency(Number(i.remaining))}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>المبلغ</Label><Input className="mt-1.5" type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></div>
              <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={form.paid_at} onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الطريقة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}><option value="cash">نقدي</option><option value="bank">تحويل بنكي</option><option value="wallet">محفظة</option></select></div>
              <div><Label>المرجع</Label><Input className="mt-1.5" value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} /></div>
            </div>
            <div><Label>ملاحظات</Label><Textarea className="mt-1.5" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={submit} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ الدفعة'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierPayments;
