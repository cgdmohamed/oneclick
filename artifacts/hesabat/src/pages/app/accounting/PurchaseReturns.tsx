import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { RotateCcw, Plus, Wallet } from 'lucide-react';
import type { PurchaseReturn } from './types';

const PurchaseReturns = () => {
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ['purchase-returns'],
    queryFn: async () => (await api.get<{ data: PurchaseReturn[] }>('/api/purchases/returns?page_size=300')).data ?? [],
  });
  const posted = data.filter((r) => r.status === 'posted');
  const columns: Column<PurchaseReturn>[] = [
    { key: 'number', header: 'رقم المرتجع', cell: (r) => <Link className="text-primary font-medium" to={`/app/purchases/returns/${r.id}`}>{r.return_number}</Link> },
    { key: 'supplier', header: 'المورد', cell: (r) => r.supplier_name ?? '—' },
    { key: 'invoice', header: 'فاتورة الشراء', cell: (r) => r.original_purchase_invoice_number ?? '—' },
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.return_date) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge>{r.status}</Badge> },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total)), className: 'text-end' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="مرتجعات الشراء" description="إرجاع مشتريات المخزون وتخفيض الذمم الدائنة وضريبة المدخلات"
        actions={<Button onClick={() => navigate('/app/purchases/returns/new')}><Plus className="h-4 w-4 ml-1" /> مرتجع شراء</Button>} />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="عدد المرتجعات" value={data.length} icon={RotateCcw} accent="info" />
        <StatCard title="المرتجعات المرحلة" value={posted.length} icon={RotateCcw} accent="success" />
        <StatCard title="إجمالي المرتجعات" value={formatCurrency(posted.reduce((s, r) => s + Number(r.total), 0))} icon={Wallet} accent="warning" />
      </div>
      <DataTable data={data} columns={columns} searchKeys={['return_number', 'supplier_name', 'original_purchase_invoice_number']} emptyTitle="لا توجد مرتجعات شراء" onRowClick={(r) => navigate(`/app/purchases/returns/${r.id}`)} />
    </div>
  );
};

export default PurchaseReturns;
