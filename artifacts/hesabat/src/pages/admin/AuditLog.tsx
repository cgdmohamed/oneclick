import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatCard } from '@/components/common/StatCard';
import { Trash2, Download, Search, Shield, LogIn, UserCog, Ban, Activity } from 'lucide-react';
import { clearActivity, logActivity, useActivityLog, type ActivityEntry, type ActivityModule, type ActivityAction } from '@/lib/activityLog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SEED_FLAG = 'oneclick.audit-log.seeded.v1';

const moduleLabel: Record<ActivityModule, string> = {
  product: 'منتجات', category: 'تصنيفات', invoice: 'فواتير', payment: 'مدفوعات', client: 'عملاء',
  system: 'النظام', role: 'الأدوار', user: 'المستخدمون', auth: 'المصادقة', permission: 'الصلاحيات',
};

const actionLabel: Record<ActivityAction, string> = {
  create: 'إنشاء', update: 'تعديل', delete: 'حذف', pay: 'دفع', login: 'دخول', logout: 'خروج',
  assign: 'إسناد', grant: 'منح', revoke: 'سحب', denied: 'رفض وصول',
};

const actionTone = (a: ActivityAction): 'success' | 'destructive' | 'warning' | 'info' | 'primary' => {
  if (a === 'create' || a === 'grant' || a === 'pay' || a === 'login') return 'success';
  if (a === 'delete' || a === 'revoke' || a === 'denied') return 'destructive';
  if (a === 'update' || a === 'assign') return 'warning';
  return 'info';
};

const moduleIcon: Record<ActivityModule, typeof Shield> = {
  auth: LogIn, role: Shield, user: UserCog, permission: Ban,
  system: Activity, product: Activity, category: Activity, invoice: Activity, payment: Activity, client: Activity,
};

const formatDateTime = (iso: string) => {
  try { return new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

/** Seed a few audit entries on first visit so the page isn't empty. */
const seedOnce = () => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG)) return;
  localStorage.setItem(SEED_FLAG, '1');
  const seedEntries: Array<Omit<ActivityEntry, 'id'>> = [
    { date: new Date(Date.now() - 1 * 3600000).toISOString(), module: 'auth', action: 'login', description: 'تسجيل دخول ناجح من 41.214.x.x — Chrome / Windows', userName: 'مالك المنصة', userEmail: 'owner@oneclick.eg' },
    { date: new Date(Date.now() - 2 * 3600000).toISOString(), module: 'auth', action: 'denied', description: 'محاولة دخول فاشلة (كلمة مرور خاطئة) — البريد admin@unknown.eg', userName: 'مجهول', userEmail: 'admin@unknown.eg' },
    { date: new Date(Date.now() - 5 * 3600000).toISOString(), module: 'role', action: 'create', description: 'تم إنشاء الدور المخصص «كاشير» (6 صلاحيات)', userName: 'مالك المنصة', userEmail: 'owner@oneclick.eg' },
    { date: new Date(Date.now() - 7 * 3600000).toISOString(), module: 'user', action: 'assign', description: 'تغيير دور منى الشمري من «محاسب» إلى «مراجع مالي»', userName: 'مالك المنصة', userEmail: 'owner@oneclick.eg' },
    { date: new Date(Date.now() - 1 * 86400000).toISOString(), module: 'permission', action: 'denied', description: 'حاول المستخدم ريم العتيبي حذف فاتورة — رُفض (صلاحية ناقصة)', userName: 'ريم العتيبي', userEmail: 'reem@alofok.eg' },
    { date: new Date(Date.now() - 2 * 86400000).toISOString(), module: 'role', action: 'update', description: 'تعديل صلاحيات دور «محاسب» — إضافة تصدير التقارير', userName: 'مالك المنصة', userEmail: 'owner@oneclick.eg' },
    { date: new Date(Date.now() - 3 * 86400000).toISOString(), module: 'auth', action: 'logout', description: 'خروج يدوي من الجلسة', userName: 'فهد الدوسري', userEmail: 'fahd@alofok.eg' },
    { date: new Date(Date.now() - 4 * 86400000).toISOString(), module: 'user', action: 'create', description: 'تمت إضافة مستخدم جديد إلى شركة الأفق', userName: 'خالد العبدالله', userEmail: 'admin@alofok.eg' },
  ];
  // Insert oldest first so newest stays on top
  [...seedEntries].reverse().forEach(e => logActivity(e));
};

