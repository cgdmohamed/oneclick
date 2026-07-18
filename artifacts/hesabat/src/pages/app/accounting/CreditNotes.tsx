import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus, RotateCcw, Wallet } from 'lucide-react';
import type { CreditNote } from './types';

const CreditNotes = () => {
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ['credit-notes'],
    queryFn: async () => (await api.get<{ data: CreditNote[] }>('/api/credit-notes?page_size=300')).data ?? [],
  });
  const posted = data.filter((note) => note.status === 'posted');
  const columns: Column<CreditNote>[] = [
    { key: 'number', header: 'رقم الإشعار', cell: (r) => <Link className="text-primary font-medium" to={`/app/credit-notes/${r.id}`}>{r.credit_note_number}</Link> },
    { key: 'customer', header: 'العميل', cell: (r) => r.customer_name ?? '—' },
    { key: 'invoice', header: 'الفاتورة الأصلية', cell: (r) => r.original_invoice_number ?? '—' },
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.credit_note_date) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge>{r.status}</Badge> },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total)), className: 'text-end' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الإشعارات الدائنة"
        description="مرتجعات المبيعات وتخفيض أرصدة العملاء وضريبة المخرجات"
        actions={<Button onClick={() => navigate('/app/credit-notes/new')}><Plus className="h-4 w-4 ml-1" /> إشعار دائن</Button>}
      />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="عدد الإشعارات" value={data.length} icon={RotateCcw} accent="info" />
        <StatCard title="الإشعارات المرحلة" value={posted.length} icon={RotateCcw} accent="success" />
        <StatCard title="إجمالي المرتجعات" value={formatCurrency(posted.reduce((sum, note) => sum + Number(note.total), 0))} icon={Wallet} accent="warning" />
      </div>
      <DataTable data={data} columns={columns} searchKeys={['credit_note_number', 'customer_name', 'original_invoice_number']} emptyTitle="لا توجد إشعارات دائنة" onRowClick={(r) => navigate(`/app/credit-notes/${r.id}`)} />
    </div>
  );
};

export default CreditNotes;
