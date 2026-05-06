import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { companies } from '@/data/mock';
import { toast } from 'sonner';

const SystemNotifications = () => {
  const [target, setTarget] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const send = () => {
    if (!title || !body) return toast.error('أكمل بيانات الإشعار');
    toast.success(target === 'all' ? 'تم إرسال الإشعار لجميع الشركات' : 'تم إرسال الإشعار للشركة المحددة');
    setTitle(''); setBody('');
  };

  return (
    <div>
      <PageHeader title="إشعارات النظام" description="أرسل إشعاراً لشركة محددة أو لجميع الشركات" />
      <Card className="p-6 border-border/60 max-w-2xl space-y-4">
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
        <Button onClick={send}>إرسال الإشعار</Button>
      </Card>
    </div>
  );
};

export default SystemNotifications;
