import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from './types';

interface Dimension { id: string; name: string; code?: string | null; is_active: boolean }
const empty = { employee_code: '', name: '', phone: '', email: '', national_id: '', hire_date: new Date().toISOString().slice(0, 10), branch_id: '', cost_center_id: '', basic_salary: '', notes: '' };

const Employees = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const { data = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get<{ data: Employee[] }>('/api/payroll/employees')).data ?? [] });
  const branches = useQuery({ queryKey: ['branches'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/branches')).data ?? [] });
  const costCenters = useQuery({ queryKey: ['cost-centers'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/cost-centers')).data ?? [] });
  const submit = async () => {
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
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="الموظفون" description="بيانات الموظفين ورواتبهم الأساسية" actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> موظف جديد</Button>} />
      <DataTable data={data} columns={columns} searchKeys={['employee_code', 'name']} emptyTitle="لا يوجد موظفون" />
      <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>موظف جديد</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-3 gap-3">
          <div><Label>الكود</Label><Input className="mt-1.5" value={form.employee_code} onChange={(e) => setForm((p) => ({ ...p, employee_code: e.target.value }))} /></div>
          <div><Label>الاسم</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div><Label>تاريخ التعيين</Label><Input className="mt-1.5" type="date" value={form.hire_date} onChange={(e) => setForm((p) => ({ ...p, hire_date: e.target.value }))} /></div>
          <div><Label>الهاتف</Label><Input className="mt-1.5" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div><Label>البريد</Label><Input className="mt-1.5" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div><Label>الرقم القومي</Label><Input className="mt-1.5" value={form.national_id} onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))} /></div>
          <div><Label>الراتب الأساسي</Label><Input className="mt-1.5" type="number" value={form.basic_salary} onChange={(e) => setForm((p) => ({ ...p, basic_salary: e.target.value }))} /></div>
          <div><Label>الفرع</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.branch_id} onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value }))}><option value="">بدون</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><Label>مركز التكلفة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.cost_center_id} onChange={(e) => setForm((p) => ({ ...p, cost_center_id: e.target.value }))}><option value="">بدون</option>{(costCenters.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="md:col-span-3"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={submit}>حفظ</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};

export default Employees;
