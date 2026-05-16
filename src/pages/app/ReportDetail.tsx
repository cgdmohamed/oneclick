import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { payments as mockPayments } from '@/data/mock';
import { useClients, useAccounts, useInvoices } from '@/hooks/entities';
import { api, isApiConfigured } from '@/lib/api';
import { DataTable, Column } from '@/components/common/DataTable';
import { formatCurrency, formatDateShort, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { InvoicesCharts, PaymentsCharts, RemainingCharts, ByAccountCharts } from '@/components/common/ReportCharts';

const titleMap: Record<string, string> = {
  invoices: 'تقرير الفواتير',
  payments: 'تقرير المدفوعات',
  remaining: 'تقرير المتبقي',
  'by-method': 'تقرير حسب وسيلة الدفع',
  'by-account': 'تقرير حسب الحساب المالي',
};

interface FlatPayment {
  id: string; date: string; invoiceId: string;
  invoiceNumber?: string; method: string; accountId: string;
  accountName?: string; amount: number;
}

const ReportDetail = () => {
  const { type = 'invoices' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const inRange = (dateStr?: string) => {
    if (!dateStr) return true;
    if (applied.from && dateStr < applied.from) return false;
    if (applied.to && dateStr > applied.to) return false;
    return true;
  };
  const filteredInvoices = useMemo(() => invoices.filter((i) => inRange(i.issueDate)), [invoices, applied]);
  const filteredPayments = useMemo(() => flatPayments.filter((p) => inRange(p.date)), [flatPayments, applied]);

  const { list: clients } = useClients();
  const { list: accounts } = useAccounts();
  const { list: invoices } = useInvoices();

  const apiOn = isApiConfigured();
  const paymentsQuery = useQuery({
    enabled: apiOn,
    queryKey: ['payments-flat'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        id: string; invoice_id: string; account_id: string; amount: string | number;
        method: string; paid_at: string; invoice_number?: string; account_name?: string;
      }> }>('/api/payments');
      return res.data.map<FlatPayment>((p) => ({
        id: p.id, date: p.paid_at, invoiceId: p.invoice_id, invoiceNumber: p.invoice_number,
        method: p.method, accountId: p.account_id, accountName: p.account_name,
        amount: Number(p.amount),
      }));
    },
  });

  const flatPayments = useMemo<FlatPayment[]>(() => {
    if (apiOn) return paymentsQuery.data ?? [];
    return mockPayments.flatMap((p) =>
      p.splits.map((s) => ({
        id: `${p.id}-${s.method}-${s.accountId}`,
        date: p.date, invoiceId: p.invoiceId,
        method: s.method, accountId: s.accountId, amount: s.amount,
      })),
    );
  }, [apiOn, paymentsQuery.data]);

  const renderTable = () => {
    if (type === 'invoices') {
      return <DataTable data={invoices} columns={[
        { key: 'num', header: 'الرقم', cell: (r) => <Link to={`/app/invoices/${r.id}`} className="text-primary">{r.number}</Link> },
        { key: 'client', header: 'العميل', cell: (r) => r.clientName ?? clients.find((c) => c.id === r.clientId)?.name },
        { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.issueDate) },
        { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(r.total) },
        { key: 'paid', header: 'المدفوع', cell: (r) => formatCurrency(r.paid) },
        { key: 'rem', header: 'المتبقي', cell: (r) => formatCurrency(r.remaining) },
        { key: 'status', header: 'الحالة', cell: (r) => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
      ]} />;
    }
    if (type === 'remaining') {
      const data = invoices.filter((i) => i.remaining > 0);
      return <DataTable data={data} columns={[
        { key: 'num', header: 'الرقم', cell: (r) => r.number },
        { key: 'client', header: 'العميل', cell: (r) => r.clientName ?? clients.find((c) => c.id === r.clientId)?.name },
        { key: 'due', header: 'الاستحقاق', cell: (r) => formatDateShort(r.dueDate) },
        { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(r.total) },
        { key: 'rem', header: 'المتبقي', cell: (r) => <span className="text-destructive font-semibold">{formatCurrency(r.remaining)}</span> },
        { key: 'status', header: 'الحالة', cell: (r) => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
      ]} />;
    }
    if (type === 'payments') {
      return <DataTable data={flatPayments} columns={[
        { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.date) },
        { key: 'inv', header: 'الفاتورة', cell: (r) => r.invoiceNumber ?? invoices.find((i) => i.id === r.invoiceId)?.number },
        { key: 'method', header: 'الطريقة', cell: (r) => paymentMethodLabel(r.method) },
        { key: 'account', header: 'الحساب', cell: (r) => r.accountName ?? accounts.find((a) => a.id === r.accountId)?.name },
        { key: 'amount', header: 'المبلغ', cell: (r) => formatCurrency(r.amount) },
      ] as Column<FlatPayment>[]} />;
    }
    if (type === 'by-method') {
      const grouped = ['cash','bank','wallet'].map((m) => ({
        id: m,
        method: paymentMethodLabel(m),
        count: flatPayments.filter((p) => p.method === m).length,
        total: flatPayments.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0),
      }));
      return <DataTable data={grouped} columns={[
        { key: 'method', header: 'الطريقة', cell: (r) => <span className="font-medium">{r.method}</span> },
        { key: 'count', header: 'عدد العمليات', cell: (r) => r.count },
        { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(r.total) },
      ]} />;
    }
    if (type === 'by-account') {
      const grouped = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        count: flatPayments.filter((p) => p.accountId === a.id).length,
        total: flatPayments.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.amount, 0),
        balance: a.balance,
      }));
      return <DataTable data={grouped} columns={[
        { key: 'name', header: 'الحساب', cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'count', header: 'عدد المدفوعات', cell: (r) => r.count },
        { key: 'total', header: 'إجمالي المحصل', cell: (r) => formatCurrency(r.total) },
        { key: 'balance', header: 'الرصيد الحالي', cell: (r) => formatCurrency(r.balance) },
      ]} />;
    }
    return null;
  };

  return (
    <div>
      <Link to="/app/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowRight className="h-4 w-4" /> العودة للتقارير
      </Link>
      <PageHeader title={titleMap[type] ?? 'تقرير'} />
      <Card className="p-4 mb-5 border-border/60">
        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div><Label>من تاريخ</Label><Input type="date" className="mt-1.5" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" className="mt-1.5" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button>تطبيق الفلتر</Button>
        </div>
      </Card>

      {type === 'invoices' && <InvoicesCharts invoices={invoices} />}
      {type === 'remaining' && <RemainingCharts invoices={invoices} />}
      {(type === 'payments' || type === 'by-method') && <PaymentsCharts payments={flatPayments} />}
      {type === 'by-account' && <ByAccountCharts accounts={accounts} payments={flatPayments} />}

      {renderTable()}
    </div>
  );
};

export default ReportDetail;
