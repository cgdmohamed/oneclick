import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { api, isApiConfigured } from '@/lib/api';
import { companyStatusLabel, formatDateShort } from '@/lib/format';

interface ApiRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  review_status: string;
  created_at: string;
  owner_name: string | null;
  plan_name: string | null;
  sub_status: string | null;
}

interface Row {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  planName: string;
  createdAt: string;
  status: 'active' | 'suspended' | 'expired';
}

function deriveStatus(row: ApiRow): Row['status'] {
  if (!row.is_active) return 'suspended';
  if (row.sub_status === 'expired') return 'expired';
  return 'active';
}

function fromApiRow(r: ApiRow): Row {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    ownerName: r.owner_name ?? '—',
    planName: r.plan_name ?? '—',
    createdAt: r.created_at,
    status: deriveStatus(r),
  };
}

const CompaniesAndUsers = () => {
  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const res = await api.get<{ data: ApiRow[] }>('/api/platform/companies');
      return res.data.map(fromApiRow);
    },
    enabled: isApiConfigured(),
  });

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
    {
      key: 'status', header: 'الحالة',
      cell: r => <StatusBadge status={r.status} label={companyStatusLabel(r.status)} />,
    },
    {
      key: 'actions', header: '', cell: r => (
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/admin/companies/${r.id}`}>إدارة
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
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable data={rows} columns={columns} searchKeys={['name', 'ownerName', 'email']} />
      )}
    </div>
  );
};

export default CompaniesAndUsers;
