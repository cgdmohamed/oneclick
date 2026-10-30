import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus, FileText } from 'lucide-react';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { toast } from 'sonner';
import type { Employee } from './types';

interface Dimension { id: string; name: string; code?: string | null; is_active: boolean }
const empty = { name: '', phone: '', email: '', national_id: '', hire_date: new Date().toISOString().slice(0, 10), branch_id: '', cost_center_id: '', basic_salary: '', notes: '' };

interface LedgerStatementLine {
  entry_date: string;
  memo: string | null;
  description: string | null;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  running_balance: string;
}

const Employees = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [ledgerEmployee, setLedgerEmployee] = useState<Employee | null>(null);
  const ledgerQuery = useQuery({
    enabled: Boolean(ledgerEmployee),
    queryKey: ['employee-ledger-statement', ledgerEmployee?.id],
    queryFn: async () => (await api.get<{ data: LedgerStatementLine[]; summary: { closing_balance: string } }>(
      `/api/reports/employee-ledger-detail?employee_id=${encodeURIComponent(ledgerEmployee!.id)}`,
    )),
  });
  const { data = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get<{ data: Employee[] }>('/api/payroll/employees')).data ?? [] });
  // Query keys deliberately distinct from the canonical Branches.tsx/
  // CostCenters.tsx caches — these fetch raw snake_case rows; sharing a key
  // let whichever query ran last silently overwrite the other's cache shape.
  const branches = useQuery({ queryKey: ['branches-picker'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/branches?page_size=200')).data ?? [] });
  const costCenters = useQuery({ queryKey: ['cost-centers-picker'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/cost-centers?page_size=200')).data ?? [] });
  const submit = async () => {
    if (!form.name.trim()) return toast.error('اسم الموظف مطلوب');
    if (!form.basic_salary || Number(form.basic_salary) <= 0) return toast.error('الراتب الأساسي مطلوب ويجب أن يكون أكبر من صفر');
    try {
      await api.post('/api/payroll/employees', { ...form, basic_salary: Number(form.basic_salary), branch_id: form.branch_id || null, cost_center_id: form.cost_center_id || null, phone: form.phone || null, email: form.email || null, national_id: form.national_id || null, notes: form.notes || null });
      await qc.invalidateQueries({ queryKey: ['employees'] });
      setOpen(false); setForm(empty); toast.success('تم حفظ الموظف');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر حفظ الموظف'); }
  };
  const columns: Column<Employee>[] = [
    { key: 'code', header: 'الكود', cell: (r) => r.employee_code },
    { key: 'name', header: 'الموظف', cell: (r) => r.name },
    { key: 'hire', header: 'تاريخ التعيين', cell: (r) => formatDateShort(r.hire_date) },
    { key: 'branch', header: 'الفرع', cell: (r) => r.branch_name ?? '—' },
    { key: 'salary', header: 'الراتب الأساسي', cell: (r) => formatCurrency(Number(r.basic_salary)), className: 'text-end' },
    { key: 'status', header: 'الحالة', cell: (r) => r.status },
    { key: 'actions', header: '', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setLedgerEmployee(r)}><FileText className="h-4 w-4 ml-1" /> كشف الحساب</Button> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="الموظفون" description="بيانات الموظفين ورواتبهم الأساسية" actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> موظف جديد</Button>} />
      <DataTable data={data} columns={columns} searchKeys={['employee_code', 'name']} emptyTitle="لا يوجد موظفون" />
      <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>موظف جديد</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-3 gap-3">
          <div><Label>الاسم</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div><Label>تاريخ التعيين</Label><Input className="mt-1.5" type="date" value={form.hire_date} onChange={(e) => setForm((p) => ({ ...p, hire_date: e.target.value }))} /></div>
          <div><Label>الهاتف</Label><Input className="mt-1.5" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div><Label>البريد</Label><Input className="mt-1.5" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div><Label>الرقم القومي</Label><Input className="mt-1.5" value={form.national_id} onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))} /></div>
          <div><Label>الراتب الأساسي *</Label><Input className="mt-1.5" type="number" min="0.01" step="0.01" value={form.basic_salary} onChange={(e) => setForm((p) => ({ ...p, basic_salary: e.target.value }))} /></div>
          <div><Label>الفرع</Label><div className="mt-1.5"><SearchableSelect value={form.branch_id} onValueChange={(v) => setForm((p) => ({ ...p, branch_id: v }))} placeholder="بدون" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} /></div></div>
          <div><Label>مركز التكلفة</Label><div className="mt-1.5"><SearchableSelect value={form.cost_center_id} onValueChange={(v) => setForm((p) => ({ ...p, cost_center_id: v }))} placeholder="بدون" options={(costCenters.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></div></div>
          <div className="md:col-span-3"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={submit}>حفظ</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={Boolean(ledgerEmployee)} onOpenChange={(o) => { if (!o) setLedgerEmployee(null); }}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader><DialogTitle>كشف حساب — {ledgerEmployee?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            كشف حساب مباشر من دفتر الأستاذ — كل قيد مرحّل يخص حساب هذا الموظف (مستحقات الموظفين) بالمدين والدائن والرصيد التراكمي.
          </p>
          {ledgerQuery.data?.summary && (
            <div className="text-end">
              <p className="text-xs text-muted-foreground mb-0.5">الرصيد الحالي (مستحق للموظف)</p>
              <p className="text-lg font-bold">{formatCurrency(Number(ledgerQuery.data.summary.closing_balance))}</p>
            </div>
          )}
          {ledgerQuery.isLoading ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">جارٍ التحميل…</Card>
          ) : !ledgerQuery.data?.data.length ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">لا توجد قيود مرحّلة بعد.</Card>
          ) : (
            <Card className="border-border/60 overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-start p-3 font-medium">التاريخ</th>
                    <th className="text-start p-3 font-medium">البيان</th>
                    <th className="text-start p-3 font-medium">الحساب</th>
                    <th className="text-end p-3 font-medium">مدين</th>
                    <th className="text-end p-3 font-medium">دائن</th>
                    <th className="text-end p-3 font-medium">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQuery.data.data.map((l, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="p-3">{formatDateShort(l.entry_date)}</td>
                      <td className="p-3">{l.description || l.memo || '—'}</td>
                      <td className="p-3">{l.account_code} - {l.account_name}</td>
                      <td className="p-3 text-end">{Number(l.debit) > 0 ? formatCurrency(Number(l.debit)) : '—'}</td>
                      <td className="p-3 text-end">{Number(l.credit) > 0 ? formatCurrency(Number(l.credit)) : '—'}</td>
                      <td className="p-3 text-end font-medium">{formatCurrency(Number(l.running_balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setLedgerEmployee(null)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Employees;
