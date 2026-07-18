import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus, Landmark, Wallet } from 'lucide-react';
import type { FixedAsset } from './types';

const FixedAssets = () => {
  const navigate = useNavigate();
  const { data = [] } = useQuery({ queryKey: ['fixed-assets'], queryFn: async () => (await api.get<{ data: FixedAsset[] }>('/api/fixed-assets/assets')).data ?? [] });
  const active = data.filter((asset) => asset.status === 'active');
  const columns: Column<FixedAsset>[] = [
    { key: 'code', header: 'الكود', cell: (r) => <Link className="text-primary font-medium" to={`/app/accounting/assets/${r.id}`}>{r.asset_code}</Link> },
    { key: 'name', header: 'الأصل', cell: (r) => r.name },
    { key: 'category', header: 'التصنيف', cell: (r) => r.category_name ?? '—' },
    { key: 'date', header: 'تاريخ الشراء', cell: (r) => formatDateShort(r.purchase_date) },
    { key: 'cost', header: 'التكلفة', cell: (r) => formatCurrency(Number(r.acquisition_cost)), className: 'text-end' },
    { key: 'acc', header: 'مجمع الإهلاك', cell: (r) => formatCurrency(Number(r.accumulated_depreciation ?? 0)), className: 'text-end' },
    { key: 'nbv', header: 'صافي القيمة', cell: (r) => formatCurrency(Number(r.net_book_value ?? 0)), className: 'text-end' },
    { key: 'status', header: 'الحالة', cell: (r) => r.status },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="الأصول الثابتة" description="سجل الأصول والإهلاك المتراكم" actions={<Button onClick={() => navigate('/app/accounting/assets/new')}><Plus className="h-4 w-4 ml-1" /> أصل جديد</Button>} />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="عدد الأصول" value={data.length} icon={Landmark} accent="info" />
        <StatCard title="الأصول النشطة" value={active.length} icon={Landmark} accent="success" />
        <StatCard title="صافي القيمة الدفترية" value={formatCurrency(data.reduce((s, a) => s + Number(a.net_book_value ?? 0), 0))} icon={Wallet} accent="warning" />
      </div>
      <DataTable data={data} columns={columns} searchKeys={['asset_code', 'name', 'category_name']} emptyTitle="لا توجد أصول ثابتة" onRowClick={(r) => navigate(`/app/accounting/assets/${r.id}`)} />
    </div>
  );
};

export default FixedAssets;
