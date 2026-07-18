import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Plus } from 'lucide-react';
import type { BankReconciliation } from './types';

const BankReconciliations = () => {
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ['bank-reconciliations'],
    queryFn: async () => (await api.get<{ data: BankReconciliation[] }>('/api/bank-reconciliations')).data ?? [],
  });
  const cols: Column<BankReconciliation>[] = [
    { key: 'date', header: 'تاريخ الكشف', cell: (r) => <Link className="text-primary font-medium" to={`/app/accounting/bank-reconciliations/${r.id}`}>{formatDateShort(r.statement_date)}</Link> },
    { key: 'account', header: 'الحساب البنكي', cell: (r) => r.account_name ?? '—' },
    { key: 'closing', header: 'رصيد كشف البنك', cell: (r) => formatCurrency(Number(r.closing_balance)), className: 'text-end' },
    { key: 'matched', header: 'المطابقة', cell: (r) => `${r.matched_count ?? 0}/${r.line_count ?? 0}` },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge variant={r.status === 'completed' ? 'default' : r.status === 'cancelled' ? 'destructive' : 'secondary'}>{r.status}</Badge> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="تسويات البنك" description="مطابقة كشوف البنك يدوياً مع قيود اليومية" actions={<Button onClick={() => navigate('/app/accounting/bank-reconciliations/new')}><Plus className="h-4 w-4 ml-1" /> تسوية جديدة</Button>} />
      <DataTable data={data} columns={cols} emptyTitle="لا توجد تسويات بنك" onRowClick={(r) => navigate(`/app/accounting/bank-reconciliations/${r.id}`)} />
    </div>
  );
};

export default BankReconciliations;
