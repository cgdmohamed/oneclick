import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { plans as mockPlans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { PLAN_FEATURES, DEFAULT_PLAN_FEATURES } from '@/lib/planFeatures';
import { usePlanAccessStore, useSetPlanAccess } from '@/hooks/usePlanAccess';

interface PlanRow { id: string; name: string }
interface AccessRow { plan_id: string; feature_key: string; enabled: boolean }

const FeatureAccess = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const accessStore = usePlanAccessStore();
  const setAccess = useSetPlanAccess();

  const plansQ = useQuery({
    enabled: apiOn,
    queryKey: ['admin-plans'],
    queryFn: async () => (await api.get<{ data: PlanRow[] }>('/api/plans/all')).data,
  });
  const accessQ = useQuery({
    enabled: apiOn,
    queryKey: ['feature-access'],
    queryFn: async () => (await api.get<{ data: AccessRow[] }>('/api/platform/feature-access')).data,
  });

  const plans: PlanRow[] = apiOn ? (plansQ.data ?? []) : mockPlans.map(p => ({ id: p.id, name: p.name }));
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m: Record<string, Record<string, boolean>> = {};
    plans.forEach((p) => {
      m[p.id] = {};
      const enabled = accessStore[p.id]?.features ?? DEFAULT_PLAN_FEATURES[p.id] ?? [];
      PLAN_FEATURES.forEach((f) => { m[p.id][f.key] = enabled.includes(f.key); });
    });
    if (apiOn && accessQ.data) {
      accessQ.data.forEach((a) => {
        if (!m[a.plan_id]) m[a.plan_id] = {};
        m[a.plan_id][a.feature_key] = a.enabled;
      });
    }
    setMatrix(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiOn, accessQ.data, plansQ.data, accessStore]);

  const onSave = async () => {
    // Persist locally so the tenant gating reflects immediately
    plans.forEach((p) => {
      const features = PLAN_FEATURES.filter(f => matrix[p.id]?.[f.key]).map(f => f.key);
      setAccess(p.id, { features });
    });
    if (!apiOn) return toast.success('تم حفظ صلاحيات الباقات وتطبيقها على المشتركين');
    setSaving(true);
    try {
      const entries = plans.flatMap((p) =>
        PLAN_FEATURES.map((f) => ({
          plan_id: p.id, feature_key: f.key,
          enabled: !!matrix[p.id]?.[f.key],
        })),
      );
      await api.put('/api/platform/feature-access', { entries });
      qc.invalidateQueries({ queryKey: ['feature-access'] });
      toast.success('تم حفظ الصلاحيات');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="الصلاحيات حسب الباقة" description="فعّل أو عطّل الميزات لكل باقة — تنعكس فوراً على المشتركين"
        actions={<Button onClick={onSave} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</Button>} />
      <Card className="p-0 overflow-x-auto border-border/60">
        <table dir="rtl" className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-start text-xs">
              <th className="p-3 font-semibold">الميزة</th>
              {plans.map(p => <th key={p.id} className="p-3 font-semibold text-center">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {PLAN_FEATURES.map(f => (
              <tr key={f.key} className="border-t border-border/60">
                <td className="p-3 font-medium">{f.label}</td>
                {plans.map(p => (
                  <td key={p.id} className="p-3 text-center">
                    <Switch
                      checked={!!matrix[p.id]?.[f.key]}
                      onCheckedChange={(v) => setMatrix(m => ({ ...m, [p.id]: { ...(m[p.id] ?? {}), [f.key]: v } }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default FeatureAccess;
