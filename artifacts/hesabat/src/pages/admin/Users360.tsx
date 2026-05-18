import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { api, isApiConfigured } from '@/lib/api';
import { roleLabel, formatDateShort } from '@/lib/format';

interface ApiCompany {
  company_id: string;
  company_name: string;
  role: string;
}

interface ApiUser {
  id: string;
  email: string;
  name: string;
  is_super_admin: boolean;
  created_at: string;
  companies: ApiCompany[] | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  companyName: string;
  isSuperAdmin: boolean;
  createdAt: string;
}

function fromApiUser(u: ApiUser): UserRow {
  const companies = u.companies ?? [];
  const primary = companies[0];
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.is_super_admin ? 'super_admin' : (primary?.role ?? '—'),
    companyName: u.is_super_admin ? 'منصة ون كليك' : (primary?.company_name ?? '—'),
    isSuperAdmin: u.is_super_admin,
    createdAt: u.created_at,
  };
}

const Users360 = () => {
  const { data: rows = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['admin-users-360'],
    queryFn: async () => {
      const res = await api.get<{ data: ApiUser[] }>('/api/platform/users?limit=500');
      return res.data.map(fromApiUser);
    },
    enabled: isApiConfigured(),
  });

  const columns: Column<UserRow>[] = [
    {
      key: 'name', header: 'المستخدم', cell: r => (
        <div className="min-w-0">
          <div className="font-medium truncate flex items-center gap-1.5">
            {r.name}
            {r.isSuperAdmin && (
              <Badge variant="secondary" className="text-xs shrink-0 bg-primary/10 text-primary border-0">
                مشرف
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'الدور', cell: r => roleLabel(r.role) },
    { key: 'company', header: 'الشركة', cell: r => <span className="truncate">{r.companyName}</span> },
    { key: 'created', header: 'منذ', cell: r => formatDateShort(r.createdAt) },
    {
      key: 'actions', header: '', cell: r => (
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/admin/users/${r.id}`}>إدارة
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="مستخدمو المنصة"
        description="استعراض موحّد لكل المستخدمين عبر الشركات مع تفاصيل النشاط والاشتراك"
      />
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable data={rows} columns={columns} searchKeys={['name', 'email', 'companyName']} />
      )}
    </div>
  );
};

export default Users360;
