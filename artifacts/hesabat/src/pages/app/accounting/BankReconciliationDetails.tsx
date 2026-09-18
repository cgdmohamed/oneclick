import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { printElementOnly } from '@/lib/print';
import { ArrowRight, CheckCircle2, FileText, Landmark, Plus, Printer, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { BankJournalLine, BankReconciliation, BankStatementLine } from './types';

const emptyLine = { transaction_date: new Date().toISOString().slice(0, 10), description: '', debit_amount: '', credit_amount: '', reference: '' };
const emptyAdjustment = { type: 'bank_charge', date: new Date().toISOString().slice(0, 10), amount: '', description: '', reference: '' };

const BankReconciliationDetails = () => {
  const { id } = useParams();
  const qc = useQueryClient();
  const [selectedLineId, setSelectedLineId] = useState('');
  const [lineOpen, setLineOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [lineForm, setLineForm] = useState(emptyLine);
  const [csv, setCsv] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [adjustment, setAdjustment] = useState(emptyAdjustment);
  const { data: rec } = useQuery({
    enabled: !!id,
    queryKey: ['bank-reconciliation', id],
    queryFn: async () => (await api.get<{ data: BankReconciliation }>(`/api/bank-reconciliations/${id}`)).data,
  });
  const { data: suggestions } = useQuery({
    enabled: !!id && !!selectedLineId,
    queryKey: ['bank-reconciliation-suggestions', id, selectedLineId],
    queryFn: async () => (await api.get<{ data: BankJournalLine[] }>(`/api/bank-reconciliations/${id}/lines/${selectedLineId}/suggestions`)).data,
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['bank-reconciliation', id] }),
      qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }),
      qc.invalidateQueries({ queryKey: ['bank-reconciliation-suggestions', id] }),
    ]);
  };

  const addLine = async () => {
    try {
      await api.post(`/api/bank-reconciliations/${id}/lines`, {
        lines: [{
          ...lineForm,
          debit_amount: Number(lineForm.debit_amount || 0),
          credit_amount: Number(lineForm.credit_amount || 0),
          reference: lineForm.reference || null,
        }],
      });
      setLineForm(emptyLine); setLineOpen(false); await refresh(); toast.success('تمت إضافة بند كشف البنك');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إضافة البند'); }
  };

  const importCsv = async () => {
    try {
      const res = await api.post<{ imported: number }>(`/api/bank-reconciliations/${id}/import-csv`, { csv });
      setCsv(''); setCsvFileName(''); setCsvOpen(false); await refresh(); toast.success(`تم استيراد ${res.imported ?? 0} بند`);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر استيراد CSV'); }
  };

  const pickCsvFile = (file: File | undefined) => {
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  };

  const match = async (journalLineId: string) => {
    if (!selectedLineId) return toast.error('اختر بند كشف بنك أولاً');
    try {
      await api.post(`/api/bank-reconciliations/${id}/lines/${selectedLineId}/match`, { journal_line_id: journalLineId });
      setSelectedLineId(''); await refresh(); toast.success('تمت المطابقة');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر المطابقة'); }
  };

  const unmatch = async (lineId: string) => {
    try {
      await api.post(`/api/bank-reconciliations/${id}/lines/${lineId}/unmatch`, {});
      await refresh(); toast.success('تم فك المطابقة');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر فك المطابقة'); }
  };

  const createAdjustment = async () => {
    try {
      await api.post(`/api/bank-reconciliations/${id}/adjustments`, { ...adjustment, amount: Number(adjustment.amount || 0), reference: adjustment.reference || null });
      setAdjustment(emptyAdjustment); setAdjustOpen(false); await refresh(); toast.success('تم إنشاء قيد التسوية');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء قيد التسوية'); }
  };

  const complete = async (allowDifference = false) => {
    try {
      await api.post(`/api/bank-reconciliations/${id}/complete`, { allow_difference: allowDifference });
      await refresh(); toast.success('تم إكمال تسوية البنك');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إكمال التسوية'); }
  };

  const selectedLine = useMemo(() => (rec?.lines ?? []).find((line) => line.id === selectedLineId), [rec?.lines, selectedLineId]);

  if (!rec) return <div className="p-6 text-muted-foreground">جار التحميل...</div>;
  const draft = rec.status === 'draft';
  const summary = rec.summary;
  const difference = Number(summary?.unreconciled_difference ?? 0);

  const statementColumns: Column<BankStatementLine>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.transaction_date) },
    { key: 'description', header: 'الوصف', cell: (r) => <div><div>{r.description}</div><div className="text-xs text-muted-foreground">{r.reference ?? '—'}</div></div> },
    { key: 'debit', header: 'مدين البنك', cell: (r) => formatCurrency(Number(r.debit_amount)), className: 'text-end' },
    { key: 'credit', header: 'دائن البنك', cell: (r) => formatCurrency(Number(r.credit_amount)), className: 'text-end' },
    { key: 'match', header: 'المطابقة', cell: (r) => r.is_matched ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>{r.journal_number}</Link> : 'غير مطابق' },
    { key: 'actions', header: '', cell: (r) => draft ? (r.is_matched ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); unmatch(r.id); }}>فك</Button> : <Button size="sm" variant={selectedLineId === r.id ? 'default' : 'outline'} onClick={(e) => { e.stopPropagation(); setSelectedLineId(r.id); }}>اختر</Button>) : null },
  ];

  const journalColumns: Column<BankJournalLine>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.entry_date) },
    { key: 'number', header: 'القيد', cell: (r) => <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>{r.journal_number}</Link> },
    { key: 'desc', header: 'البيان', cell: (r) => r.description ?? r.memo ?? '—' },
    { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
    { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
    { key: 'action', header: '', cell: (r) => draft ? <Button size="sm" disabled={!selectedLineId} onClick={() => match(r.id)}>مطابقة</Button> : null },
  ];

  return (
    <div className="space-y-5">
      <Link to="/app/accounting/bank-reconciliations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة لتسويات البنك</Link>
      <PageHeader
        title={`تسوية بنك - ${rec.account_name ?? ''}`}
        description={`${formatDateShort(rec.statement_date)} · ${rec.status}`}
        actions={<div className="flex flex-wrap gap-2">{draft && <><Button variant="outline" onClick={() => setLineOpen(true)}><Plus className="h-4 w-4 ml-1" /> بند كشف</Button><Button variant="outline" onClick={() => setCsvOpen(true)}><Upload className="h-4 w-4 ml-1" /> CSV</Button><Button variant="outline" onClick={() => setAdjustOpen(true)}>قيد تسوية</Button><Button onClick={() => complete(false)}><CheckCircle2 className="h-4 w-4 ml-1" /> إكمال</Button>{Math.abs(difference) > 0.005 && <Button variant="secondary" onClick={() => complete(true)}>إكمال مع فرق</Button>}</>}<Button variant="outline" onClick={printElementOnly}><Printer className="h-4 w-4 ml-1" /> طباعة</Button></div>}
      />
      <div data-print-area className="print-area space-y-5">
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">تسوية بنك - {rec.account_name ?? ''}</h1>
        <p className="text-sm text-muted-foreground">{formatDateShort(rec.statement_date)} · {rec.status}</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <StatCard title="رصيد كشف البنك" value={formatCurrency(Number(rec.closing_balance))} icon={Landmark} accent="info" />
        <StatCard title="رصيد النظام البنكي" value={formatCurrency(Number(summary?.system_bank_balance ?? 0))} icon={FileText} accent="success" />
        <StatCard title="فرق التسوية" value={formatCurrency(difference)} icon={CheckCircle2} accent={Math.abs(difference) <= 0.005 ? 'success' : 'warning'} />
      </div>
      <Card className="p-4 border-border/60">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground">الحالة</div><Badge className="mt-1">{rec.status}</Badge></div>
          <div><div className="text-muted-foreground">الرصيد الافتتاحي</div><div className="font-semibold">{rec.opening_balance == null ? '—' : formatCurrency(Number(rec.opening_balance))}</div></div>
          <div><div className="text-muted-foreground">حركة الكشف</div><div className="font-semibold">{formatCurrency(Number(summary?.statement_movement ?? 0))}</div></div>
          <div><div className="text-muted-foreground">البنود المطابقة</div><div className="font-semibold">{summary?.matched_count ?? 0}/{summary?.line_count ?? 0}</div></div>
        </div>
        {selectedLine && <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-sm">البند المختار للمطابقة: {selectedLine.description} · {formatCurrency(Number(selectedLine.credit_amount || 0) || Number(selectedLine.debit_amount || 0))}</div>}
      </Card>
      <section className="space-y-3">
        <h2 className="font-semibold">بنود كشف البنك</h2>
        <DataTable data={rec.lines ?? []} columns={statementColumns} pageSize={25} emptyTitle="لا توجد بنود كشف بنك" />
      </section>
      {selectedLine && (
        <section className="space-y-3 no-print">
          <h2 className="font-semibold">اقتراحات المطابقة</h2>
          {(suggestions ?? []).length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">لا توجد قيود بنفس المبلغ لاقتراح مطابقتها تلقائيًا — اختر من الجدول أدناه يدويًا.</Card>
          ) : (
            <DataTable data={suggestions ?? []} columns={journalColumns} pageSize={10} emptyTitle="لا توجد اقتراحات" />
          )}
        </section>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">قيود البنك غير المطابقة</h2>
        <DataTable data={rec.unmatched_journal_lines ?? []} columns={journalColumns} pageSize={25} emptyTitle="لا توجد قيود غير مطابقة" />
      </section>
      </div>

      <Dialog open={lineOpen} onOpenChange={setLineOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة بند كشف بنك</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={lineForm.transaction_date} onChange={(e) => setLineForm((p) => ({ ...p, transaction_date: e.target.value }))} /></div>
          <div><Label>الوصف</Label><Input className="mt-1.5" value={lineForm.description} onChange={(e) => setLineForm((p) => ({ ...p, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>مدين البنك</Label><Input className="mt-1.5" type="number" value={lineForm.debit_amount} onChange={(e) => setLineForm((p) => ({ ...p, debit_amount: e.target.value }))} /></div><div><Label>دائن البنك</Label><Input className="mt-1.5" type="number" value={lineForm.credit_amount} onChange={(e) => setLineForm((p) => ({ ...p, credit_amount: e.target.value }))} /></div></div>
          <div><Label>المرجع</Label><Input className="mt-1.5" value={lineForm.reference} onChange={(e) => setLineForm((p) => ({ ...p, reference: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setLineOpen(false)}>إلغاء</Button><Button onClick={addLine}>إضافة</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={csvOpen} onOpenChange={(open) => { setCsvOpen(open); if (!open) { setCsv(''); setCsvFileName(''); } }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>استيراد كشف بنك (CSV)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ملف الكشف</Label>
            <Input className="mt-1.5" type="file" accept=".csv,text/csv" onChange={(e) => pickCsvFile(e.target.files?.[0])} />
            {csvFileName && <p className="text-xs text-muted-foreground mt-1">تم اختيار: {csvFileName}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            الأعمدة المتوقعة (بأي ترتيب للعناوين، يتم اكتشافها تلقائيًا إن وُجد صف عناوين): التاريخ، الوصف، مدين، دائن، المرجع.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">أو الصق نص CSV مباشرة</summary>
            <Textarea className="mt-2 min-h-32 font-mono text-xs" value={csv} onChange={(e) => { setCsv(e.target.value); setCsvFileName(''); }} placeholder={'transaction_date,description,debit_amount,credit_amount,reference\n2026-07-01,Bank fee,25,0,FEE-1'} />
          </details>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setCsvOpen(false)}>إلغاء</Button><Button onClick={importCsv} disabled={!csv}>استيراد</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>قيد تسوية بنكية</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>النوع</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={adjustment.type} onChange={(e) => setAdjustment((p) => ({ ...p, type: e.target.value }))}><option value="bank_charge">مصروفات بنكية</option><option value="bank_interest">فوائد بنكية</option></select></div>
          <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={adjustment.date} onChange={(e) => setAdjustment((p) => ({ ...p, date: e.target.value }))} /></div>
          <div><Label>المبلغ</Label><Input className="mt-1.5" type="number" value={adjustment.amount} onChange={(e) => setAdjustment((p) => ({ ...p, amount: e.target.value }))} /></div>
          <div><Label>الوصف</Label><Input className="mt-1.5" value={adjustment.description} onChange={(e) => setAdjustment((p) => ({ ...p, description: e.target.value }))} /></div>
          <div><Label>المرجع</Label><Input className="mt-1.5" value={adjustment.reference} onChange={(e) => setAdjustment((p) => ({ ...p, reference: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setAdjustOpen(false)}>إلغاء</Button><Button onClick={createAdjustment}>إنشاء القيد</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};

export default BankReconciliationDetails;
