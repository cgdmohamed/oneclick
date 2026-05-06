import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { invoices, clients, payments, accounts } from '@/data/mock';
import { DataTable, Column } from '@/components/common/DataTable';
import { formatCurrency, formatDateShort, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';

const titleMap: Record<string, string> = {
  invoices: 'تقرير الفواتير',
  payments: 'تقرير المدفوعات',
  remaining: 'تقرير المتبقي',
  'by-method': 'تقرير حسب وسيلة الدفع',
  'by-account': 'تقرير حسب الحساب المالي',
};

const ReportDetail = () => {
  const { type = 'invoices' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const flatPayments = useMemo(() => payments.flatMap(p => p.splits.map(s => ({ ...s, date: p.date, invoiceId: p.invoiceId, id: `${p.id}-${s.method}-${s.accountId}` }))), []);

  const renderTable = () => {
    if (type === 'invoices') {
      return <DataTable data={invoices} columns={[
        { key: 'num', header: 'الرقم', cell: r => <Link to={`/app/invoices/${r.id}`} className="text-primary">{r.number}</Link> },
        { key: 'client', header: 'العميل', cell: r => clients.find(c => c.id === r.clientId)?.name },
        { key: 'date', header: 'التاريخ', cell: r => formatDateShort(r.issueDate) },
        { key: 'total', header: 'الإجمالي', cell: r => formatCurrency(r.total) },
        { key: 'paid', header: 'المدفوع', cell: r => formatCurrency(r.paid) },
        { key: 'rem', header: 'المتبقي', cell: r => formatCurrency(r.remaining) },
        { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
      ]} />;
    }
    if (type === 'remaining') {
      const data = invoices.filter(i => i.remaining > 0);
      return <DataTable data={data} columns={[
        { key: 'num', header: 'الرقم', cell: r => r.number },
        { key: 'client', header: 'العميل', cell: r => clients.find(c => c.id === r.clientId)?.name },
        { key: 'due', header: 'الاستحقاق', cell: r => formatDateShort(r.dueDate) },
        { key: 'total', header: 'الإجمالي', cell: r => formatCurrency(r.total) },
        { key: 'rem', header: 'المتبقي', cell: r => <span className="text-destructive font-semibold">{formatCurrency(r.remaining)}</span> },
        { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={invoiceStatusLabel(r.status)} /> },
      ]} />;
    }
    if (type === 'payments') {
      return <DataTable data={flatPayments as any} columns={[
        { key: 'date', header: 'التاريخ', cell: (r: any) => formatDateShort(r.date) },
        { key: 'inv', header: 'الفاتورة', cell: (r: any) => invoices.find(i => i.id === r.invoiceId)?.number },
        { key: 'method', header: 'الطريقة', cell: (r: any) => paymentMethodLabel(r.method) },
        { key: 'account', header: 'الحساب', cell: (r: any) => accounts.find(a => a.id === r.accountId)?.name },
        { key: 'amount', header: 'المبلغ', cell: (r: any) => formatCurrency(r.amount) },
      ] as Column<any>[]} />;
    }
    if (type === 'by-method') {
      const grouped = ['cash','bank','wallet'].map(m => ({
        id: m,
        method: paymentMethodLabel(m),
        count: flatPayments.filter(p => p.method === m).length,
        total: flatPayments.filter(p => p.method === m).reduce((s, p) => s + p.amount, 0),
      }));
      return <DataTable data={grouped} columns={[
        { key: 'method', header: 'الطريقة', cell: r => <span className="font-medium">{r.method}</span> },
        { key: 'count', header: 'عدد العمليات', cell: r => r.count },
        { key: 'total', header: 'الإجمالي', cell: r => formatCurrency(r.total) },
      ]} />;
    }
    if (type === 'by-account') {
      const grouped = accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        count: flatPayments.filter(p => p.accountId === a.id).length,
        total: flatPayments.filter(p => p.accountId === a.id).reduce((s, p) => s + p.amount, 0),
        balance: a.balance,
      }));
      return <DataTable data={grouped} columns={[
        { key: 'name', header: 'الحساب', cell: r => <span className="font-medium">{r.name}</span> },
        { key: 'count', header: 'عدد المدفوعات', cell: r => r.count },
        { key: 'total', header: 'إجمالي المحصل', cell: r => formatCurrency(r.total) },
        { key: 'balance', header: 'الرصيد الحالي', cell: r => formatCurrency(r.balance) },
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
          <div><Label>من تاريخ</Label><Input type="date" className="mt-1.5" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" className="mt-1.5" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button>تطبيق الفلتر</Button>
        </div>
      </Card>
      {renderTable()}
    </div>
  );
};

export default ReportDetail;
