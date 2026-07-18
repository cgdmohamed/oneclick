import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import type { ChartAccount, SalaryComponent } from './types';

const typeLabel = (type: string) => type === 'earning' ? 'استحقاق' : type === 'deduction' ? 'استقطاع' : 'تحمل صاحب العمل';

const SalaryComponents = () => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', type: 'earning', account_id: '' });
  const { data = [] } = useQuery({ queryKey: ['salary-components'], queryFn: async () => (await api.get<{ data: SalaryComponent[] }>('/api/payroll/components')).data ?? [] });
  const accounts = useQuery({ queryKey: ['chart-accounts'], queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [] });
  const submit = async () => {
    try {
      await api.post('/api/payroll/components', form);
      setForm({ name: '', type: 'earning', account_id: '' });
      await qc.invalidateQueries({ queryKey: ['salary-components'] });
      toast.success('تم حفظ مكون الراتب');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر حفظ المكون'); }
  };
  const columns: Column<SalaryComponent>[] = [
    { key: 'name', header: 'المكون', cell: (r) => r.name },
    { key: 'type', header: 'النوع', cell: (r) => typeLabel(r.type) },
    { key: 'account', header: 'الحساب', cell: (r) => `${r.account_code ?? ''} ${r.account_name ?? ''}`.trim() },
    { key: 'status', header: 'الحالة', cell: (r) => r.is_active ? 'نشط' : 'غير نشط' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="مكونات الرواتب" description="استحقاقات واستقطاعات قابلة للتهيئة بدون نسب ثابتة" />
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div><Label>الاسم</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div><Label>النوع</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}><option value="earning">استحقاق</option><option value="deduction">استقطاع</option><option value="employer_contribution">تحمل صاحب العمل</option></select></div>
          <div><Label>الحساب</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))}><option value="">اختر الحساب</option>{(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>
          <Button onClick={submit}>حفظ المكون</Button>
        </div>
      </Card>
      <DataTable data={data} columns={columns} searchKeys={['name', 'account_name']} emptyTitle="لا توجد مكونات رواتب" />
    </div>
  );
};

export default SalaryComponents;
