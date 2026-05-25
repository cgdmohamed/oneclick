import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { PlanCard } from '@/components/common/PlanCard';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { plans as mockPlans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import type { Plan } from '@/types';
import { PLAN_FEATURES, DEFAULT_PLAN_FEATURES } from '@/lib/planFeatures';
import { usePlanAccessStore, useSetPlanAccess } from '@/hooks/usePlanAccess';

interface PlanRow {
  id: string; code: string; name: string;
  price_monthly: string | number; price_yearly: string | number;
  max_users: number; max_invoices_monthly: number;
  features: Record<string, unknown>; is_active: boolean;
  active_subscriber_count?: string | number;
}

const fromRow = (r: PlanRow): Plan & { code: string; isActive: boolean; activeSubscriberCount: number; accessFeatures: string[] } => ({
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
  accessFeatures: Array.isArray((r.features as { access?: string[] })?.access)
    ? (r.features as { access: string[] }).access : [],
  popular: Boolean((r.features as { popular?: boolean })?.popular),
  code: r.code, isActive: r.is_active,
  activeSubscriberCount: Number(r.active_subscriber_count ?? 0),
});

interface EditState {
  id?: string; code: string; name: string;
  monthly: string; yearly: string; users: string; invoices: string;
  features: string[]; items: string; popular: boolean;
}
const emptyEdit: EditState = {
  code: '', name: '', monthly: '0', yearly: '0', users: '5', invoices: '100',
  features: [], items: '', popular: false,
};

const Plans = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const [yearly, setYearly] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EditState>(emptyEdit);
  const [hasPlans, setHasPlans] = useState<boolean | null>(null);
  const accessStore = usePlanAccessStore();
  const setAccess = useSetPlanAccess();

  const [deleteTarget, setDeleteTarget] = useState<(Plan & { code: string; isActive: boolean; activeSubscriberCount: number }) | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!apiOn) return;
    api.get<{ hasPlans: boolean }>('/api/platform/plans/health')
      .then(r => setHasPlans(r.hasPlans))
      .catch(() => setHasPlans(null));
  }, [apiOn]);

  const q = useQuery({
    enabled: apiOn,
    queryKey: ['admin-plans'],
    queryFn: async () => (await api.get<{ data: PlanRow[] }>('/api/plans/all')).data.map(fromRow),
  });

  const baseList = apiOn ? (q.data ?? []) : mockPlans.map((p) => ({ ...p, code: p.id, isActive: true, activeSubscriberCount: 0 }));

  const list = useMemo(() => baseList.map((p) => {
    const a = accessStore[p.id];
    if (!a) return p;
    return {
      ...p,
      features: a.items?.length ? a.items : p.features,
      popular: a.popular ?? p.popular,
    };
  }), [baseList, accessStore]);

  const saveMut = useMutation({
    mutationFn: async (s: EditState) => {
      const items = s.items.split('\n').map(x => x.trim()).filter(Boolean);
      const body = {
        code: s.code, name: s.name,
        price_monthly: Number(s.monthly), price_yearly: Number(s.yearly),
        max_users: Number(s.users), max_invoices_monthly: Number(s.invoices),
        features: { items, popular: s.popular, access: s.features },
      };
      const planId = s.id ?? `plan-${s.code || Date.now()}`;
      setAccess(planId, { features: s.features, items, popular: s.popular });
      if (!apiOn) return planId;
      if (s.id) return api.patch(`/api/plans/${s.id}`, body);
      return api.post('/api/plans', { ...body, is_active: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] });
      qc.invalidateQueries({ queryKey: ['public-plans'] });
      toast.success('تم الحفظ وتطبيق الصلاحيات على المشتركين');
      setOpen(false);
      setHasPlans(true);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر الحفظ'),
  });

  const deleteMut = useMutation({
    mutationFn: async (planId: string) => {
      if (!apiOn) return;
      return api.delete(`/api/plans/${planId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] });
      qc.invalidateQueries({ queryKey: ['public-plans'] });
      toast.success('تم إلغاء تفعيل الباقة');
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر إلغاء تفعيل الباقة'),
  });

  const planList = useMemo(() => list, [list]);

  const editPlan = (p: typeof list[number]) => {
    const a = accessStore[p.id];
    setDraft({
      id: p.id, code: p.code, name: p.name,
      monthly: String(p.monthlyPrice), yearly: String(p.yearlyPrice),
      users: String(p.limits.users), invoices: String(p.limits.invoices),
      features: a?.features ?? (p as { accessFeatures?: string[] }).accessFeatures ?? DEFAULT_PLAN_FEATURES[p.code] ?? [],
      items: (a?.items ?? p.features ?? []).join('\n'),
      popular: a?.popular ?? !!p.popular,
    });
    setOpen(true);
  };

  const confirmDelete = (p: typeof list[number]) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  const toggleFeature = (key: string, v: boolean) => {
    setDraft(s => ({
      ...s,
      features: v ? Array.from(new Set([...s.features, key])) : s.features.filter(k => k !== key),
    }));
  };

  return (
    <div>
      <PageHeader title="الباقات" description="إدارة باقات الاشتراك والصلاحيات المضمّنة فيها"
        actions={<Button onClick={() => { setDraft(emptyEdit); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> باقة جديدة</Button>} />

      {hasPlans === false && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm" dir="rtl">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-warning">لا توجد باقات مُضافة بعد</p>
            <p className="text-muted-foreground mt-0.5">
              يجب إضافة باقة واحدة على الأقل حتى يتمكن المدير من اعتماد طلبات التسجيل.
              أضف باقة الآن باستخدام زر "باقة جديدة" أعلاه.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6 text-sm">
        <span className={!yearly ? 'font-semibold' : 'text-muted-foreground'}>شهري</span>
        <Switch checked={yearly} onCheckedChange={setYearly} />
        <span className={yearly ? 'font-semibold' : 'text-muted-foreground'}>سنوي</span>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {planList.map(p => (
          <div key={p.id} className="relative group">
            <PlanCard plan={p} yearly={yearly} cta="تعديل الباقة" onSelect={() => editPlan(p)} />
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => confirmDelete(p)}
                disabled={!p.isActive}
                title={!p.isActive ? 'الباقة غير مفعّلة مسبقاً' : 'إلغاء تفعيل الباقة'}
              >
                <Trash2 className="h-4 w-4 ml-1" />
                {p.isActive ? 'إلغاء التفعيل' : 'غير مفعّلة'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.id ? 'تعديل باقة' : 'باقة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>الكود</Label><Input className="mt-1.5" value={draft.code} onChange={e => setDraft(s => ({ ...s, code: e.target.value }))} disabled={!!draft.id} /></div>
              <div><Label>الاسم</Label><Input className="mt-1.5" value={draft.name} onChange={e => setDraft(s => ({ ...s, name: e.target.value }))} /></div>
              <div><Label>السعر الشهري</Label><Input type="number" className="mt-1.5" value={draft.monthly} onChange={e => setDraft(s => ({ ...s, monthly: e.target.value }))} /></div>
              <div><Label>السعر السنوي</Label><Input type="number" className="mt-1.5" value={draft.yearly} onChange={e => setDraft(s => ({ ...s, yearly: e.target.value }))} /></div>
              <div><Label>حد المستخدمين</Label><Input type="number" className="mt-1.5" value={draft.users} onChange={e => setDraft(s => ({ ...s, users: e.target.value }))} /></div>
              <div><Label>حد الفواتير/شهر</Label><Input type="number" className="mt-1.5" value={draft.invoices} onChange={e => setDraft(s => ({ ...s, invoices: e.target.value }))} /></div>
            </div>

            <div className="rounded-xl border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">الميزات المضمّنة في الباقة</Label>
                <span className="text-xs text-muted-foreground">{draft.features.length} مفعّلة</span>
              </div>
              <p className="text-xs text-muted-foreground">يتم تطبيق هذه الميزات تلقائياً على كل مشترك في هذه الباقة.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {PLAN_FEATURES.map(f => {
                  const checked = draft.features.includes(f.key);
                  return (
                    <label key={f.key} className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 cursor-pointer hover:bg-muted/30">
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleFeature(f.key, !!v)} />
                      <span className="text-sm">{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>قائمة المزايا (للعرض على صفحة الباقات) — سطر لكل ميزة</Label>
              <Textarea className="mt-1.5" rows={4} value={draft.items} onChange={e => setDraft(s => ({ ...s, items: e.target.value }))} placeholder={'إدارة الفواتير\nإدارة العملاء\nتقارير متقدمة'} />
            </div>

            <label className="flex items-center gap-2">
              <Switch checked={draft.popular} onCheckedChange={(v) => setDraft(s => ({ ...s, popular: v }))} />
              <span className="text-sm">إبراز كباقة موصى بها</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              إلغاء تفعيل الباقة
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                هل أنت متأكد من إلغاء تفعيل باقة <span className="font-semibold text-foreground">"{deleteTarget.name}"</span>؟
                لن تُحذف الباقة نهائياً، بل ستصبح غير متاحة للاشتراكات الجديدة.
              </p>
              {deleteTarget.activeSubscriberCount > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" dir="rtl">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-warning">تحذير: يوجد مشتركون نشطون</p>
                    <p className="text-muted-foreground mt-0.5">
                      هذه الباقة لديها <span className="font-semibold">{deleteTarget.activeSubscriberCount}</span> مشترك نشط حالياً.
                      إلغاء التفعيل لن يؤثر على اشتراكاتهم الحالية، لكنهم لن يتمكنوا من الاشتراك في هذه الباقة مستقبلاً.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              تأكيد إلغاء التفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Plans;
