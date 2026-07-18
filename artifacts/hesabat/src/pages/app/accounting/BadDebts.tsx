import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { FileText, RotateCcw, ShieldAlert, Wallet } from 'lucide-react';
import { toast } from 'sonner';

interface Customer { id: string; name: string }
interface Invoice { id: string; client_id: string; number: string; remaining: string | number; status: string }
interface Allowance { id: string; customer_id: string | null; customer_name?: string | null; allowance_date: string; amount: string | number; notes: string | null; status: string; journal_entry_id: string | null }
interface WriteOff { id: string; customer_id: string; customer_name?: string; invoice_id: string | null; invoice_number?: string | null; write_off_date: string; amount: string | number; reason: string | null; status: string; journal_entry_id: string | null }

const NONE = '__none__';

const BadDebts = () => {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const invoiceParam = params.get('invoice') ?? '';
  const [allowance, setAllowance] = useState({ customer_id: NONE, allowance_date: new Date().toISOString().slice(0, 10), amount: '', notes: '' });
  const [writeOff, setWriteOff] = useState({ customer_id: '', invoice_id: invoiceParam || NONE, write_off_date: new Date().toISOString().slice(0, 10), amount: '', reason: '' });

  const customers = useQuery({ queryKey: ['clients'], queryFn: async () => (await api.get<{ data: Customer[] }>('/api/clients?page_size=300')).data ?? [] });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: async () => (await api.get<{ data: Invoice[] }>('/api/invoices?page_size=300')).data ?? [] });
  const allowances = useQuery({ queryKey: ['bad-debt-allowances'], queryFn: async () => (await api.get<{ data: Allowance[] }>('/api/bad-debts/allowances')).data ?? [] });
  const writeOffs = useQuery({ queryKey: ['bad-debt-write-offs'], queryFn: async () => (await api.get<{ data: WriteOff[] }>('/api/bad-debts/write-offs')).data ?? [] });

  useEffect(() => {
    if (!invoiceParam || !invoices.data?.length) return;
    const invoice = invoices.data.find((item) => item.id === invoiceParam);
    if (invoice) setWriteOff((prev) => ({ ...prev, customer_id: invoice.client_id, invoice_id: invoice.id, amount: String(invoice.remaining) }));
  }, [invoiceParam, invoices.data]);

  const customerInvoices = useMemo(
    () => (invoices.data ?? []).filter((invoice) => invoice.client_id === writeOff.customer_id && Number(invoice.remaining) > 0 && invoice.status !== 'cancelled'),
    [invoices.data, writeOff.customer_id],
  );
  const postedAllowances = (allowances.data ?? []).filter((row) => row.status === 'posted');
  const postedWriteOffs = (writeOffs.data ?? []).filter((row) => row.status === 'posted');

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['bad-debt-allowances'] }),
      qc.invalidateQueries({ queryKey: ['bad-debt-write-offs'] }),
      qc.invalidateQueries({ queryKey: ['invoices'] }),
      qc.invalidateQueries({ queryKey: ['financial-report'] }),
    ]);
  };

  const createAllowance = async () => {
    try {
      await api.post('/api/bad-debts/allowances', {
        customer_id: allowance.customer_id === NONE ? null : allowance.customer_id,
        allowance_date: new Date(allowance.allowance_date).toISOString(),
        amount: Number(allowance.amount),
        notes: allowance.notes || null,
      });
      setAllowance((prev) => ({ ...prev, amount: '', notes: '' }));
      await refresh();
      toast.success('تم إنشاء مخصص الديون');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء المخصص');
    }
  };

  const createWriteOff = async () => {
    try {
      await api.post('/api/bad-debts/write-offs', {
        customer_id: writeOff.customer_id,
        invoice_id: writeOff.invoice_id === NONE ? null : writeOff.invoice_id,
        write_off_date: new Date(writeOff.write_off_date).toISOString(),
        amount: Number(writeOff.amount),
        reason: writeOff.reason || null,
      });
      setWriteOff((prev) => ({ ...prev, invoice_id: NONE, amount: '', reason: '' }));
      await refresh();
      toast.success('تم ترحيل إعدام الدين');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر ترحيل إعدام الدين');
    }
  };

  const cancelAllowance = async (id: string) => {
    try {
      await api.post(`/api/bad-debts/allowances/${id}/cancel`, {});
      await refresh();
      toast.success('تم عكس المخصص');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر عكس المخصص');
    }
  };

  const cancelWriteOff = async (id: string) => {
    try {
      await api.post(`/api/bad-debts/write-offs/${id}/cancel`, {});
      await refresh();
      toast.success('تم عكس إعدام الدين');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر عكس إعدام الدين');
    }
  };

  const allowanceColumns: Column<Allowance>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.allowance_date) },
    { key: 'customer', header: 'العميل', cell: (r) => r.customer_name ?? 'عام' },
    { key: 'amount', header: 'المبلغ', cell: (r) => formatCurrency(Number(r.amount)), className: 'text-end' },
    { key: 'status', header: 'الحالة', cell: (r) => r.status },
    { key: 'journal', header: 'القيد', cell: (r) => r.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>عرض</Link> : '—' },
    { key: 'actions', header: '', cell: (r) => r.status === 'posted' ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); cancelAllowance(r.id); }}>عكس</Button> : null },
  ];
  const writeOffColumns: Column<WriteOff>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.write_off_date) },
    { key: 'customer', header: 'العميل', cell: (r) => r.customer_name ?? '—' },
    { key: 'invoice', header: 'الفاتورة', cell: (r) => r.invoice_number ?? 'رصيد العميل' },
    { key: 'amount', header: 'المبلغ', cell: (r) => formatCurrency(Number(r.amount)), className: 'text-end' },
    { key: 'status', header: 'الحالة', cell: (r) => r.status },
    { key: 'journal', header: 'القيد', cell: (r) => r.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>عرض</Link> : '—' },
    { key: 'actions', header: '', cell: (r) => r.status === 'posted' ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); cancelWriteOff(r.id); }}>عكس</Button> : null },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="الديون المعدومة والمخصصات" description="إنشاء مخصصات يدوية وإعدام أرصدة عملاء باستخدام قيود يومية" />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="المخصصات المرحلة" value={formatCurrency(postedAllowances.reduce((sum, row) => sum + Number(row.amount), 0))} icon={ShieldAlert} accent="warning" />
        <StatCard title="الديون المعدومة" value={formatCurrency(postedWriteOffs.reduce((sum, row) => sum + Number(row.amount), 0))} icon={RotateCcw} accent="destructive" />
        <StatCard title="عدد القيود" value={postedAllowances.length + postedWriteOffs.length} icon={Wallet} accent="info" />
      </div>
      <Tabs defaultValue="allowance">
        <TabsList>
          <TabsTrigger value="allowance">مخصص مشكوك فيه</TabsTrigger>
          <TabsTrigger value="writeoff">إعدام دين</TabsTrigger>
        </TabsList>
        <TabsContent value="allowance" className="space-y-4 mt-4">
          <Card className="p-4 border-border/60">
            <div className="grid md:grid-cols-4 gap-4 items-end">
              <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={allowance.allowance_date} onChange={(e) => setAllowance((p) => ({ ...p, allowance_date: e.target.value }))} /></div>
              <div><Label>العميل</Label><Select value={allowance.customer_id} onValueChange={(v) => setAllowance((p) => ({ ...p, customer_id: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>عام بدون عميل</SelectItem>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>المبلغ</Label><Input className="mt-1.5" type="number" value={allowance.amount} onChange={(e) => setAllowance((p) => ({ ...p, amount: e.target.value }))} /></div>
              <Button onClick={createAllowance}>ترحيل المخصص</Button>
              <div className="md:col-span-4"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={allowance.notes} onChange={(e) => setAllowance((p) => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </Card>
          <DataTable data={allowances.data ?? []} columns={allowanceColumns} searchKeys={['customer_name', 'notes']} emptyTitle="لا توجد مخصصات" />
        </TabsContent>
        <TabsContent value="writeoff" className="space-y-4 mt-4">
          <Card className="p-4 border-border/60">
            <div className="grid md:grid-cols-5 gap-4 items-end">
              <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={writeOff.write_off_date} onChange={(e) => setWriteOff((p) => ({ ...p, write_off_date: e.target.value }))} /></div>
              <div><Label>العميل</Label><Select value={writeOff.customer_id} onValueChange={(v) => setWriteOff((p) => ({ ...p, customer_id: v, invoice_id: NONE }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر العميل" /></SelectTrigger><SelectContent>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>الفاتورة</Label><Select value={writeOff.invoice_id} onValueChange={(v) => { const inv = customerInvoices.find((i) => i.id === v); setWriteOff((p) => ({ ...p, invoice_id: v, amount: inv ? String(inv.remaining) : p.amount })); }}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>رصيد العميل</SelectItem>{customerInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.number} - {formatCurrency(Number(i.remaining))}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>المبلغ</Label><Input className="mt-1.5" type="number" value={writeOff.amount} onChange={(e) => setWriteOff((p) => ({ ...p, amount: e.target.value }))} /></div>
              <Button onClick={createWriteOff}>ترحيل الإعدام</Button>
              <div className="md:col-span-5"><Label>السبب</Label><Textarea className="mt-1.5" value={writeOff.reason} onChange={(e) => setWriteOff((p) => ({ ...p, reason: e.target.value }))} /></div>
            </div>
          </Card>
          <DataTable data={writeOffs.data ?? []} columns={writeOffColumns} searchKeys={['customer_name', 'invoice_number', 'reason']} emptyTitle="لا توجد ديون معدومة" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BadDebts;
