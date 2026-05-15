import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { NotificationItem } from '@/components/common/NotificationItem';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, CheckCheck, Inbox } from 'lucide-react';
import { useNotifications } from '@/hooks/entities';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/common/EmptyState';
import type { Notification } from '@/types';

const Notifications = () => {
  const { list, save } = useNotifications();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [draft, setDraft] = useState({ title: '', body: '' });

  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list]);
  const filtered = filter === 'unread' ? list.filter((n) => !n.read) : list;

  const send = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return toast.error('أكمل البيانات');
    await save({
      id: `n-${Date.now()}`,
      category: 'system',
      title: draft.title.trim(),
      body: draft.body.trim(),
      date: new Date().toISOString(),
      read: false,
    });
    setOpen(false);
    setDraft({ title: '', body: '' });
    toast.success('تم إرسال الإشعار');
  };

  const optimisticMark = (predicate: (n: Notification) => boolean) => {
    qc.setQueryData<Notification[]>(['notifications'], (prev) =>
      (prev ?? list).map((n) => (predicate(n) ? { ...n, read: true } : n)),
    );
  };

  const markRead = async (id: string) => {
    optimisticMark((n) => n.id === id);
    if (!isApiConfigured()) return;
    try {
      await api.post(`/api/notifications/${id}/read`);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر التحديث');
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    const unread = list.filter((n) => !n.read);
    optimisticMark((n) => !n.read);
    if (!isApiConfigured()) {
      toast.success('تم تعليم الكل كمقروء');
      return;
    }
    try {
      await Promise.all(unread.map((n) => api.post(`/api/notifications/${n.id}/read`)));
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('تم تعليم الكل كمقروء');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر تحديث الكل');
    }
  };

  return (
    <div>
      <PageHeader
        title="التنبيهات"
        description="آخر تنبيهات النظام لشركتك مع إمكانية تعليمها كمقروءة"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="h-4 w-4 ml-1" /> تعليم الكل كمقروء
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Send className="h-4 w-4 ml-1" /> إشعار يدوي
            </Button>
          </div>
        }
      />

      <div className="max-w-3xl">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')} className="mb-4">
          <TabsList>
            <TabsTrigger value="all">
              الكل <Badge variant="secondary" className="mr-2">{list.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unread">
              غير المقروءة
              {unreadCount > 0 && (
                <Badge className="mr-2 bg-primary text-primary-foreground">{unreadCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
            description="ستظهر هنا تنبيهات النظام والفواتير والمدفوعات."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((n) => (
              <NotificationItem key={n.id} n={n} onMarkRead={() => markRead(n.id)} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إرسال إشعار يدوي</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>العنوان</Label><Input className="mt-1.5" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} /></div>
            <div><Label>الرسالة</Label><Textarea rows={4} className="mt-1.5" value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={send}>إرسال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Notifications;
