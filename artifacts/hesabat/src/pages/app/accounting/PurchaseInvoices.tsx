import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { FileText, Plus, Wallet } from 'lucide-react';
import type { PurchaseInvoice } from './types';

const PurchaseInvoices = () => {
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ['purchase-invoices'],
    queryFn: async () => (await api.get<{ data: PurchaseInvoice[] }>('/api/purchases/invoices?page_size=300')).data ?? [],
  });
  const outstanding = data.reduce((sum, row) => sum + Number(row.remaining), 0);
  const columns: Column<PurchaseInvoice>[] = [
    { key: 'number', header: 'الرقم', cell: (r) => <Link className="text-primary font-medium" to={`/app/purchases/invoices/${r.id}`}>{r.number}</Link> },
    { key: 'supplier', header: 'المورد', cell: (r) => r.supplier_name ?? '—' },
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.invoice_date) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge>{r.status}</Badge> },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total)), className: 'text-end' },
    { key: 'remaining', header: 'المتبقي', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.remaining))}</span>, className: 'text-end' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="فواتير الشراء" description="تسجيل مشتريات المخزون والمصروفات وربطها بالموردين" actions={<Button onClick={() => navigate('/app/purchases/invoices/new')}><Plus className="h-4 w-4 ml-1" /> فاتورة شراء</Button>} />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="عدد فواتير الشراء" value={data.length} icon={FileText} accent="info" />
        <StatCard title="إجمالي المشتريات" value={formatCurrency(data.reduce((s, r) => s + Number(r.total), 0))} icon={FileText} accent="primary" />
        <StatCard title="المستحق للموردين" value={formatCurrency(outstanding)} icon={Wallet} accent="warning" />
      </div>
      <DataTable data={data} columns={columns} searchKeys={['number', 'supplier_name']} emptyTitle="لا توجد فواتير شراء" onRowClick={(r) => navigate(`/app/purchases/invoices/${r.id}`)} />
    </div>
  );
};

export default PurchaseInvoices;
