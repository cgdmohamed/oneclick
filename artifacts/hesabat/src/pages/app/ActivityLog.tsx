import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { isApiConfigured } from '@/lib/api';
import type { AuditLogRow } from '@/lib/activityLog';
import { cn } from '@/lib/utils';

const entityLabel: Record<string, string> = {
  invoice: 'فواتير',
  payment: 'مدفوعات',
  client: 'عملاء',
  product: 'منتجات',
  account: 'حسابات',
  user: 'مستخدمون',
  company: 'الشركة',
};

const actionVerb = (action: string): string => {
  const verb = action.split('.').pop() ?? action;
  const map: Record<string, string> = {
    create: 'إنشاء',
    update: 'تعديل',
    delete: 'حذف',
    email: 'إرسال بريد',
    pay: 'دفع',
    login: 'دخول',
    logout: 'خروج',
  };
  return map[verb] ?? verb;
};

const actionTone = (action: string): string => {
  const verb = action.split('.').pop() ?? action;
  if (['create', 'pay', 'login'].includes(verb)) return 'bg-success/15 text-success';
  if (['delete', 'logout'].includes(verb)) return 'bg-destructive/15 text-destructive';
  if (['update', 'email'].includes(verb)) return 'bg-warning/15 text-warning';
  return 'bg-muted text-muted-foreground';
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
};

const ENTITIES = Object.keys(entityLabel);

const ActivityLog = () => {
  const apiOn = isApiConfigured();
  const [entity, setEntity] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useAuditLog({
    entity: entity !== 'all' ? entity : undefined,
    page,
    page_size: pageSize,
  });

  const rows: AuditLogRow[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'date',
      header: 'التاريخ',
      cell: r => <span className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(r.created_at)}</span>,
    },
    {
      key: 'user',
      header: 'المستخدم',
      cell: r => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{r.user_name ?? '—'}</div>
          {r.user_email && <div className="text-xs text-muted-foreground truncate">{r.user_email}</div>}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'القسم',
      cell: r => <span className="text-sm">{entityLabel[r.entity] ?? r.entity}</span>,
    },
    {
      key: 'action',
      header: 'الإجراء',
      cell: r => (
        <Badge variant="secondary" className={cn('border-0', actionTone(r.action))}>
          {actionVerb(r.action)}
        </Badge>
      ),
    },
    {
      key: 'detail',
      header: 'التفاصيل',
      cell: r => (
        <span className="text-sm text-muted-foreground">
          {r.entity} {r.entity_id ? `#${r.entity_id.slice(0, 8)}` : ''}
          {r.data ? ` — ${JSON.stringify(r.data).slice(0, 80)}` : ''}
        </span>
      ),
    },
  ];

  if (!apiOn) {
    return (
      <div>
        <PageHeader title="سجل الأنشطة" description="سجل بكل العمليات التي تتم في النظام" />
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto opacity-40 mb-3" />
          <p>يتطلب الاتصال بالخادم لعرض سجل الأنشطة.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="سجل الأنشطة"
        description="سجل بكل العمليات التي تتم في النظام ومن قام بها"
      />
      <DataTable
        data={rows}
        columns={columns}
        searchKeys={['action', 'entity']}
        searchPlaceholder="ابحث في الإجراء أو القسم..."
        emptyTitle={isLoading ? 'جارٍ التحميل...' : 'لا توجد أحداث'}
        pageSize={50}
        rightToolbar={
          <Select value={entity} onValueChange={v => { setEntity(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {ENTITIES.map(k => (
                <SelectItem key={k} value={k}>{entityLabel[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {totalPages > 1 && (
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</Button>
          <span className="text-xs text-muted-foreground self-center tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>التالي</Button>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
