import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '@/types';
import { formatCurrency, formatDateShort, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInvoices, useClients } from '@/hooks/entities';
import { useQueryClient } from '@tanstack/react-query';
import NewInvoice from './NewInvoice';

type Row = Invoice & { clientName?: string };

const Invoices = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { list: invoices } = useInvoices();
  const { list: clients } = useClients();
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const requestedNewInvoice = searchParams.get('new') === '1';
  const requestedClientId = searchParams.get('client');
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(requestedNewInvoice);

  useEffect(() => {
    setNewInvoiceOpen(requestedNewInvoice);
  }, [requestedNewInvoice]);

  const openNewInvoice = () => {
    const next = new URLSearchParams(searchParams);
    next.set('new', '1');
    setSearchParams(next);
    setNewInvoiceOpen(true);
  };

  const closeNewInvoice = () => {
    setNewInvoiceOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    next.delete('client');
    setSearchParams(next, { replace: true });
  };

  const filtered = useMemo(
    () => (status === 'all' ? invoices : invoices.filter(i => i.status === status)) as Row[],
    [status, invoices],
  );

  const clientName = (r: Row) =>
    r.clientName ?? clients.find(c => c.id === r.clientId)?.name ?? '—';

  const columns: Column<Row>[] = [
    { key: 'num', header: 'رقم الفاتورة', cell: r => <Link to={`/app/invoices/${r.id}`} className="text-primary font-medium">{r.number}</Link> },
    { key: 'client', header: 'العميل', cell: r => clientName(r) },
    { key: 'date', header: 'التاريخ', cell: r => <span className="text-muted-foreground">{formatDateShort(r.issueDate)}</span> },
    { key: 'due', header: 'الاستحقاق', cell: r => <span className="text-muted-foreground">{formatDateShort(r.dueDate)}</span> },
    { key: 'total', header: 'الإجمالي', cell: r => formatCurrency(r.total) },
    { key: 'paid', header: 'المدفوع', cell: r => <span className="text-success">{formatCurrency(r.paid)}</span> },
    { key: 'rem', header: 'المتبقي', cell: r => <span className="text-destructive">{formatCurrency(r.remaining)}</span> },
    { key: 'status', header: 'الحالة', cell: r => r.hasBadDebtWriteoff
      ? <StatusBadge status="written_off" label="معدومة" />
      : <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
  ];

  return (
    <div>
      <PageHeader title="الفواتير" description="إدارة فواتير شركتك"
        actions={<Button onClick={openNewInvoice}><Plus className="h-4 w-4 ml-1" /> فاتورة جديدة</Button>} />

      <DataTable
        data={filtered}
        columns={columns}
        searchKeys={['number']}
        searchPlaceholder="ابحث برقم الفاتورة..."
        rightToolbar={
          <Select value={status} onValueChange={(v: InvoiceStatus | 'all') => setStatus(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="sent">مرسلة</SelectItem>
              <SelectItem value="paid">مدفوعة</SelectItem>
              <SelectItem value="partial">مدفوعة جزئياً</SelectItem>
              <SelectItem value="unpaid">غير مدفوعة</SelectItem>
              <SelectItem value="overdue">متأخرة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        }
        onRowClick={(r) => navigate(`/app/invoices/${r.id}`)}
      />

      <Dialog open={newInvoiceOpen} onOpenChange={(open) => open ? openNewInvoice() : closeNewInvoice()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[1180px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>فاتورة جديدة</DialogTitle>
            <DialogDescription>أنشئ فاتورة دون مغادرة قائمة الفواتير.</DialogDescription>
          </DialogHeader>
          {newInvoiceOpen && (
            <NewInvoice
              asModal
              defaultClientId={requestedClientId}
              onCancel={closeNewInvoice}
              onCreated={(invoiceId) => {
                closeNewInvoice();
                qc.invalidateQueries({ queryKey: ['invoices'] });
                if (invoiceId) navigate(`/app/invoices/${invoiceId}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
