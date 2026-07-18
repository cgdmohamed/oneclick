import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { ArrowRight, Calculator, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { AccountingPeriod, DepreciationRun, DepreciationRunLine } from './types';

interface Preview { period: AccountingPeriod; lines: DepreciationRunLine[]; total: number | string }

const NewDepreciationRun = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [periodId, setPeriodId] = useState('');
  const periods = useQuery({ queryKey: ['accounting-periods'], queryFn: async () => (await api.get<{ data: AccountingPeriod[] }>('/api/accounting/periods')).data ?? [] });
  const preview = useQuery({ enabled: !!periodId, queryKey: ['depreciation-preview', periodId], queryFn: async () => (await api.get<{ data: Preview }>(`/api/fixed-assets/depreciation/preview?period_id=${periodId}`)).data });
  const create = async (post: boolean) => {
    try {
      const res = await api.post<{ data: DepreciationRun }>('/api/fixed-assets/depreciation-runs', { period_id: periodId, post });
      await Promise.all([qc.invalidateQueries({ queryKey: ['depreciation-runs'] }), qc.invalidateQueries({ queryKey: ['fixed-assets'] })]);
      toast.success(post ? 'تم إنشاء وترحيل الإهلاك' : 'تم حفظ تشغيل الإهلاك كمسودة');
      navigate('/app/accounting/depreciation-runs');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء التشغيل'); }
  };
  const previewRows = (preview.data?.lines ?? []).map((line, idx) => ({ ...line, id: line.id ?? `${line.asset_id}-${idx}` }));
  const cols: Column<DepreciationRunLine & { id: string }>[] = [
    { key: 'asset', header: 'الأصل', cell: (r) => `${r.asset_code ?? ''} ${r.asset_name ?? ''}`.trim() },
    { key: 'category', header: 'التصنيف', cell: (r: any) => r.category_name ?? '—' },
    { key: 'amount', header: 'الإهلاك', cell: (r) => formatCurrency(Number(r.depreciation_amount)), className: 'text-end' },
    { key: 'acc', header: 'المجمع بعد التشغيل', cell: (r) => formatCurrency(Number(r.accumulated_depreciation_after)), className: 'text-end' },
  ];
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/depreciation-runs" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للتشغيلات</Link>
      <PageHeader title="تشغيل إهلاك جديد" description="معاينة إهلاك الفترة قبل إنشاء القيد" />
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-sm text-muted-foreground">الفترة المحاسبية</label>
            <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">اختر الفترة</option>
              {(periods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.fiscal_year_name} - {p.name} ({formatDateShort(p.starts_on)} / {formatDateShort(p.ends_on)})</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={() => preview.refetch()} disabled={!periodId}><Calculator className="h-4 w-4 ml-1" /> تحديث المعاينة</Button>
        </div>
      </Card>
      {preview.data && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <StatCard title="عدد الأصول" value={preview.data.lines.length} icon={Calculator} accent="info" />
            <StatCard title="إجمالي الإهلاك" value={formatCurrency(Number(preview.data.total))} icon={Wallet} accent="warning" />
          </div>
          <DataTable data={previewRows} columns={cols} emptyTitle="لا توجد أصول قابلة للإهلاك في هذه الفترة" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => create(false)} disabled={!preview.data.lines.length}>حفظ كمسودة</Button>
            <Button onClick={() => create(true)} disabled={!preview.data.lines.length}>إنشاء وترحيل</Button>
          </div>
        </>
      )}
    </div>
  );
};

export default NewDepreciationRun;
