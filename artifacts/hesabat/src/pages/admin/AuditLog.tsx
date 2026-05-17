import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatCard } from '@/components/common/StatCard';
import { Download, Search, Shield, LogIn, UserCog, Ban, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuditLog } from '@/hooks/useAuditLog';
import { isApiConfigured } from '@/lib/api';
import type { AuditLogRow } from '@/lib/activityLog';

const actionTone = (action: string): 'success' | 'destructive' | 'warning' | 'info' => {
  const verb = action.split('.').pop() ?? '';
  if (['create', 'grant', 'pay', 'login', 'activate'].includes(verb)) return 'success';
  if (['delete', 'revoke', 'denied', 'suspend'].includes(verb)) return 'destructive';
  if (['update', 'assign', 'email'].includes(verb)) return 'warning';
  return 'info';
};

const actionLabel = (action: string): string => {
  const map: Record<string, string> = {
    'invoice.create': 'إنشاء فاتورة',
    'invoice.email': 'إرسال فاتورة',
    'payment.create': 'تسجيل دفعة',
    'client.create': 'إضافة عميل',
    'client.update': 'تعديل عميل',
    'client.delete': 'حذف عميل',
    'product.create': 'إضافة منتج',
    'product.update': 'تعديل منتج',
    'product.delete': 'حذف منتج',
    'user.invite': 'دعوة مستخدم',
    'company.activate': 'تفعيل شركة',
    'company.suspend': 'تعليق شركة',
    'platform_wallet.create': 'إضافة محفظة',
    'platform_wallet.update': 'تعديل محفظة',
    'platform_wallet.delete': 'حذف محفظة',
    'subscription_payment.create': 'تسجيل دفعة اشتراك',
    'feature_access.update': 'تعديل الصلاحيات',
    'system_notification.send': 'إرسال إشعار',
  };
  return map[action] ?? action;
};

const entityIcon = (entity: string): typeof Shield => {
  if (entity === 'user') return UserCog;
  if (entity === 'company') return Ban;
  if (entity === 'platform_wallet') return Activity;
  return Shield;
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
};

const AuditLog = () => {
  const apiOn = isApiConfigured();
  const [entity, setEntity] = useState('all');
  const [action, setAction] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAuditLog({
    platform: true,
    entity: entity !== 'all' ? entity : undefined,
    action: action !== 'all' ? action : undefined,
    page,
    page_size: 100,
  });

  const rows: AuditLogRow[] = data?.data ?? [];
  const total = data?.total ?? 0;

  const filtered = q
    ? rows.filter(e => {
        const text = `${e.action} ${e.entity} ${e.user_name ?? ''} ${e.user_email ?? ''} ${e.company_name ?? ''}`;
        return text.toLowerCase().includes(q.toLowerCase());
      })
    : rows;

  const stats = {
    total,
    logins: rows.filter(e => e.action.includes('login')).length,
    denials: rows.filter(e => e.action.includes('denied') || e.action.includes('suspend')).length,
    creates: rows.filter(e => e.action.endsWith('.create')).length,
  };

  const exportCsv = () => {
    const headers = ['date', 'company', 'entity', 'action', 'user', 'email'];
    const lines = filtered.map(e => [
      e.created_at,
      e.company_name ?? '',
      e.entity,
      e.action,
      e.user_name ?? '',
      e.user_email ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['\ufeff' + [headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير السجل');
  };

  if (!apiOn) {
    return (
      <div>
        <PageHeader title="سجل التدقيق (Audit Log)" description="سجل بكل أحداث المنصة" />
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto opacity-40 mb-3" />
          <p>يتطلب الاتصال بالخادم لعرض سجل التدقيق.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="سجل التدقيق (Audit Log)"
        description="سجل بكل أحداث المنصة — الفواتير، المدفوعات، الشركات، والمستخدمين"
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 ml-1" /> تصدير CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="إجمالي الأحداث" value={stats.total} icon={Activity} accent="primary" />
        <StatCard title="الإنشاءات" value={stats.creates} icon={LogIn} accent="success" />
        <StatCard title="التعليق / الرفض" value={stats.denials} icon={Ban} accent="destructive" />
        <StatCard title="أحداث هذه الصفحة" value={filtered.length} icon={Shield} accent="warning" />
      </div>

      <Card className="p-4 border-border/60 shadow-soft mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث في الإجراء أو الشركة أو المستخدم..." className="pr-9" />
          </div>
          <Select value={entity} onValueChange={v => { setEntity(v); setPage(1); }}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الكيانات</SelectItem>
              <SelectItem value="invoice">الفواتير</SelectItem>
              <SelectItem value="payment">المدفوعات</SelectItem>
              <SelectItem value="client">العملاء</SelectItem>
              <SelectItem value="company">الشركات</SelectItem>
              <SelectItem value="user">المستخدمون</SelectItem>
              <SelectItem value="platform_wallet">المحافظ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 border-border/60 shadow-soft overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto opacity-40 mb-3 animate-pulse" />
            جارٍ تحميل السجل...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto opacity-40 mb-3" />
            لا توجد أحداث تطابق الفلاتر الحالية.
          </div>
        ) : (
          <table dir="rtl" className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-2.5 font-semibold">التاريخ</th>
                <th className="text-start px-4 py-2.5 font-semibold">الشركة</th>
                <th className="text-start px-4 py-2.5 font-semibold">المستخدم</th>
                <th className="text-start px-4 py-2.5 font-semibold">الإجراء</th>
                <th className="text-start px-4 py-2.5 font-semibold">الكيان</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const Icon = entityIcon(e.entity);
                const tone = actionTone(e.action);
                return (
                  <tr key={e.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {e.company_name ?? <span className="text-xs italic">منصة</span>}
                    </td>
                    <td className="px-4 py-3">
                      {e.user_name ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px] bg-muted">{e.user_name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{e.user_name}</div>
                            {e.user_email && <div className="text-xs text-muted-foreground truncate">{e.user_email}</div>}
                          </div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={cn('border-0',
                        tone === 'success' && 'bg-success/15 text-success',
                        tone === 'destructive' && 'bg-destructive/15 text-destructive',
                        tone === 'warning' && 'bg-warning/15 text-warning',
                        tone === 'info' && 'bg-muted text-muted-foreground',
                      )}>
                        {actionLabel(e.action)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {e.entity}
                        {e.entity_id && <span dir="ltr" className="text-[10px] opacity-60">{e.entity_id.slice(0, 8)}</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {(data?.total ?? 0) > 100 && (
        <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
          <span>عرض {filtered.length} من أصل {total} سجل</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={rows.length < 100}>التالي</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
