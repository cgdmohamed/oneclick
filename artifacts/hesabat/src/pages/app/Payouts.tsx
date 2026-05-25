import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ArrowUpFromLine, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';

interface PayoutRow {
  id: string;
  amount: string | number;
  method: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  account_id: string;
  account_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  expense_category_id: string | null;
  category_name: string | null;
}

interface Account { id: string; name: string; type: string; }
interface Supplier { id: string; name: string; }
interface ExpenseCategory { id: string; name: string; }

interface NewPayout {
  supplier_id: string;
  expense_category_id: string;
  account_id: string;
  amount: string;
  method: string;
  paid_at: string;
  reference: string;
  notes: string;
}

const emptyPayout: NewPayout = {
  supplier_id: '', expense_category_id: '', account_id: '',
  amount: '', method: 'cash',
  paid_at: new Date().toISOString().slice(0, 10),
  reference: '', notes: '',
};

const Payouts = () => {
  const qc = useQueryClient();
  const apiOn = isApiConfigured();

  const { data: payouts = [], isLoading } = useQuery({
    enabled: apiOn,
    queryKey: ['payouts'],
    queryFn: async () => {
      const res = await api.get<{ data: PayoutRow[] }>('/api/payouts?page_size=200');
      return res.data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    enabled: apiOn,
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get<{ data: Account[] }>('/api/accounts?page_size=200');
      return res.data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    enabled: apiOn,
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get<{ data: Supplier[] }>('/api/suppliers?page_size=200');
      return res.data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    enabled: apiOn,
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await api.get<{ data: ExpenseCategory[] }>('/api/expense-categories?page_size=200');
      return res.data ?? [];
    },
  });

  const [open, setOpen]           = useState(false);
  const [form, setForm]           = useState<NewPayout>(emptyPayout);
  const [saving, setSaving]       = useState(false);
  const [toDelete, setToDelete]   = useState<PayoutRow | null>(null);

  const totalPayouts = payouts.reduce((s, p) => s + Number(p.amount), 0);

  const submit = async () => {
    if (!form.account_id) return toast.error('اختر الحساب المالي');
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    setSaving(true);
    try {
      await api.post('/api/payouts', {
        supplier_id:         form.supplier_id         || null,
        expense_category_id: form.expense_category_id || null,
        account_id:          form.account_id,
        amount,
        method:    form.method,
        paid_at:   new Date(form.paid_at).toISOString(),
        reference: form.reference || null,
        notes:     form.notes    || null,
      });
      qc.invalidateQueries({ queryKey: ['payouts'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['reports-overview'] });
      toast.success('تم تسجيل المصروف');
      setOpen(false);
      setForm(emptyPayout);
    } catch {
      toast.error('تعذّر حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/api/payouts/${toDelete.id}`);
      qc.invalidateQueries({ queryKey: ['payouts'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['reports-overview'] });
      toast.success('تم حذف المصروف');
    } catch {
      toast.error('تعذّر حذف المصروف');
    } finally {
      setToDelete(null);
    }
  };

  const columns: Column<PayoutRow>[] = [
    { key: 'date',     header: 'التاريخ',    cell: (r) => <span className="text-muted-foreground text-sm">{formatDateShort(r.paid_at)}</span> },
    { key: 'supplier', header: 'المورد',     cell: (r) => r.supplier_name ?? <span className="text-muted-foreground">—</span> },
    { key: 'category', header: 'التصنيف',   cell: (r) => r.category_name ?? <span className="text-muted-foreground">—</span> },
    { key: 'account',  header: 'الحساب',    cell: (r) => r.account_name },
    { key: 'method',   header: 'الطريقة',   cell: (r) => paymentMethodLabel(r.method) },
    { key: 'amount',   header: 'المبلغ',    cell: (r) => <span className="font-semibold text-destructive">{formatCurrency(Number(r.amount))}</span>, className: 'text-end' },
    { key: 'ref',      header: 'المرجع',    cell: (r) => r.reference ?? <span className="text-muted-foreground">—</span> },
    {
      key: 'actions', header: '',
      cell: (r) => (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setToDelete(r)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="المصروفات" description="تتبع المدفوعات الصادرة للموردين والنفقات" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي المصروفات" value={formatCurrency(totalPayouts)} icon={ArrowUpFromLine} accent="destructive" />
        <StatCard title="عدد العمليات" value={payouts.length} icon={Wallet} accent="info" />
      </div>

      <DataTable
        data={payouts}
        columns={columns}
        loading={isLoading}
        rightToolbar={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 ml-1" /> تسجيل مصروف
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تسجيل مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الحساب المالي *</Label>
                <Select value={form.account_id} onValueChange={(v) => setForm(p => ({ ...p, account_id: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر حساباً" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>المبلغ *</Label>
                <Input className="mt-1.5" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المورد (اختياري)</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm(p => ({ ...p, supplier_id: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="بدون مورد" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">بدون مورد</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>التصنيف (اختياري)</Label>
                <Select value={form.expense_category_id} onValueChange={(v) => setForm(p => ({ ...p, expense_category_id: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">بدون تصنيف</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={form.method} onValueChange={(v) => setForm(p => ({ ...p, method: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="bank">تحويل بنكي</SelectItem>
                    <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تاريخ الدفع</Label>
                <Input className="mt-1.5" type="date" value={form.paid_at} onChange={(e) => setForm(p => ({ ...p, paid_at: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>المرجع / رقم الإيصال</Label>
              <Input className="mt-1.5" value={form.reference} onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="اختياري" />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea className="mt-1.5" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ المصروف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription>سيتم استرداد {toDelete ? formatCurrency(Number(toDelete.amount)) : ''} للحساب المالي. هل أنت متأكد؟</AlertDialogDescription>
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

export default Payouts;
