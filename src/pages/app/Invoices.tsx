import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { invoices, clients } from '@/data/mock';
import type { Invoice, InvoiceStatus } from '@/types';
import { formatCurrency, formatDateShort, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Link, useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Invoices = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const filtered = useMemo(() => status === 'all' ? invoices : invoices.filter(i => i.status === status), [status]);

  const columns: Column<Invoice>[] = [
    { key: 'num', header: 'رقم الفاتورة', cell: r => <Link to={`/app/invoices/${r.id}`} className="text-primary font-medium">{r.number}</Link> },
    { key: 'client', header: 'العميل', cell: r => clients.find(c => c.id === r.clientId)?.name ?? '—' },
    { key: 'date', header: 'التاريخ', cell: r => <span className="text-muted-foreground">{formatDateShort(r.issueDate)}</span> },
    { key: 'due', header: 'الاستحقاق', cell: r => <span className="text-muted-foreground">{formatDateShort(r.dueDate)}</span> },
    { key: 'total', header: 'الإجمالي', cell: r => formatCurrency(r.total) },
    { key: 'paid', header: 'المدفوع', cell: r => <span className="text-success">{formatCurrency(r.paid)}</span> },
    { key: 'rem', header: 'المتبقي', cell: r => <span className="text-destructive">{formatCurrency(r.remaining)}</span> },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
  ];

  return (
    <div>
      <PageHeader title="الفواتير" description="إدارة فواتير شركتك"
        actions={<Button onClick={() => navigate('/app/invoices/new')}><Plus className="h-4 w-4 ml-1" /> فاتورة جديدة</Button>} />

      <DataTable
        data={filtered}
        columns={columns}
        searchKeys={['number']}
        searchPlaceholder="ابحث برقم الفاتورة..."
        rightToolbar={
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="paid">مدفوعة</SelectItem>
              <SelectItem value="partial">مدفوعة جزئياً</SelectItem>
              <SelectItem value="unpaid">غير مدفوعة</SelectItem>
              <SelectItem value="overdue">متأخرة</SelectItem>
            </SelectContent>
          </Select>
        }
        onRowClick={(r) => navigate(`/app/invoices/${r.id}`)}
      />
    </div>
  );
};

export default Invoices;
