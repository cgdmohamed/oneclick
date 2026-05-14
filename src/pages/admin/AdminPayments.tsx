import { useMemo } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { subscriptions, companies } from '@/data/mock';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useQuery } from '@tanstack/react-query';
import { api, isApiConfigured } from '@/lib/api';

interface PaymentRow {
  id: string;
  amount: string | number;
  method: string;
  paid_at: string;
  wallet_name: string;
  company_name: string;
  plan_name: string;
  reference: string | null;
}

interface UIRow {
  id: string;
  company: string;
  plan: string;
  wallet: string;
  amount: number;
  date: string;
  method: string;
  paid: boolean;
}

const methodLabel = (m: string) => m === 'bank' ? 'تحويل بنكي' : m === 'wallet' ? 'محفظة إلكترونية' : 'نقدي';

const AdminPayments = () => {
  const apiOn = isApiConfigured();
  const q = useQuery({
    enabled: apiOn,
    queryKey: ['admin-subscription-payments'],
    queryFn: async () => {
      const r = await api.get<{ data: PaymentRow[] }>('/api/platform/subscription-payments');
      return r.data;
    },
  });

  const data: UIRow[] = useMemo(() => {
    if (apiOn) {
      return (q.data ?? []).map((p) => ({
        id: p.id,
        company: p.company_name,
        plan: p.plan_name,
        wallet: p.wallet_name,
        amount: Number(p.amount),
        date: p.paid_at,
        method: methodLabel(p.method),
        paid: true,
      }));
    }
    return subscriptions.map((s) => ({
      id: s.id,
      company: companies.find((c) => c.id === s.companyId)?.name ?? '—',
      plan: '—',
      wallet: '—',
      amount: s.amount,
      date: s.startDate,
      method: '—',
      paid: s.paid,
    }));
  }, [apiOn, q.data]);

  const columns: Column<UIRow>[] = [
    { key: 'company', header: 'الشركة', cell: (r) => <span className="font-medium">{r.company}</span> },
    { key: 'plan',    header: 'الباقة', cell: (r) => r.plan },
    { key: 'wallet',  header: 'محفظة التحصيل', cell: (r) => r.wallet },
    { key: 'date',    header: 'التاريخ', cell: (r) => formatDateShort(r.date) },
    { key: 'amount',  header: 'القيمة', cell: (r) => formatCurrency(r.amount) },
    { key: 'method',  header: 'الطريقة', cell: (r) => r.method },
    { key: 'status',  header: 'الحالة', cell: (r) => (
      <StatusBadge status={r.paid ? 'active' : 'expired'} label={r.paid ? 'مدفوع' : 'غير مدفوع'} />
    ) },
  ];

  return (
    <div>
      <PageHeader title="تحصيلات الاشتراكات" description="سجل المدفوعات اليدوية لاشتراكات الشركات" />
      <DataTable data={data} columns={columns} searchKeys={['company', 'wallet']} />
    </div>
  );
};

export default AdminPayments;
