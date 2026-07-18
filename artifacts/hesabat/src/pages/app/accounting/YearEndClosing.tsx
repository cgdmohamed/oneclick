import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { AlertTriangle, CheckCircle2, FileText, Lock, Scale, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { FiscalYear, JournalEntry } from './types';

interface ClosingLine {
  account_id: string;
  account_code?: string;
  account_name?: string;
  description: string;
  debit: number | string;
  credit: number | string;
}

interface ClosingPreview {
  fiscal_year: FiscalYear;
  totals: { revenue: string | number; expenses: string | number; net_income: string | number; debit: string | number; credit: string | number };
  lines: ClosingLine[];
  blockers: string[];
  can_create: boolean;
  existing_closing: { id: string; number: string } | null;
}

const YearEndClosing = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [yearId, setYearId] = useState('');
  const { data: years = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: async () => (await api.get<{ data: FiscalYear[] }>('/api/accounting/fiscal-years')).data ?? [],
  });
  const selectedYearId = yearId || years[0]?.id || '';
  const { data: preview, refetch } = useQuery({
    enabled: !!selectedYearId,
    queryKey: ['year-end-closing-preview', selectedYearId],
    queryFn: async () => (await api.get<{ data: ClosingPreview }>(`/api/accounting/closing/${selectedYearId}/preview`)).data,
  });
  const rows = useMemo(() => (preview?.lines ?? []).map((line, idx) => ({ id: `${line.account_id}-${idx}`, ...line })), [preview]);

  const createClosing = async () => {
    if (!selectedYearId) return;
    try {
      const res = await api.post<{ data: JournalEntry }>(`/api/accounting/closing/${selectedYearId}/create`, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['year-end-closing-preview', selectedYearId] }),
        qc.invalidateQueries({ queryKey: ['journal-entries'] }),
        qc.invalidateQueries({ queryKey: ['fiscal-years'] }),
      ]);
      toast.success('تم إنشاء قيد الإقفال');
      navigate(`/app/accounting/journals/${res.data.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء قيد الإقفال');
    }
  };

  const lockYear = async () => {
    if (!selectedYearId) return;
    try {
      await api.post(`/api/accounting/closing/${selectedYearId}/lock`, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['year-end-closing-preview', selectedYearId] }),
        qc.invalidateQueries({ queryKey: ['fiscal-years'] }),
      ]);
      await refetch();
      toast.success('تم قفل السنة المالية');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر قفل السنة المالية');
    }
  };

  const columns: Column<ClosingLine & { id: string }>[] = [
    { key: 'account', header: 'الحساب', cell: (r) => `${r.account_code ?? ''} ${r.account_name ?? ''}`.trim() },
    { key: 'description', header: 'البيان', cell: (r) => r.description },
    { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
    { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="إقفال نهاية السنة" description="إقفال حسابات الإيرادات والمصروفات في الأرباح المبقاة" />
      <Alert className="border-warning/40 bg-warning/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>راجع الإقفال مع المحاسب قبل الترحيل</AlertTitle>
        <AlertDescription>سيتم إنشاء قيد يومية مرحل يصفّر أرصدة الإيرادات والمصروفات للسنة المختارة. لا يتم حذف بيانات التقارير التاريخية.</AlertDescription>
      </Alert>
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-sm text-muted-foreground">السنة المالية</label>
            <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedYearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name} - {formatDateShort(year.starts_on)} / {formatDateShort(year.ends_on)}</option>)}
            </select>
          </div>
          <div>{preview?.fiscal_year.is_closed ? <Badge variant="secondary">مغلقة</Badge> : <Badge>مفتوحة</Badge>}</div>
          {preview?.existing_closing ? <Button variant="outline" onClick={() => navigate(`/app/accounting/journals/${preview.existing_closing!.id}`)}><FileText className="h-4 w-4 ml-1" /> عرض قيد الإقفال</Button> : null}
        </div>
      </Card>
      {preview && (
        <>
          <div className="grid sm:grid-cols-4 gap-4">
            <StatCard title="الإيرادات" value={formatCurrency(Number(preview.totals.revenue))} icon={Wallet} accent="success" />
            <StatCard title="المصروفات" value={formatCurrency(Number(preview.totals.expenses))} icon={Wallet} accent="warning" />
            <StatCard title="صافي الربح / الخسارة" value={formatCurrency(Number(preview.totals.net_income))} icon={Scale} accent={Number(preview.totals.net_income) >= 0 ? 'success' : 'destructive'} />
            <StatCard title="توازن القيد" value={`${formatCurrency(Number(preview.totals.debit))} / ${formatCurrency(Number(preview.totals.credit))}`} icon={CheckCircle2} accent="info" />
          </div>
          {preview.blockers.length > 0 && (
            <Alert className="border-destructive/40 bg-destructive/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>لا يمكن إنشاء قيد الإقفال الآن</AlertTitle>
              <AlertDescription>{preview.blockers.join(' · ')}</AlertDescription>
            </Alert>
          )}
          <DataTable data={rows} columns={columns} emptyTitle="لا توجد أرصدة إيرادات أو مصروفات للإقفال" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={createClosing} disabled={!preview.can_create}>إنشاء قيد الإقفال</Button>
            <Button variant="outline" onClick={lockYear} disabled={!preview.fiscal_year.closing_journal_entry_id || preview.fiscal_year.is_closed}><Lock className="h-4 w-4 ml-1" /> قفل السنة المالية</Button>
            {preview.fiscal_year.closing_journal_entry_id && <Button variant="ghost" asChild><Link to={`/app/accounting/journals/${preview.fiscal_year.closing_journal_entry_id}`}>عرض القيد</Link></Button>}
          </div>
        </>
      )}
    </div>
  );
};

export default YearEndClosing;
