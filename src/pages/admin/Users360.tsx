import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import {
  users as mockUsers, companies as mockCompanies, subscriptions as mockSubs,
  plans as mockPlans, invoices as mockInvoices, payments as mockPayments,
} from '@/data/mock';
import { roleLabel, formatDateShort, companyStatusLabel } from '@/lib/format';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  companyName: string;
  planName: string;
  status: 'active' | 'suspended' | 'expired';
  createdAt: string;
  invoices: number;
}

const Users360 = () => {
  const data: UserRow[] = useMemo(() => mockUsers.map((u) => {
    const company = u.companyId ? mockCompanies.find(c => c.id === u.companyId) : null;
    const sub = u.companyId ? mockSubs.find(s => s.companyId === u.companyId) : null;
    const plan = sub ? mockPlans.find(p => p.id === sub.planId) : null;
    const invs = u.companyId ? mockInvoices.filter(i => i.companyId === u.companyId) : [];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      companyName: company?.name ?? (u.role === 'super_admin' ? 'منصة ون كليك' : '—'),
      planName: plan?.name ?? '—',
      status: (company?.status as UserRow['status']) ?? 'active',
      createdAt: company?.createdAt ?? new Date(Date.now() - 30 * 86400000).toISOString(),
      invoices: invs.length,
    };
  }), []);

  const columns: Column<UserRow>[] = [
    {
      key: 'name', header: 'المستخدم', cell: r => (
        <div className="min-w-0">
          <div className="font-medium truncate">{r.name}</div>
          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'الدور', cell: r => roleLabel(r.role) },
    { key: 'company', header: 'الشركة', cell: r => <span className="truncate">{r.companyName}</span> },
    { key: 'plan', header: 'الباقة', cell: r => r.planName },
    { key: 'invoices', header: 'الفواتير', cell: r => r.invoices },
    { key: 'created', header: 'منذ', cell: r => formatDateShort(r.createdAt) },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={companyStatusLabel(r.status)} /> },
    {
      key: 'actions', header: '', cell: r => (
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/admin/users/${r.id}`}>عرض 360
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="مستخدمو المنصة (User 360)" description="استعراض موحّد لكل المستخدمين عبر الشركات مع تفاصيل النشاط والاشتراك" />
      <DataTable data={data} columns={columns} searchKeys={['name', 'email', 'companyName']} />
    </div>
  );
};

export default Users360;
