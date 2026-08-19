import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { payments as mockPayments, accounts as mockAccounts, invoices as mockInvoices } from '@/data/mock';
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResource } from '@/hooks/useResource';
import type { PaymentMethod } from '@/types';
import { api, isApiConfigured } from '@/lib/api';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentRowApi {
  id: string;
  amount: string | number;
  paid_at: string;
  method: string;
  account_id: string;
  account_name: string;
  invoice_id: string | null;
  invoice_number: string | null;
  collection_type?: 'invoice_collection' | 'general_receipt';
  credit_account_id?: string | null;
  credit_account_name?: string | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  accountName: string;
  invoiceNumber: string;
  type: 'invoice_collection' | 'general_receipt';
  creditAccountName?: string | null;
}

interface Account { id: string; name: string; type: string; }
interface Invoice { id: string; number: string; remaining: string | number; total: string | number; client_name?: string | null; status: string; }
interface ChartAccount { id: string; code: string; name: string; type: string; is_active: boolean; }

const emptyForm = {
  collection_type: 'invoice_collection' as 'invoice_collection' | 'general_receipt',
  invoice_id: '',
  credit_account_id: '',
  account_id: '',
  amount: '',
  paid_at: new Date().toISOString().slice(0, 10),
  method: 'cash',
  reference: '',
  notes: '',
};

// Flatten mock payments (with splits) into one row per split, matching the API shape
const initialFlat: PaymentRow[] = mockPayments.flatMap(p => p.splits.map((s, i) => ({
  id: `${p.id}-${i}`,
  amount: s.amount,
  date: p.date,
  method: s.method,
  accountName: mockAccounts.find(a => a.id === s.accountId)?.name ?? '—',
  invoiceNumber: mockInvoices.find(inv => inv.id === p.invoiceId)?.number ?? '—',
  type: 'invoice_collection',
})));

