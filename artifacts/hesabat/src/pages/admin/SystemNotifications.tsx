import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { companies as mockCompanies } from '@/data/mock';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAdminNotifications } from '@/hooks/useNotificationsAlerts';
import { CheckCheck, Crown } from 'lucide-react';

interface CompanyRow { id: string; name: string }
interface SysNotif { id: string; title: string; body: string; audience: string; read_at: string | null; created_at: string }

const SystemNotifications = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const [target, setTarget] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const { notifications: planChangeRequests, markRead, markAllRead } = useAdminNotifications();
  const unreadPlanChanges = planChangeRequests.filter(n => !n.read_at);

  const companiesQ = useQuery({
    enabled: apiOn,
    queryKey: ['admin-companies'],
    queryFn: async () => (await api.get<{ data: CompanyRow[] }>('/api/platform/companies')).data,
  });
  const notifQ = useQuery({
    enabled: apiOn,
    queryKey: ['system-notifications'],
    queryFn: async () => (await api.get<{ data: SysNotif[] }>('/api/platform/system-notifications')).data,
  });

  const broadcastNotifs = (notifQ.data ?? []).filter(n => n.audience !== 'admin');
  const companies = apiOn ? (companiesQ.data ?? []) : mockCompanies.map(c => ({ id: c.id, name: c.name }));

  const sendMut = useMutation({
    mutationFn: () => api.post('/api/platform/system-notifications', { title, body, audience: target }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-notifications'] });
      toast.success(target === 'all' ? 'تم البث لجميع الشركات' : 'تم الإرسال للشركة المحددة');
      setTitle(''); setBody('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر الإرسال'),
  });

  const send = () => {
    if (!title || !body) return toast.error('أكمل بيانات الإشعار');
    if (apiOn) sendMut.mutate();
    else { toast.success('تم الإرسال (تجريبي)'); setTitle(''); setBody(''); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="إشعارات النظام" description="طلبات تغيير الباقة وإرسال الإشعارات العامة" />

      {/* Plan-change requests section */}
      <Card className="p-6 border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-warning" />
            <h3 className="font-semibold text-base">طلبات تغيير الباقة</h3>
            {unreadPlanChanges.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-bold">
                {unreadPlanChanges.length}
              </Badge>
            )}
          </div>
          {unreadPlanChanges.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => markAllRead()}>
              <CheckCheck className="h-4 w-4" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>

        {planChangeRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد طلبات تغيير باقة حتى الآن.</p>
        ) : (
          <ul className="space-y-3">
            {planChangeRequests.map(n => (
              <li
                key={n.id}
                className={`p-3 rounded-lg text-sm border transition-colors ${
                  n.read_at
                    ? 'bg-muted/30 border-transparent'
                    : 'bg-warning/5 border-warning/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {!n.read_at && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-warning shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{n.title}</p>
                      <p className="text-muted-foreground mt-0.5">{n.body}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(n.created_at)}</span>
                    {!n.read_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => markRead(n.id)}
                      >
                        تحديد كمقروء
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Broadcast compose + history */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-6 border-border/60 space-y-4">
          <h3 className="font-semibold text-base mb-1">إرسال إشعار للشركات</h3>
          <div>
            <Label>المستهدف</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشركات</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>العنوان</Label><Input className="mt-1.5" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><Label>الرسالة</Label><Textarea rows={5} className="mt-1.5" value={body} onChange={e => setBody(e.target.value)} /></div>
          <Button onClick={send} disabled={sendMut.isPending}>
            {sendMut.isPending ? 'جارٍ الإرسال…' : 'إرسال الإشعار'}
          </Button>
        </Card>

        <Card className="p-6 border-border/60">
          <h3 className="font-semibold mb-3">آخر الإشعارات المرسلة</h3>
          {!apiOn ? (
            <p className="text-sm text-muted-foreground">فعّل الـ API لعرض السجل.</p>
          ) : broadcastNotifs.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد إشعارات مرسلة بعد.</p>
          ) : (
            <ul className="space-y-3">
              {broadcastNotifs.slice(0, 20).map(n => (
                <li key={n.id} className="p-3 rounded-lg bg-muted/40 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
                  </div>
                  <p className="text-muted-foreground mt-1">{n.body}</p>
                  <span className="inline-block mt-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {n.audience === 'all' ? 'كل الشركات' : (companies.find(c => c.id === n.audience)?.name ?? n.audience)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SystemNotifications;
