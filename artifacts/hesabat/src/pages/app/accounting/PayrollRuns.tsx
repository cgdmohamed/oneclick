import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus } from 'lucide-react';
import type { PayrollRun } from './types';

const PayrollRuns = () => {
  const navigate = useNavigate();
  const { data = [] } = useQuery({ queryKey: ['payroll-runs'], queryFn: async () => (await api.get<{ data: PayrollRun[] }>('/api/payroll/runs')).data ?? [] });
  const cols: Column<PayrollRun>[] = [
    { key: 'period', header: 'الفترة', cell: (r) => <Link className="text-primary font-medium" to={`/app/accounting/payroll-runs/${r.id}`}>{r.period_year}-{String(r.period_month).padStart(2, '0')}</Link> },
    { key: 'date', header: 'تاريخ التشغيل', cell: (r) => formatDateShort(r.run_date) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge>{r.status}</Badge> },
    { key: 'employees', header: 'الموظفون', cell: (r) => r.employee_count ?? 0 },
    { key: 'net', header: 'صافي الرواتب', cell: (r) => formatCurrency(Number(r.net_total ?? 0)), className: 'text-end' },
    { key: 'journal', header: 'القيد', cell: (r) => r.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>عرض</Link> : '—' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="تشغيلات الرواتب" description="إنشاء وترحيل ودفع رواتب الموظفين" actions={<Button onClick={() => navigate('/app/accounting/payroll-runs/new')}><Plus className="h-4 w-4 ml-1" /> تشغيل جديد</Button>} />
      <DataTable data={data} columns={cols} emptyTitle="لا توجد تشغيلات رواتب" onRowClick={(r) => navigate(`/app/accounting/payroll-runs/${r.id}`)} />
    </div>
  );
};

export default PayrollRuns;
