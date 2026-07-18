import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus } from 'lucide-react';

interface WriteOffRow {
  id: string;
  write_off_number: string;
  write_off_date: string;
  status: string;
  reason: string;
  total_cost: string | number;
  branch_name: string | null;
  cost_center_name: string | null;
  created_by_name: string | null;
}

const reasonLabel = (reason: string) => ({
  damaged: 'تالف',
  expired: 'منتهي الصلاحية',
  broken: 'مكسور',
  missing: 'مفقود',
  theft: 'سرقة',
  quality_issue: 'مشكلة جودة',
  inventory_count_difference: 'فرق جرد',
  other: 'أخرى',
}[reason] ?? reason);

const InventoryWriteOffs = () => {
  const query = useQuery({
    queryKey: ['inventory-write-offs'],
    queryFn: async () => (await api.get<{ data: WriteOffRow[] }>('/api/inventory-write-offs?page_size=200')).data ?? [],
  });

  const columns: Column<WriteOffRow>[] = [
    { key: 'number', header: 'الرقم', cell: (r) => <Link to={`/app/inventory-write-offs/${r.id}`} className="text-primary font-medium">{r.write_off_number}</Link> },
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.write_off_date) },
    { key: 'reason', header: 'السبب', cell: (r) => reasonLabel(r.reason) },
    { key: 'branch', header: 'الفرع', cell: (r) => r.branch_name ?? '—' },
    { key: 'cost_center', header: 'مركز التكلفة', cell: (r) => r.cost_center_name ?? '—' },
    { key: 'total', header: 'التكلفة', cell: (r) => formatCurrency(Number(r.total_cost)), className: 'text-end' },
    { key: 'status', header: 'الحالة', cell: (r) => r.status },
    { key: 'created_by', header: 'أنشأه', cell: (r) => r.created_by_name ?? '—' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="شطب / هالك المخزون"
        description="تسجيل التالف والمفقود والمنتهي الصلاحية وتأثيره المحاسبي"
        actions={<Button asChild><Link to="/app/inventory-write-offs/new"><Plus className="h-4 w-4 ml-1" /> شطب جديد</Link></Button>}
      />
      <DataTable data={query.data ?? []} columns={columns} searchKeys={['write_off_number', 'reason']} emptyTitle="لا توجد عمليات شطب مخزون" />
    </div>
  );
};

export default InventoryWriteOffs;
