import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { accountTypeLabel, normalBalanceLabel, type ChartAccount } from './types';

const empty: Partial<ChartAccount> = {
  code: '',
  name: '',
  type: 'asset',
  normal_balance: 'debit',
  parent_id: null,
  is_active: true,
};

const ChartOfAccounts = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<ChartAccount>>(empty);
  const [saving, setSaving] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [],
  });

  const rows = useMemo(() => data.map((a) => ({
    ...a,
    tree_name: `${a.parent_id ? '   ' : ''}${a.code} - ${a.name}`,
  })), [data]);

  const submit = async () => {
    if (!form.code?.trim()) return toast.error('أدخل كود الحساب');
    if (!form.name?.trim()) return toast.error('أدخل اسم الحساب');
    setSaving(true);
    try {
      const body = {
        parent_id: form.parent_id || null,
        code: form.code,
        name: form.name,
        type: form.type,
        normal_balance: form.normal_balance,
        is_active: form.is_active !== false,
      };
      if (form.id) await api.patch(`/api/accounting/chart-accounts/${form.id}`, body);
      else await api.post('/api/accounting/chart-accounts', body);
      await qc.invalidateQueries({ queryKey: ['chart-accounts'] });
      toast.success('تم حفظ الحساب');
      setOpen(false);
      setForm(empty);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ الحساب');
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<ChartAccount & { tree_name: string }>[] = [
    { key: 'code', header: 'الكود', cell: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'الحساب', cell: (r) => <div><div className="font-medium">{r.name}</div>{r.parent_name && <div className="text-xs text-muted-foreground">تابع لـ {r.parent_code} - {r.parent_name}</div>}</div> },
    { key: 'type', header: 'النوع', cell: (r) => accountTypeLabel(r.type) },
    { key: 'normal', header: 'الطبيعة', cell: (r) => normalBalanceLabel(r.normal_balance) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'نشط' : 'غير نشط'}</Badge> },
    { key: 'actions', header: '', cell: (r) => <Button variant="ghost" size="icon" onClick={() => { setForm(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="دليل الحسابات"
        description="حسابات الأستاذ العام حسب الهيكل الهرمي وطبيعة الرصيد"
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> حساب جديد</Button>}
      />
      <DataTable data={rows} columns={columns} searchKeys={['code', 'name']} emptyTitle="لا توجد حسابات" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? 'تعديل حساب' : 'حساب جديد'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div><Label>كود الحساب</Label><Input className="mt-1.5" value={form.code ?? ''} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} /></div>
            <div><Label>اسم الحساب</Label><Input className="mt-1.5" value={form.name ?? ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div>
              <Label>نوع الحساب</Label>
              <Select value={form.type} onValueChange={(v: ChartAccount['type']) => setForm((p) => ({ ...p, type: v, normal_balance: ['asset', 'expense'].includes(v) ? 'debit' : 'credit' }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{['asset','liability','equity','revenue','expense'].map((t) => <SelectItem key={t} value={t}>{accountTypeLabel(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>الحساب الأب</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  value={form.parent_id ?? '__none__'}
                  onValueChange={(v) => setForm((p) => ({ ...p, parent_id: v === '__none__' ? null : v }))}
                  options={[{ value: '__none__', label: 'بدون حساب أب' }, ...data.filter((a) => a.id !== form.id).map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))]}
                  placeholder="بدون حساب أب"
                  searchPlaceholder="ابحث بالكود أو الاسم..."
                />
              </div>
            </div>
            <div>
              <Label>طبيعة الرصيد</Label>
              <Select value={form.normal_balance} onValueChange={(v: ChartAccount['normal_balance']) => setForm((p) => ({ ...p, normal_balance: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="debit">مدين</SelectItem><SelectItem value="credit">دائن</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 mt-6">
              <Label>نشط</Label>
              <Switch checked={form.is_active !== false} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChartOfAccounts;
