import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import {
  companies as mockCompanies, plans as mockPlans, users as mockUsers,
} from '@/data/mock';
import { companyStatusLabel, formatDateShort } from '@/lib/format';

interface Row {
  id: string;
  name: string;
  ownerName: string;
  ownerUserId: string | null;
  email: string;
  planName: string;
  createdAt: string;
  status: 'active' | 'suspended' | 'expired';
}

const CompaniesAndUsers = () => {
  const data: Row[] = useMemo(() =>
    mockCompanies.map((c) => {
      const owner = mockUsers.find(u => u.companyId === c.id && u.role === 'company_admin')
        ?? mockUsers.find(u => u.companyId === c.id);
      return {
        id: c.id,
        name: c.name,
        ownerName: c.ownerName,
        ownerUserId: owner?.id ?? null,
        email: c.email,
        planName: mockPlans.find(p => p.id === c.planId)?.name ?? '—',
        createdAt: c.createdAt,
        status: c.status,
      };
    }), []);

  const columns: Column<Row>[] = [
    {
      key: 'company', header: 'الشركة', cell: r => (
        <div className="min-w-0">
          <div className="font-medium truncate">{r.name}</div>
          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
        </div>
      ),
    },
    { key: 'owner', header: 'المشترك', cell: r => r.ownerName },
    { key: 'plan', header: 'الباقة', cell: r => r.planName },
    { key: 'created', header: 'التسجيل', cell: r => formatDateShort(r.createdAt) },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={companyStatusLabel(r.status)} /> },
    {
      key: 'actions', header: '', cell: r => (
        <Button asChild variant="ghost" size="sm" className="gap-1" disabled={!r.ownerUserId}>
          <Link to={`/admin/users/${r.ownerUserId ?? ''}`}>إدارة
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الشركات والمشتركون"
        description="قائمة موحّدة بكل الشركات المسجلة على المنصة ومسؤولي الاشتراك"
      />
      <DataTable data={data} columns={columns} searchKeys={['name', 'ownerName', 'email']} />
    </div>
  );
};

export default CompaniesAndUsers;
