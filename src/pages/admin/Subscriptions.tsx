import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { subscriptions, companies, plans } from '@/data/mock';
import type { Subscription } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const Subscriptions = () => {
  const columns: Column<Subscription>[] = [
    { key: 'company', header: 'الشركة', cell: r => <span className="font-medium">{companies.find(c => c.id === r.companyId)?.name}</span> },
    { key: 'plan', header: 'الباقة', cell: r => plans.find(p => p.id === r.planId)?.name },
    { key: 'start', header: 'البداية', cell: r => formatDateShort(r.startDate) },
    { key: 'end', header: 'النهاية', cell: r => formatDateShort(r.endDate) },
    { key: 'amount', header: 'القيمة', cell: r => formatCurrency(r.amount) },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status === 'expired' ? 'expired' : r.status === 'suspended' ? 'suspended' : 'active'} /> },
    { key: 'actions', header: '', cell: r => (
      <Button variant="outline" size="sm" disabled={r.paid} onClick={() => toast.success('تم تسجيل دفعة الاشتراك')}>
        {r.paid ? 'مدفوع' : 'تسجيل دفعة'}
      </Button>
    )},
  ];
  return (
    <div>
      <PageHeader title="الاشتراكات" description="ربط الشركات بالباقات وتتبع التواريخ" />
      <DataTable data={subscriptions} columns={columns} />
    </div>
  );
};

export default Subscriptions;
