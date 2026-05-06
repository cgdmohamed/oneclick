import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { NotificationItem } from '@/components/common/NotificationItem';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { notifications as initial } from '@/data/mock';
import type { Notification } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const Notifications = () => {
  const [list, setList] = useState<Notification[]>(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });

  const send = () => {
    if (!draft.title || !draft.body) return toast.error('أكمل البيانات');
    setList(prev => [{ id: `n-${Date.now()}`, category: 'system', title: draft.title, body: draft.body, date: new Date().toISOString(), read: false }, ...prev]);
    setOpen(false); setDraft({ title: '', body: '' });
    toast.success('تم إرسال الإشعار (تجريبي)');
  };

  return (
    <div>
      <PageHeader title="التنبيهات" description="آخر تنبيهات النظام لشركتك"
        actions={<Button onClick={() => setOpen(true)}><Send className="h-4 w-4 ml-1" /> إشعار يدوي</Button>} />

      <div className="space-y-3 max-w-3xl">
        {list.map(n => (
          <NotificationItem key={n.id} n={n} onMarkRead={() => setList(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))} />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إرسال إشعار يدوي</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>العنوان</Label><Input className="mt-1.5" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></div>
            <div><Label>الرسالة</Label><Textarea rows={4} className="mt-1.5" value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} /></div>
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
