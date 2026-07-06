import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatDateShort } from '@/lib/format';
import { CalendarDays, Lock, LockOpen, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { AccountingPeriod, FiscalYear } from './types';

const FiscalYears = () => {
  const qc = useQueryClient();
  const [yearOpen, setYearOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [yearForm, setYearForm] = useState({ name: '', starts_on: '', ends_on: '' });
  const [periodForm, setPeriodForm] = useState({ fiscal_year_id: '', name: '', starts_on: '', ends_on: '' });

  const { data: years = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: async () => (await api.get<{ data: FiscalYear[] }>('/api/accounting/fiscal-years')).data ?? [],
  });
  const { data: periods = [] } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: async () => (await api.get<{ data: AccountingPeriod[] }>('/api/accounting/periods')).data ?? [],
  });

  const createYear = async () => {
    if (!yearForm.name || !yearForm.starts_on || !yearForm.ends_on) return toast.error('أكمل بيانات السنة المالية');
    await api.post('/api/accounting/fiscal-years', yearForm);
    await qc.invalidateQueries({ queryKey: ['fiscal-years'] });
    toast.success('تم إنشاء السنة المالية');
    setYearOpen(false);
    setYearForm({ name: '', starts_on: '', ends_on: '' });
  };

  const createPeriod = async () => {
    if (!periodForm.fiscal_year_id || !periodForm.name || !periodForm.starts_on || !periodForm.ends_on) return toast.error('أكمل بيانات الفترة');
    await api.post('/api/accounting/periods', periodForm);
    await qc.invalidateQueries({ queryKey: ['accounting-periods'] });
    toast.success('تم إنشاء الفترة');
    setPeriodOpen(false);
    setPeriodForm({ fiscal_year_id: '', name: '', starts_on: '', ends_on: '' });
  };

  const togglePeriod = async (period: AccountingPeriod) => {
    await api.post(`/api/accounting/periods/${period.id}/${period.is_locked ? 'unlock' : 'lock'}`);
    await qc.invalidateQueries({ queryKey: ['accounting-periods'] });
    toast.success(period.is_locked ? 'تم فتح الفترة' : 'تم قفل الفترة');
  };

  const yearColumns: Column<FiscalYear>[] = [
    { key: 'name', header: 'السنة', cell: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'start', header: 'من', cell: (r) => formatDateShort(r.starts_on) },
    { key: 'end', header: 'إلى', cell: (r) => formatDateShort(r.ends_on) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge variant={r.is_closed ? 'secondary' : 'default'}>{r.is_closed ? 'مغلقة' : 'مفتوحة'}</Badge> },
  ];

  const periodColumns: Column<AccountingPeriod>[] = [
    { key: 'name', header: 'الفترة', cell: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.fiscal_year_name}</div></div> },
    { key: 'start', header: 'من', cell: (r) => formatDateShort(r.starts_on) },
    { key: 'end', header: 'إلى', cell: (r) => formatDateShort(r.ends_on) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge variant={r.is_locked ? 'destructive' : 'default'}>{r.is_locked ? 'مقفلة' : 'مفتوحة'}</Badge> },
    { key: 'action', header: '', cell: (r) => <Button variant="outline" size="sm" onClick={() => togglePeriod(r)}>{r.is_locked ? <LockOpen className="h-4 w-4 ml-1" /> : <Lock className="h-4 w-4 ml-1" />}{r.is_locked ? 'فتح' : 'قفل'}</Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="السنوات والفترات المالية" description="إدارة السنوات المالية وقفل الفترات المحاسبية" />
      <Card className="p-4 border-border/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4" /> السنوات المالية</h3>
          <Button onClick={() => setYearOpen(true)}><Plus className="h-4 w-4 ml-1" /> سنة جديدة</Button>
        </div>
        <DataTable data={years} columns={yearColumns} emptyTitle="لا توجد سنوات مالية" />
      </Card>
      <Card className="p-4 border-border/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">الفترات المحاسبية</h3>
          <Button variant="outline" onClick={() => setPeriodOpen(true)}><Plus className="h-4 w-4 ml-1" /> فترة جديدة</Button>
        </div>
        <DataTable data={periods} columns={periodColumns} emptyTitle="لا توجد فترات محاسبية" />
      </Card>

      <Dialog open={yearOpen} onOpenChange={setYearOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سنة مالية جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>الاسم</Label><Input className="mt-1.5" value={yearForm.name} onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تبدأ في</Label><Input type="date" className="mt-1.5" value={yearForm.starts_on} onChange={(e) => setYearForm((p) => ({ ...p, starts_on: e.target.value }))} /></div>
              <div><Label>تنتهي في</Label><Input type="date" className="mt-1.5" value={yearForm.ends_on} onChange={(e) => setYearForm((p) => ({ ...p, ends_on: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setYearOpen(false)}>إلغاء</Button><Button onClick={createYear}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>فترة محاسبية جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>السنة المالية</Label>
              <select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={periodForm.fiscal_year_id} onChange={(e) => setPeriodForm((p) => ({ ...p, fiscal_year_id: e.target.value }))}>
                <option value="">اختر السنة</option>
                {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div><Label>الاسم</Label><Input className="mt-1.5" value={periodForm.name} onChange={(e) => setPeriodForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تبدأ في</Label><Input type="date" className="mt-1.5" value={periodForm.starts_on} onChange={(e) => setPeriodForm((p) => ({ ...p, starts_on: e.target.value }))} /></div>
              <div><Label>تنتهي في</Label><Input type="date" className="mt-1.5" value={periodForm.ends_on} onChange={(e) => setPeriodForm((p) => ({ ...p, ends_on: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPeriodOpen(false)}>إلغاء</Button><Button onClick={createPeriod}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FiscalYears;
