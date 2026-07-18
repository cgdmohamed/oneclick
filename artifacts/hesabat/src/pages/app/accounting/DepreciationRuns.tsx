import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { DepreciationRun } from './types';

const DepreciationRuns = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['depreciation-runs'], queryFn: async () => (await api.get<{ data: DepreciationRun[] }>('/api/fixed-assets/depreciation-runs')).data ?? [] });
  const post = async (run: DepreciationRun) => {
    try {
      await api.post(`/api/fixed-assets/depreciation-runs/${run.id}/post`, {});
      await Promise.all([qc.invalidateQueries({ queryKey: ['depreciation-runs'] }), qc.invalidateQueries({ queryKey: ['fixed-assets'] })]);
      toast.success('تم ترحيل تشغيل الإهلاك');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر ترحيل التشغيل'); }
  };
  const columns: Column<DepreciationRun>[] = [
    { key: 'period', header: 'الفترة', cell: (r) => r.period_name ?? '—' },
    { key: 'date', header: 'تاريخ التشغيل', cell: (r) => formatDateShort(r.run_date) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge>{r.status}</Badge> },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total ?? 0)), className: 'text-end' },
    { key: 'journal', header: 'القيد', cell: (r) => r.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>عرض</Link> : '—' },
    { key: 'action', header: '', cell: (r) => r.status === 'draft' ? <Button size="sm" onClick={(e) => { e.stopPropagation(); post(r); }}>ترحيل</Button> : null },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="تشغيلات الإهلاك" description="حساب وترحيل إهلاك الأصول للفترات المحاسبية" actions={<Button onClick={() => navigate('/app/accounting/depreciation-runs/new')}><Plus className="h-4 w-4 ml-1" /> تشغيل جديد</Button>} />
      <DataTable data={data} columns={columns} emptyTitle="لا توجد تشغيلات إهلاك" />
    </div>
  );
};

export default DepreciationRuns;
