import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { subscriptions, companies } from '@/data/mock';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';

const AdminPayments = () => {
  const data = subscriptions.map(s => ({
    id: s.id,
    company: companies.find(c => c.id === s.companyId)?.name ?? '—',
    amount: s.amount,
    date: s.startDate,
    paid: s.paid,
    status: s.status,
  }));
  const columns: Column<typeof data[0]>[] = [
    { key: 'company', header: 'الشركة', cell: r => <span className="font-medium">{r.company}</span> },
    { key: 'date', header: 'تاريخ الاستحقاق', cell: r => formatDateShort(r.date) },
    { key: 'amount', header: 'القيمة', cell: r => formatCurrency(r.amount) },
    { key: 'paid', header: 'حالة السداد', cell: r => <StatusBadge status={r.paid ? 'active' : 'expired'} label={r.paid ? 'مدفوع' : 'غير مدفوع'} /> },
  ];
  return (
    <div>
      <PageHeader title="تحصيلات الاشتراكات" description="تتبع مدفوعات اشتراكات الشركات" />
      <DataTable data={data} columns={columns} searchKeys={['company']} />
    </div>
  );
};

export default AdminPayments;
