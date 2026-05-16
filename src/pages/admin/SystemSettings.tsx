import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SystemSettings = () => {
  const [s, setS] = useState({ appName: 'ون كليك', supportEmail: 'support@oneclick.sa', currency: 'ر.س', invoicePrefix: 'INV' });
  return (
    <div>
      <PageHeader title="إعدادات النظام" description="الإعدادات العامة للمنصة" />
      <Card className="p-6 border-border/60 max-w-2xl space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>اسم التطبيق</Label><Input className="mt-1.5" value={s.appName} onChange={e => setS(v => ({ ...v, appName: e.target.value }))} /></div>
          <div><Label>بريد الدعم</Label><Input className="mt-1.5" value={s.supportEmail} onChange={e => setS(v => ({ ...v, supportEmail: e.target.value }))} /></div>
          <div><Label>العملة الافتراضية</Label><Input className="mt-1.5" value={s.currency} onChange={e => setS(v => ({ ...v, currency: e.target.value }))} /></div>
          <div><Label>بادئة الفاتورة</Label><Input className="mt-1.5" value={s.invoicePrefix} onChange={e => setS(v => ({ ...v, invoicePrefix: e.target.value }))} /></div>
        </div>
        <Button onClick={() => toast.success('تم حفظ الإعدادات')}>حفظ التغييرات</Button>
      </Card>
    </div>
  );
};

export default SystemSettings;
