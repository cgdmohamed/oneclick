import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import type { AssetCategory, ChartAccount } from './types';

const AssetCategories = () => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', default_useful_life_months: '60', fixed_asset_account_id: '', accumulated_depreciation_account_id: '', depreciation_expense_account_id: '' });
  const { data = [] } = useQuery({ queryKey: ['asset-categories'], queryFn: async () => (await api.get<{ data: AssetCategory[] }>('/api/fixed-assets/categories')).data ?? [] });
  const { data: accounts = [] } = useQuery({ queryKey: ['chart-accounts'], queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [] });
  const create = async () => {
    try {
      await api.post('/api/fixed-assets/categories', { ...form, default_useful_life_months: Number(form.default_useful_life_months), fixed_asset_account_id: form.fixed_asset_account_id || null, accumulated_depreciation_account_id: form.accumulated_depreciation_account_id || null, depreciation_expense_account_id: form.depreciation_expense_account_id || null });
      setForm({ name: '', default_useful_life_months: '60', fixed_asset_account_id: '', accumulated_depreciation_account_id: '', depreciation_expense_account_id: '' });
      await qc.invalidateQueries({ queryKey: ['asset-categories'] });
      toast.success('تم إنشاء تصنيف الأصل');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء التصنيف'); }
  };
  const columns: Column<AssetCategory>[] = [
    { key: 'name', header: 'التصنيف', cell: (r) => r.name },
    { key: 'life', header: 'العمر الافتراضي', cell: (r) => `${r.default_useful_life_months} شهر` },
    { key: 'status', header: 'الحالة', cell: (r) => r.is_active ? 'نشط' : 'غير نشط' },
  ];
  const accountOptions = (placeholder: string) => <><option value="">{placeholder}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</>;
  return (
    <div className="space-y-5">
      <PageHeader title="تصنيفات الأصول" description="حسابات الإهلاك والعمر الافتراضي الافتراضي لكل تصنيف" />
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div><Label>الاسم</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div><Label>العمر بالشهور</Label><Input className="mt-1.5" type="number" value={form.default_useful_life_months} onChange={(e) => setForm((p) => ({ ...p, default_useful_life_months: e.target.value }))} /></div>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.fixed_asset_account_id} onChange={(e) => setForm((p) => ({ ...p, fixed_asset_account_id: e.target.value }))}>{accountOptions('حساب الأصل')}</select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.accumulated_depreciation_account_id} onChange={(e) => setForm((p) => ({ ...p, accumulated_depreciation_account_id: e.target.value }))}>{accountOptions('حساب مجمع الإهلاك')}</select>
          <Button onClick={create}>حفظ التصنيف</Button>
        </div>
      </Card>
      <DataTable data={data} columns={columns} searchKeys={['name']} emptyTitle="لا توجد تصنيفات أصول" />
    </div>
  );
};

export default AssetCategories;