const AuditLog = () => {
  const entries = useActivityLog();
  const [mod, setMod] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [q, setQ] = useState('');

  useEffect(() => { seedOnce(); }, []);

  const platformEntries = useMemo(
    () => entries.filter(e => ['role', 'user', 'auth', 'permission', 'system'].includes(e.module)),
    [entries],
  );

  const filtered = useMemo(() => {
    return platformEntries.filter(e => {
      if (mod !== 'all' && e.module !== mod) return false;
      if (action !== 'all' && e.action !== action) return false;
      if (q && !`${e.description} ${e.userName ?? ''} ${e.userEmail ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [platformEntries, mod, action, q]);

  const stats = useMemo(() => ({
    total: platformEntries.length,
    logins: platformEntries.filter(e => e.module === 'auth' && e.action === 'login').length,
    denials: platformEntries.filter(e => e.action === 'denied').length,
    roleChanges: platformEntries.filter(e => e.module === 'role' || (e.module === 'user' && e.action === 'assign')).length,
  }), [platformEntries]);

  const exportCsv = () => {
    const headers = ['date', 'module', 'action', 'user', 'email', 'description'];
    const rows = filtered.map(e => [
      e.date,
      moduleLabel[e.module] ?? e.module,
      actionLabel[e.action] ?? e.action,
      e.userName ?? '',
      e.userEmail ?? '',
      `"${(e.description ?? '').replace(/"/g, '""')}"`,
    ].join(','));
    const blob = new Blob(['\ufeff' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير السجل');
  };

  return (
    <div>
      <PageHeader
        title="سجل التدقيق (Audit Log)"
        description="سجل بكل أحداث المصادقة، الأدوار، الصلاحيات، وتغييرات المستخدمين على مستوى المنصة"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 ml-1" /> تصدير CSV
            </Button>
            <Button variant="outline" className="text-destructive" onClick={() => { clearActivity(); toast.success('تم مسح السجل'); }} disabled={entries.length === 0}>
              <Trash2 className="h-4 w-4 ml-1" /> مسح
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="إجمالي الأحداث" value={stats.total} icon={Activity} accent="primary" />
        <StatCard title="تسجيلات دخول" value={stats.logins} icon={LogIn} accent="success" />
        <StatCard title="رفض/فشل" value={stats.denials} icon={Ban} accent="destructive" />
        <StatCard title="تغييرات الأدوار" value={stats.roleChanges} icon={Shield} accent="warning" />
      </div>

      <Card className="p-4 border-border/60 shadow-soft mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث في الوصف أو المستخدم..." className="pr-9" />
          </div>
          <Select value={mod} onValueChange={setMod}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              <SelectItem value="auth">المصادقة</SelectItem>
              <SelectItem value="role">الأدوار</SelectItem>
              <SelectItem value="user">المستخدمون</SelectItem>
              <SelectItem value="permission">الصلاحيات</SelectItem>
              <SelectItem value="system">النظام</SelectItem>
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {Object.entries(actionLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 border-border/60 shadow-soft overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto opacity-40 mb-3" />
            لا توجد أحداث تطابق الفلاتر الحالية.
          </div>
        ) : (
          <table dir="rtl" className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-2.5 font-semibold">التاريخ</th>
                <th className="text-start px-4 py-2.5 font-semibold">المستخدم</th>
                <th className="text-start px-4 py-2.5 font-semibold">القسم</th>
                <th className="text-start px-4 py-2.5 font-semibold">الإجراء</th>
                <th className="text-start px-4 py-2.5 font-semibold">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const Icon = moduleIcon[e.module] ?? Activity;
                const tone = actionTone(e.action);
                return (
                  <tr key={e.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{formatDateTime(e.date)}</td>
                    <td className="px-4 py-3">
                      {e.userName ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-muted">{e.userName[0]}</AvatarFallback></Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{e.userName}</div>
                            {e.userEmail && <div className="text-xs text-muted-foreground truncate">{e.userEmail}</div>}
                          </div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {moduleLabel[e.module] ?? e.module}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={cn(
                        'border-0',
                        tone === 'success' && 'bg-success/15 text-success',
                        tone === 'destructive' && 'bg-destructive/15 text-destructive',
                        tone === 'warning' && 'bg-warning/15 text-warning',
                        tone === 'info' && 'bg-info/15 text-info',
                      )}>
                        {actionLabel[e.action] ?? e.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{e.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default AuditLog;
