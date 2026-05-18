import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { companies as mockCompanies, plans as mockPlans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Pencil, PowerOff } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { companyStatusLabel, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';

interface CompanyRow {
  id: string; name: string; email: string | null; phone: string | null;
  is_active: boolean; review_status: string | null; created_at: string;
  owner_name: string | null; plan_name: string | null; sub_status: string | null;
}
interface UICompany {
  id: string; name: string; email: string; ownerName: string;
  planName: string; createdAt: string; status: 'active' | 'suspended' | 'expired';
  reviewStatus: string | null;
}

function reviewStatusLabel(s: string | null): string {
  switch (s) {
    case 'approved': return 'مقبولة';
    case 'pending':  return 'بانتظار المراجعة';
    case 'declined': return 'مرفوضة';
    default: return s ?? '—';
  }
}

const REVIEW_STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 border-green-200',
  pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  declined: 'bg-red-100 text-red-800 border-red-200',
};

const ReviewBadge = ({ status }: { status: string | null }) => {
  const cls = REVIEW_STATUS_COLORS[status ?? ''] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {reviewStatusLabel(status)}
    </span>
  );
};

const Companies = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();

  const q = useQuery({
    enabled: apiOn,
    queryKey: ['admin-companies'],
    queryFn: async () => (await api.get<{ data: CompanyRow[] }>('/api/platform/companies')).data,
  });

  const data: UICompany[] = useMemo(() => {
    if (apiOn) {
      return (q.data ?? []).map((r) => ({
        id: r.id, name: r.name,
        email: r.email ?? '', ownerName: r.owner_name ?? '—',
        planName: r.plan_name ?? '—', createdAt: r.created_at,
        status: !r.is_active
          ? 'suspended'
          : (r.sub_status === 'expired' ? 'expired' : 'active'),
        reviewStatus: r.review_status,
      }));
    }
    return mockCompanies.map((c) => ({
      id: c.id, name: c.name, email: c.email, ownerName: c.ownerName,
      planName: mockPlans.find((p) => p.id === c.planId)?.name ?? '—',
      createdAt: c.createdAt, status: c.status,
      reviewStatus: 'approved',
    }));
  }, [apiOn, q.data]);

  const toggleMut = useMutation({
    mutationFn: async (c: UICompany) =>
      api.patch(`/api/platform/companies/${c.id}`, { is_active: c.status === 'suspended' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('تم تحديث الحالة');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر التحديث'),
  });

  const columns: Column<UICompany>[] = [
    { key: 'name', header: 'الشركة', cell: r => <span className="font-medium">{r.name}</span> },
    { key: 'owner', header: 'المسؤول', cell: r => r.ownerName },
    { key: 'email', header: 'البريد', cell: r => <span className="text-muted-foreground text-sm">{r.email}</span> },
    { key: 'plan', header: 'الباقة', cell: r => r.planName },
    { key: 'created', header: 'التسجيل', cell: r => formatDateShort(r.createdAt) },
    { key: 'review_status', header: 'حالة المراجعة', cell: r => <ReviewBadge status={r.reviewStatus} /> },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={companyStatusLabel(r.status)} /> },
    { key: 'actions', header: '', cell: r => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" disabled title="تعديل (قريباً)"><Pencil className="h-4 w-4 opacity-50" /></Button>
        <Button variant="ghost" size="icon" onClick={() => apiOn ? toggleMut.mutate(r) : toast.message('فعّل API')}>
          <PowerOff className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="الشركات" description="إدارة الشركات المسجلة على المنصة" />
      <DataTable data={data} columns={columns} searchKeys={['name','email','ownerName']} />
    </div>
  );
};

export default Companies;
