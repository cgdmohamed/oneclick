import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import type { PayrollRun, PayrollRunLine } from './types';

interface Account { id: string; name: string }

const PayrollRunDetails = () => {
  const { id } = useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const { data: run } = useQuery({ enabled: !!id, queryKey: ['payroll-run', id], queryFn: async () => (await api.get<{ data: PayrollRun }>(`/api/payroll/runs/${id}`)).data });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: async () => (await api.get<{ data: Account[] }>('/api/accounts?page_size=300')).data ?? [] });
  if (!run) return <div className="p-6 text-muted-foreground">جار التحميل...</div>;
  const post = async () => { try { await api.post(`/api/payroll/runs/${run.id}/post`, {}); await qc.invalidateQueries({ queryKey: ['payroll-run', id] }); toast.success('تم ترحيل الرواتب'); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر الترحيل'); } };
  const pay = async () => { try { await api.post(`/api/payroll/runs/${run.id}/pay`, { account_id: accountId, paid_at: new Date().toISOString() }); await qc.invalidateQueries({ queryKey: ['payroll-run', id] }); setPayOpen(false); toast.success('تم دفع الرواتب'); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر الدفع'); } };
  const cancel = async () => {
    if (!confirm('سيتم عكس قيد الرواتب' + (run.payment_journal_entry_id ? ' وقيد الدفع' : '') + '. هل أنت متأكد؟')) return;
    try { await api.post(`/api/payroll/runs/${run.id}/cancel`, {}); await qc.invalidateQueries({ queryKey: ['payroll-run', id] }); toast.success('تم إلغاء تشغيل الرواتب'); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر الإلغاء'); }
  };
  const cols: Column<PayrollRunLine>[] = [
    { key: 'employee', header: 'الموظف', cell: (r) => `${r.employee_code ?? ''} ${r.employee_name ?? ''}`.trim() },
    { key: 'basic', header: 'الأساسي', cell: (r) => formatCurrency(Number(r.basic_salary)), className: 'text-end' },
    { key: 'earn', header: 'الاستحقاقات', cell: (r) => formatCurrency(Number(r.total_earnings)), className: 'text-end' },
    { key: 'ded', header: 'الاستقطاعات', cell: (r) => formatCurrency(Number(r.total_deductions)), className: 'text-end' },
    { key: 'net', header: 'الصافي', cell: (r) => formatCurrency(Number(r.net_salary)), className: 'text-end' },
    { key: 'components', header: 'التفاصيل', cell: (r) => <span className="text-xs text-muted-foreground">{(r.components ?? []).map((c) => `${c.name}: ${formatCurrency(Number(c.amount))}`).join(' · ') || '—'}</span> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={`رواتب ${run.period_year}-${String(run.period_month).padStart(2, '0')}`} description={run.status}
        actions={<div className="flex gap-2">{run.status === 'draft' && <Button onClick={post}>ترحيل</Button>}{run.status === 'posted' && <Button onClick={() => setPayOpen(true)}>دفع الرواتب</Button>}{(run.status === 'posted' || run.status === 'paid') && <Button variant="destructive" onClick={cancel}>إلغاء التشغيل</Button>}{run.journal_entry_id && <Button variant="outline" asChild><Link to={`/app/accounting/journals/${run.journal_entry_id}`}>عرض قيد الرواتب</Link></Button>}{run.payment_journal_entry_id && <Button variant="outline" asChild><Link to={`/app/accounting/journals/${run.payment_journal_entry_id}`}>عرض قيد الدفع</Link></Button>}</div>} />
      <Card className="p-4 border-border/60 text-sm">صافي الرواتب: <span className="font-semibold">{formatCurrency((run.lines ?? []).reduce((s, l) => s + Number(l.net_salary), 0))}</span></Card>
      <DataTable data={run.lines ?? []} columns={cols} emptyTitle="لا توجد بنود رواتب" />
      <Dialog open={payOpen} onOpenChange={setPayOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>دفع الرواتب</DialogTitle></DialogHeader>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">اختر حساب الدفع</option>{(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <DialogFooter><Button variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button><Button onClick={pay}>دفع</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};

export default PayrollRunDetails;
