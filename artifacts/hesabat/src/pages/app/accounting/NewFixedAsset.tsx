import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { AssetCategory, FixedAsset } from './types';

interface Dimension { id: string; name: string; code?: string | null; is_active: boolean }

const NewFixedAsset = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ asset_code: `FA-${String(Date.now()).slice(-5)}`, name: '', category_id: '', purchase_date: today, acquisition_cost: '', salvage_value: '0', useful_life_months: '60', depreciation_start_date: today, branch_id: '', cost_center_id: '', notes: '' });
  const categories = useQuery({ queryKey: ['asset-categories'], queryFn: async () => (await api.get<{ data: AssetCategory[] }>('/api/fixed-assets/categories')).data ?? [] });
  const branches = useQuery({ queryKey: ['branches'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/branches')).data ?? [] });
  const costCenters = useQuery({ queryKey: ['cost-centers'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/cost-centers')).data ?? [] });
  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));
  const submit = async () => {
    try {
      const res = await api.post<{ data: FixedAsset }>('/api/fixed-assets/assets', {
        ...form,
        acquisition_cost: Number(form.acquisition_cost),
        salvage_value: Number(form.salvage_value || 0),
        useful_life_months: Number(form.useful_life_months),
        branch_id: form.branch_id || null,
        cost_center_id: form.cost_center_id || null,
        notes: form.notes || null,
      });
      await qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      toast.success('تم إنشاء الأصل');
      navigate(`/app/accounting/assets/${res.data.id}`);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء الأصل'); }
  };
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/assets" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للأصول</Link>
      <PageHeader title="أصل ثابت جديد" description="تسجيل أصل لاستخدامه في تشغيل الإهلاك" actions={<Button onClick={submit}>حفظ الأصل</Button>} />
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-4 gap-4">
          <div><Label>كود الأصل</Label><Input className="mt-1.5" value={form.asset_code} onChange={(e) => set({ asset_code: e.target.value })} /></div>
          <div><Label>اسم الأصل</Label><Input className="mt-1.5" value={form.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div><Label>التصنيف</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.category_id} onChange={(e) => { const c = (categories.data ?? []).find((x) => x.id === e.target.value); set({ category_id: e.target.value, useful_life_months: c ? String(c.default_useful_life_months) : form.useful_life_months }); }}><option value="">اختر التصنيف</option>{(categories.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><Label>تاريخ الشراء</Label><Input className="mt-1.5" type="date" value={form.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} /></div>
          <div><Label>تكلفة الاقتناء</Label><Input className="mt-1.5" type="number" value={form.acquisition_cost} onChange={(e) => set({ acquisition_cost: e.target.value })} /></div>
          <div><Label>القيمة التخريدية</Label><Input className="mt-1.5" type="number" value={form.salvage_value} onChange={(e) => set({ salvage_value: e.target.value })} /></div>
          <div><Label>العمر بالشهور</Label><Input className="mt-1.5" type="number" value={form.useful_life_months} onChange={(e) => set({ useful_life_months: e.target.value })} /></div>
          <div><Label>بداية الإهلاك</Label><Input className="mt-1.5" type="date" value={form.depreciation_start_date} onChange={(e) => set({ depreciation_start_date: e.target.value })} /></div>
          <div><Label>الفرع</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.branch_id} onChange={(e) => set({ branch_id: e.target.value })}><option value="">بدون فرع</option>{(branches.data ?? []).filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} - ` : ''}{b.name}</option>)}</select></div>
          <div><Label>مركز التكلفة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.cost_center_id} onChange={(e) => set({ cost_center_id: e.target.value })}><option value="">بدون مركز</option>{(costCenters.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}</select></div>
          <div className="md:col-span-4"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
        </div>
      </Card>
    </div>
  );
};

export default NewFixedAsset;