const Payments = () => {
  const qc = useQueryClient();
  const apiOn = isApiConfigured();
  const { list } = useResource<PaymentRow, PaymentRowApi>({
    path: '/api/payments',
    key: 'payments',
    initial: initialFlat,
    fromRow: (r) => ({
      id: r.id,
      amount: Number(r.amount),
      date: r.paid_at,
      method: (r.method as PaymentMethod) ?? 'cash',
      accountName: r.account_name,
      invoiceNumber: r.invoice_number ?? '—',
      type: r.collection_type ?? 'invoice_collection',
      creditAccountName: r.credit_account_name ?? null,
    }),
    toRow: () => ({}),
  });
  const accounts = useQuery({
    enabled: apiOn,
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<{ data: Account[] }>('/api/accounts?page_size=300')).data ?? [],
  });
  const invoices = useQuery({
    enabled: apiOn,
    queryKey: ['invoices'],
    queryFn: async () => (await api.get<{ data: Invoice[] }>('/api/invoices?page_size=300')).data ?? [],
  });
  const chartAccounts = useQuery({
    enabled: apiOn,
    queryKey: ['chart-accounts'],
    queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts?limit=500')).data ?? [],
  });

  const [method, setMethod] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const selectedInvoice = (invoices.data ?? []).find((i) => i.id === form.invoice_id);
  const moneyAccounts = accounts.data ?? [];
  const creditAccounts = (chartAccounts.data ?? []).filter((a) => a.is_active);
  const filtered = useMemo(
    () => method === 'all' ? list : list.filter(f => f.method === method),
    [method, list],
  );

  const columns: Column<PaymentRow>[] = [
    { key: 'date', header: 'التاريخ', cell: r => <span className="text-muted-foreground">{formatDateShort(r.date)}</span> },
    { key: 'type', header: 'النوع', cell: r => r.type === 'general_receipt' ? 'تحصيل عام' : 'تحصيل فاتورة' },
    { key: 'inv', header: 'الفاتورة', cell: r => r.invoiceNumber },
    { key: 'credit', header: 'حساب الدائن', cell: r => r.type === 'general_receipt' ? r.creditAccountName ?? '—' : 'ذمم العملاء' },
    { key: 'method', header: 'الطريقة', cell: r => paymentMethodLabel(r.method) },
    { key: 'account', header: 'الحساب المالي', cell: r => r.accountName },
    { key: 'amount', header: 'المبلغ', cell: r => <span className="font-semibold">{formatCurrency(r.amount)}</span>, className: 'text-end' },
  ];

  const submit = async () => {
    if (!form.account_id) return toast.error('اختر حساب التحصيل');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    if (form.collection_type === 'invoice_collection' && !form.invoice_id) return toast.error('اختر الفاتورة');
    if (form.collection_type === 'general_receipt' && !form.credit_account_id) return toast.error('اختر حساب الدائن');
    if (selectedInvoice && amount > Number(selectedInvoice.remaining ?? selectedInvoice.total) + 0.005) return toast.error('مبلغ التحصيل أكبر من المتبقي');
    setSaving(true);
    try {
      await api.post('/api/payments', {
        collection_type: form.collection_type,
        invoice_id: form.collection_type === 'invoice_collection' ? form.invoice_id : null,
        credit_account_id: form.collection_type === 'general_receipt' ? form.credit_account_id : null,
        account_id: form.account_id,
        amount,
        paid_at: new Date(form.paid_at).toISOString(),
        method: form.method,
        reference: form.reference || null,
        notes: form.notes || null,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['payments'] }),
        qc.invalidateQueries({ queryKey: ['accounts'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
      toast.success('تم تسجيل التحصيل');
      setOpen(false);
      setForm(emptyForm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر تسجيل التحصيل');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="التحصيلات" description="تحصيلات الفواتير والتحصيلات العامة" />
      <DataTable
        data={filtered}
        columns={columns}
        searchKeys={['invoiceNumber', 'accountName']}
        searchPlaceholder="ابحث برقم الفاتورة أو الحساب..."
        rightToolbar={
          <div className="flex gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الطرق</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="bank">تحويل بنكي</SelectItem>
                <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 me-1" /> تحصيل جديد</Button>
          </div>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>تحصيل جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>نوع التحصيل</Label><Select value={form.collection_type} onValueChange={(v) => setForm((p) => ({ ...p, collection_type: v as typeof form.collection_type, invoice_id: '', credit_account_id: '' }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice_collection">تحصيل فاتورة</SelectItem><SelectItem value="general_receipt">تحصيل عام</SelectItem></SelectContent></Select></div>
              <div><Label>حساب التحصيل</Label><Select value={form.account_id} onValueChange={(v) => setForm((p) => ({ ...p, account_id: v }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الحساب" /></SelectTrigger><SelectContent>{moneyAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {form.collection_type === 'invoice_collection' ? (
              <div><Label>الفاتورة</Label><Select value={form.invoice_id} onValueChange={(v) => setForm((p) => ({ ...p, invoice_id: v, amount: String((invoices.data ?? []).find((i) => i.id === v)?.remaining ?? p.amount) }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الفاتورة" /></SelectTrigger><SelectContent>{(invoices.data ?? []).filter((i) => i.status !== 'draft' && i.status !== 'cancelled' && Number(i.remaining) > 0).map((i) => <SelectItem key={i.id} value={i.id}>{i.number} - {i.client_name ?? '—'} - متبقي {formatCurrency(Number(i.remaining))}</SelectItem>)}</SelectContent></Select></div>
            ) : (
              <div><Label>حساب الدائن</Label><Select value={form.credit_account_id} onValueChange={(v) => setForm((p) => ({ ...p, credit_account_id: v }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر حساب الدائن" /></SelectTrigger><SelectContent>{creditAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent></Select></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>المبلغ</Label><Input className="mt-1.5" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></div>
              <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={form.paid_at} onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الطريقة</Label><Select value={form.method} onValueChange={(v) => setForm((p) => ({ ...p, method: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">نقدي</SelectItem><SelectItem value="bank">تحويل بنكي</SelectItem><SelectItem value="wallet">محفظة إلكترونية</SelectItem></SelectContent></Select></div>
              <div><Label>المرجع</Label><Input className="mt-1.5" value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} /></div>
            </div>
            <div><Label>ملاحظات</Label><Textarea className="mt-1.5" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التحصيل'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payments;
