import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { ActivityEntry, ActivityModule, clearActivity, useActivityLog } from '@/lib/activityLog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { toast } from 'sonner';

const moduleLabel: Record<ActivityModule, string> = {
  product: 'منتجات',
  category: 'تصنيفات',
  invoice: 'فواتير',
  payment: 'مدفوعات',
  client: 'عملاء',
  system: 'النظام',
  role: 'الأدوار',
  user: 'المستخدمون',
  auth: 'المصادقة',
  permission: 'الصلاحيات',
};

const actionLabel: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  pay: 'دفع',
  login: 'دخول',
  logout: 'خروج',
};

const actionStatus = (a: string): 'active' | 'expired' | 'partial' | 'unpaid' => {
  if (a === 'create' || a === 'pay' || a === 'login') return 'active';
  if (a === 'delete' || a === 'logout') return 'expired';
  return 'partial';
};

const formatDateTime = (iso: string) => {
  try { return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

const ActivityLog = () => {
  const entries = useActivityLog();
  const [mod, setMod] = useState<string>('all');

  const filtered = useMemo(
    () => mod === 'all' ? entries : entries.filter(e => e.module === mod),
    [mod, entries],
  );

  const columns: Column<ActivityEntry>[] = [
    { key: 'date', header: 'التاريخ', cell: r => <span className="text-muted-foreground text-sm">{formatDateTime(r.date)}</span> },
    { key: 'user', header: 'المستخدم', cell: r => (
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{r.userName ?? '—'}</div>
        {r.userEmail && <div className="text-xs text-muted-foreground truncate">{r.userEmail}</div>}
      </div>
    )},
    { key: 'mod', header: 'القسم', cell: r => moduleLabel[r.module] ?? r.module },
    { key: 'action', header: 'الإجراء', cell: r => <StatusBadge status={actionStatus(r.action)} label={actionLabel[r.action] ?? r.action} /> },
    { key: 'desc', header: 'التفاصيل', cell: r => <span className="text-sm">{r.description}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="سجل الأنشطة"
        description="سجل بكل العمليات التي تتم في النظام ومن قام بها"
        actions={
          <Button
            variant="outline"
            onClick={() => { clearActivity(); toast.success('تم مسح السجل'); }}
            disabled={entries.length === 0}
          >
            <Trash2 className="h-4 w-4 ml-1" /> مسح السجل
          </Button>
        }
      />
      <DataTable
        data={filtered}
        columns={columns}
        searchKeys={['description']}
        searchPlaceholder="ابحث في الوصف..."
        rightToolbar={
          <Select value={mod} onValueChange={setMod}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {Object.entries(moduleLabel).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
};

export default ActivityLog;
