import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { PlanCard } from '@/components/common/PlanCard';
import { Switch } from '@/components/ui/switch';
import { plans as mockPlans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import type { Plan } from '@/types';

interface PlanRow {
  id: string; code: string; name: string;
  price_monthly: string | number; price_yearly: string | number;
  max_users: number; max_invoices_monthly: number;
  features: Record<string, unknown>; is_active: boolean;
}

const fromRow = (r: PlanRow): Plan & { code: string; isActive: boolean } => ({
  id: r.id, name: r.name,
  monthlyPrice: Number(r.price_monthly),
  yearlyPrice: Number(r.price_yearly),
  limits: {
    users: r.max_users, invoices: r.max_invoices_monthly,
    products: Number((r.features as { products?: number })?.products ?? 0),
    reports: 0, notifications: 0,
  },
  features: Array.isArray((r.features as { items?: string[] })?.items)
    ? (r.features as { items: string[] }).items : [],
  popular: Boolean((r.features as { popular?: boolean })?.popular),
  code: r.code, isActive: r.is_active,
});

interface EditState {
  id?: string; code: string; name: string;
  monthly: string; yearly: string; users: string; invoices: string;
}
const emptyEdit: EditState = { code: '', name: '', monthly: '0', yearly: '0', users: '5', invoices: '100' };

const Plans = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const [yearly, setYearly] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EditState>(emptyEdit);

  const q = useQuery({
    enabled: apiOn,
    queryKey: ['admin-plans'],
    queryFn: async () => (await api.get<{ data: PlanRow[] }>('/api/plans/all')).data.map(fromRow),
  });

  const list = apiOn ? (q.data ?? []) : mockPlans.map((p) => ({ ...p, code: p.id, isActive: true }));

  const saveMut = useMutation({
    mutationFn: async (s: EditState) => {
      const body = {
        code: s.code, name: s.name,
        price_monthly: Number(s.monthly), price_yearly: Number(s.yearly),
        max_users: Number(s.users), max_invoices_monthly: Number(s.invoices),
      };
      if (s.id) return api.patch(`/api/plans/${s.id}`, body);
      return api.post('/api/plans', { ...body, features: {}, is_active: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] });
      qc.invalidateQueries({ queryKey: ['public-plans'] });
      toast.success('تم الحفظ');
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر الحفظ'),
  });

  const planList = useMemo(() => list, [list]);

  const editPlan = (p: typeof list[number]) => {
    setDraft({
      id: p.id, code: p.code, name: p.name,
      monthly: String(p.monthlyPrice), yearly: String(p.yearlyPrice),
      users: String(p.limits.users), invoices: String(p.limits.invoices),
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader title="الباقات" description="إدارة باقات الاشتراك"
        actions={<Button onClick={() => { setDraft(emptyEdit); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> باقة جديدة</Button>} />
      <div className="flex items-center gap-3 mb-6 text-sm">
        <span className={!yearly ? 'font-semibold' : 'text-muted-foreground'}>شهري</span>
        <Switch checked={yearly} onCheckedChange={setYearly} />
        <span className={yearly ? 'font-semibold' : 'text-muted-foreground'}>سنوي</span>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {planList.map(p => (
          <PlanCard key={p.id} plan={p} yearly={yearly} cta="تعديل الباقة" onSelect={() => apiOn ? editPlan(p) : toast.message('فعّل API لتعديل الباقات')} />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft.id ? 'تعديل باقة' : 'باقة جديدة'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>الكود</Label><Input className="mt-1.5" value={draft.code} onChange={e => setDraft(s => ({ ...s, code: e.target.value }))} disabled={!!draft.id} /></div>
            <div><Label>الاسم</Label><Input className="mt-1.5" value={draft.name} onChange={e => setDraft(s => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>السعر الشهري</Label><Input type="number" className="mt-1.5" value={draft.monthly} onChange={e => setDraft(s => ({ ...s, monthly: e.target.value }))} /></div>
            <div><Label>السعر السنوي</Label><Input type="number" className="mt-1.5" value={draft.yearly} onChange={e => setDraft(s => ({ ...s, yearly: e.target.value }))} /></div>
            <div><Label>حد المستخدمين</Label><Input type="number" className="mt-1.5" value={draft.users} onChange={e => setDraft(s => ({ ...s, users: e.target.value }))} /></div>
            <div><Label>حد الفواتير/شهر</Label><Input type="number" className="mt-1.5" value={draft.invoices} onChange={e => setDraft(s => ({ ...s, invoices: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Plans;
