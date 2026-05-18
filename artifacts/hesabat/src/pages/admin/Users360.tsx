import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Loader2, Search } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  const { data: rows = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['admin-users-360', q],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', page_size: '200' });
      if (q) params.set('q', q);
      const res = await api.get<{ data: ApiUser[] }>(`/api/platform/users?${params}`);
      return res.data.map(fromApiUser);
    },
    enabled: isApiConfigured(),
  });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setQ(search.trim());
  }, [search]);

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
      <form onSubmit={handleSearch} className="flex gap-2 mb-4 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className="pr-9"
          />
        </div>
        <Button type="submit" variant="outline">بحث</Button>
        {q && (
          <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQ(''); }}>
            مسح
          </Button>
        )}
      </form>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable data={rows} columns={columns} searchKeys={[]} />
      )}
    </div>
  );
};

export default Users360;
