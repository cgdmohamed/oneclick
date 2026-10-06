import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { toast } from 'sonner';
import type { ChartAccount, JournalEntry } from './types';

interface LineForm {
  account_id: string;
  description: string;
  debit: string;
  credit: string;
  branch_id: string;
  cost_center_id: string;
}

interface DimensionRow {
  id: string;
  code: string | null;
  name: string;
  is_active: boolean;
}

const blankLine = (): LineForm => ({ account_id: '', description: '', debit: '', credit: '', branch_id: '', cost_center_id: '' });

const NewJournalEntry = () => {
  const navigate = useNavigate();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [status, setStatus] = useState<'draft' | 'posted'>('draft');
  const [branchId, setBranchId] = useState('');
  const [lines, setLines] = useState<LineForm[]>([blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);
  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [],
  });
  const activeAccounts = accounts.filter((a) => a.is_active);
  // Query keys deliberately distinct from the canonical Branches.tsx/
  // CostCenters.tsx caches — these fetch raw snake_case rows (`is_active`
  // instead of `isActive`); sharing a key let whichever query ran last
  // silently overwrite the other's cache shape, breaking `.is_active` filters.
  const { data: branches = [] } = useQuery({
    queryKey: ['branches-picker'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/branches?page_size=200')).data ?? [],
  });
  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers-picker'],
    queryFn: async () => (await api.get<{ data: DimensionRow[] }>('/api/cost-centers?page_size=200')).data ?? [],
  });
  const activeBranches = branches.filter((b) => b.is_active);
  const activeCostCenters = costCenters.filter((c) => c.is_active);
  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
    const credit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
    return { debit, credit, diff: debit - credit };
  }, [lines]);
  const updateLine = (idx: number, patch: Partial<LineForm>) => setLines((prev) => prev.map((line, i) => i === idx ? { ...line, ...patch } : line));
  const submit = async () => {
    const validLines = lines.filter((l) => l.account_id && (Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0));
    if (validLines.length < 2) return toast.error('أضف سطرين على الأقل');
    if (Math.abs(totals.diff) > 0.005) return toast.error('القيد غير متوازن');
    setSaving(true);
    try {
      const res = await api.post<{ data: JournalEntry }>('/api/accounting/journal-entries', {
        entry_date: entryDate,
        memo: memo || null,
        status,
        branch_id: branchId || null,
        lines: validLines.map((l) => ({
          account_id: l.account_id,
          description: l.description || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          branch_id: l.branch_id || branchId || null,
          cost_center_id: l.cost_center_id || null,
        })),
      });
      toast.success(status === 'posted' ? 'تم إنشاء وترحيل القيد' : 'تم حفظ المسودة');
      navigate(`/app/accounting/journals/${res.data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ القيد');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/journals" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للقيود</Link>
      <PageHeader title="قيد يومية يدوي" description="أدخل سطور القيد وتأكد من تساوي المدين والدائن" />
      <Card className="p-4 border-border/60">
        <div className="grid sm:grid-cols-4 gap-4">
          <div><Label>تاريخ القيد</Label><Input className="mt-1.5" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
          <div><Label>الحالة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'posted')}><option value="draft">مسودة</option><option value="posted">ترحيل مباشر</option></select></div>
          <div><Label>الفرع</Label><div className="mt-1.5"><SearchableSelect value={branchId} onValueChange={setBranchId} placeholder="بدون فرع" options={activeBranches.map((b) => ({ value: b.id, label: b.code ? `${b.code} - ${b.name}` : b.name }))} /></div></div>
          <div><Label>الفرق</Label><div className={`mt-1.5 h-10 rounded-md border px-3 flex items-center font-semibold ${Math.abs(totals.diff) > 0.005 ? 'text-destructive' : 'text-success'}`}>{formatCurrency(totals.diff)}</div></div>
        </div>
        <div className="mt-4"><Label>البيان</Label><Textarea className="mt-1.5" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} /></div>
      </Card>
      <Card className="p-4 border-border/60 space-y-3">
        {lines.map((line, idx) => (
          <div key={idx} className="grid lg:grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end">
            <div><Label>الحساب</Label><div className="mt-1.5"><SearchableSelect value={line.account_id} onValueChange={(v) => updateLine(idx, { account_id: v })} placeholder="اختر حساباً" options={activeAccounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))} /></div></div>
            <div><Label>الوصف</Label><Input className="mt-1.5" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} /></div>
            <div><Label>مدين</Label><Input className="mt-1.5" type="number" min="0" step="0.01" value={line.debit} onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} /></div>
            <div><Label>دائن</Label><Input className="mt-1.5" type="number" min="0" step="0.01" value={line.credit} onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} /></div>
            <div><Label>فرع السطر</Label><div className="mt-1.5"><SearchableSelect value={line.branch_id} onValueChange={(v) => updateLine(idx, { branch_id: v })} placeholder="فرع القيد" options={activeBranches.map((b) => ({ value: b.id, label: b.name }))} /></div></div>
            <div><Label>مركز التكلفة</Label><div className="mt-1.5"><SearchableSelect value={line.cost_center_id} onValueChange={(v) => updateLine(idx, { cost_center_id: v })} placeholder="بدون مركز" options={activeCostCenters.map((c) => ({ value: c.id, label: c.name }))} /></div></div>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} disabled={lines.length <= 2}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setLines((prev) => [...prev, blankLine()])}><Plus className="h-4 w-4 ml-1" /> إضافة سطر</Button>
      </Card>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">مدين: {formatCurrency(totals.debit)} · دائن: {formatCurrency(totals.credit)}</div>
        <Button onClick={submit} disabled={saving || Math.abs(totals.diff) > 0.005}>{saving ? 'جار الحفظ...' : 'حفظ القيد'}</Button>
      </div>
    </div>
  );
};

export default NewJournalEntry;
