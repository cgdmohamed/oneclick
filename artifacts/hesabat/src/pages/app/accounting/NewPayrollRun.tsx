import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { ArrowRight, Calculator, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee, PayrollRun, PayrollRunLine, SalaryComponent } from './types';

const NewPayrollRun = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [amounts, setAmounts] = useState<Record<string, Record<string, string>>>({});
  const employees = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get<{ data: Employee[] }>('/api/payroll/employees')).data ?? [] });
  const components = useQuery({ queryKey: ['salary-components'], queryFn: async () => (await api.get<{ data: SalaryComponent[] }>('/api/payroll/components')).data ?? [] });
  const payload = useMemo(() => ({
    period_month: Number(periodMonth),
    period_year: Number(periodYear),
    lines: Object.entries(amounts).map(([employee_id, comps]) => ({
      employee_id,
      components: Object.entries(comps).map(([salary_component_id, amount]) => ({ salary_component_id, amount: Number(amount || 0) })),
    })),
  }), [periodMonth, periodYear, amounts]);
  const preview = useQuery({ enabled: false, queryKey: ['payroll-preview', payload], queryFn: async () => (await api.post<{ data: { lines: PayrollRunLine[]; totals: any } }>('/api/payroll/preview', payload)).data });
  const setAmount = (employeeId: string, componentId: string, value: string) => setAmounts((p) => ({ ...p, [employeeId]: { ...(p[employeeId] ?? {}), [componentId]: value } }));
  const create = async (post: boolean) => {
    try {
      const res = await api.post<{ data: PayrollRun }>('/api/payroll/runs', { ...payload, post });
      await qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      toast.success(post ? 'تم إنشاء وترحيل الرواتب' : 'تم حفظ تشغيل الرواتب');
      navigate(`/app/accounting/payroll-runs/${res.data.id}`);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء التشغيل'); }
  };
  const cols: Column<PayrollRunLine>[] = [
    { key: 'employee', header: 'الموظف', cell: (r) => `${r.employee_code ?? ''} ${r.employee_name ?? ''}`.trim() },
    { key: 'basic', header: 'الأساسي', cell: (r) => formatCurrency(Number(r.basic_salary)), className: 'text-end' },
    { key: 'earn', header: 'إجمالي الاستحقاقات', cell: (r) => formatCurrency(Number(r.total_earnings)), className: 'text-end' },
    { key: 'ded', header: 'الاستقطاعات', cell: (r) => formatCurrency(Number(r.total_deductions)), className: 'text-end' },
    { key: 'net', header: 'الصافي', cell: (r) => formatCurrency(Number(r.net_salary)), className: 'text-end' },
  ];
  const previewRows = (preview.data?.lines ?? []).map((line, idx) => ({ ...line, id: line.id ?? `${line.employee_id}-${idx}` }));
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/payroll-runs" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للرواتب</Link>
      <PageHeader title="تشغيل رواتب جديد" description="أدخل مكونات الرواتب يدوياً ثم راجع المعاينة قبل الترحيل" />
      <Card className="p-4 border-border/60 space-y-4">
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <Input type="number" min="1" max="12" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          <Input type="number" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} />
          <Button variant="outline" onClick={() => preview.refetch()}><Calculator className="h-4 w-4 ml-1" /> معاينة</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-start py-2">الموظف</th>{(components.data ?? []).map((c) => <th key={c.id} className="text-end py-2 min-w-32">{c.name}</th>)}</tr></thead>
            <tbody>{(employees.data ?? []).filter((e) => e.status === 'active').map((e) => <tr key={e.id} className="border-b"><td className="py-2">{e.employee_code} - {e.name}</td>{(components.data ?? []).map((c) => <td key={c.id} className="py-2"><Input className="text-end" type="number" value={amounts[e.id]?.[c.id] ?? ''} onChange={(ev) => setAmount(e.id, c.id, ev.target.value)} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>
      {preview.data && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard title="إجمالي الاستحقاقات" value={formatCurrency(Number(preview.data.totals.total_earnings))} icon={Wallet} accent="success" />
            <StatCard title="إجمالي الاستقطاعات" value={formatCurrency(Number(preview.data.totals.total_deductions))} icon={Wallet} accent="warning" />
            <StatCard title="صافي الرواتب" value={formatCurrency(Number(preview.data.totals.net_salary))} icon={Wallet} accent="info" />
          </div>
          <DataTable data={previewRows} columns={cols} emptyTitle="لا توجد بنود رواتب" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => create(false)}>حفظ كمسودة</Button><Button onClick={() => create(true)}>إنشاء وترحيل</Button></div>
        </>
      )}
    </div>
  );
};

export default NewPayrollRun;
