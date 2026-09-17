import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, RotateCcw, Send } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort, noteStatusLabel } from '@/lib/format';
import { toast } from 'sonner';

interface ItemRow {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity: string | number;
  unit_cost: string | number;
  total_cost: string | number;
  reason: string | null;
  notes: string | null;
}

interface WriteOffDetail {
  id: string;
  write_off_number: string;
  write_off_date: string;
  branch_name: string | null;
  cost_center_name: string | null;
  status: 'draft' | 'posted' | 'cancelled';
  reason: string;
  notes: string | null;
  total_cost: string | number;
  journal_entry_id: string | null;
  journal_entry_number: string | null;
  reversal_journal_entry_id: string | null;
  reversal_journal_entry_number: string | null;
  items: ItemRow[];
}

const reasonLabel = (reason: string | null) => ({
  damaged: 'تالف',
  expired: 'منتهي الصلاحية',
  broken: 'مكسور',
  missing: 'مفقود',
  theft: 'سرقة',
  quality_issue: 'مشكلة جودة',
  inventory_count_difference: 'فرق جرد',
  other: 'أخرى',
}[reason ?? ''] ?? reason ?? '—');

const InventoryWriteOffDetails = () => {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['inventory-write-off', id],
    queryFn: async () => (await api.get<{ data: WriteOffDetail }>(`/api/inventory-write-offs/${id}`)).data,
  });
  const postMutation = useMutation({
    mutationFn: async () => api.post(`/api/inventory-write-offs/${id}/post`, {}),
    onSuccess: async () => {
      toast.success('تم ترحيل شطب المخزون');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inventory-write-off', id] }),
        qc.invalidateQueries({ queryKey: ['inventory-write-offs'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'تعذّر الترحيل'),
  });
  const cancelMutation = useMutation({
    mutationFn: async () => api.post(`/api/inventory-write-offs/${id}/cancel`, {}),
    onSuccess: async () => {
      toast.success('تم إلغاء شطب المخزون وعكس أثره');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inventory-write-off', id] }),
        qc.invalidateQueries({ queryKey: ['inventory-write-offs'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'تعذّر الإلغاء'),
  });

  const data = query.data;
  const columns: Column<ItemRow>[] = [
    { key: 'product', header: 'المنتج', cell: (r) => <Link to={`/app/products/${r.product_id}`} className="text-primary">{r.product_name}</Link> },
    { key: 'sku', header: 'SKU', cell: (r) => r.sku ?? '—' },
    { key: 'reason', header: 'السبب', cell: (r) => reasonLabel(r.reason) },
    { key: 'qty', header: 'الكمية الخارجة', cell: (r) => Number(r.quantity), className: 'text-end' },
    { key: 'unit', header: 'تكلفة الوحدة', cell: (r) => formatCurrency(Number(r.unit_cost)), className: 'text-end' },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total_cost)), className: 'text-end' },
  ];

  return (
    <div className="space-y-5">
      <Link to="/app/inventory-write-offs" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة لشطب المخزون</Link>
      <PageHeader
        title={data?.write_off_number ?? 'شطب مخزون'}
        description={data ? `${formatDateShort(data.write_off_date)} · ${reasonLabel(data.reason)}` : undefined}
        actions={<>
          {data?.status === 'draft' && <Button onClick={() => postMutation.mutate()} disabled={postMutation.isPending}><Send className="h-4 w-4 ml-1" /> ترحيل</Button>}
          {data?.status === 'posted' && <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}><RotateCcw className="h-4 w-4 ml-1" /> إلغاء / عكس</Button>}
        </>}
      />

      {data && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4"><div className="text-xs text-muted-foreground">الحالة</div><div className="text-xl font-bold mt-1">{noteStatusLabel(data.status)}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">إجمالي التكلفة</div><div className="text-xl font-bold mt-1">{formatCurrency(Number(data.total_cost))}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">الفرع</div><div className="text-xl font-bold mt-1">{data.branch_name ?? '—'}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">مركز التكلفة</div><div className="text-xl font-bold mt-1">{data.cost_center_name ?? '—'}</div></Card>
        </div>
      )}

      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <Info label="قيد اليومية" value={data?.journal_entry_number ? `${data.journal_entry_number}` : '—'} />
          <Info label="قيد العكس" value={data?.reversal_journal_entry_number ? `${data.reversal_journal_entry_number}` : '—'} />
          <Info label="ملاحظات" value={data?.notes ?? '—'} />
        </div>
      </Card>

      <DataTable data={data?.items ?? []} columns={columns} emptyTitle="لا توجد بنود" />
    </div>
  );
};

const Info = ({ label, value }: { label: string; value: string }) => (
  <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium mt-1">{value}</div></div>
);

export default InventoryWriteOffDetails;
