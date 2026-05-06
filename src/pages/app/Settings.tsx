import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const [profile, setProfile] = useState({ name: 'شركة الأفق للتجارة', email: 'info@alofok.sa', phone: '+966551112233', address: 'الرياض، حي الملقا', tax: '300123456700003' });
  const [invoiceCfg, setInvoiceCfg] = useState({ prefix: 'INV', currency: 'ر.س', taxRate: 15, terms: 'تستحق الفاتورة خلال 30 يوماً من تاريخ الإصدار.' });

  const save = () => toast.success('تم حفظ الإعدادات');

  return (
    <div>
      <PageHeader title="الإعدادات" description="إعدادات الشركة والفواتير والهوية" />
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">ملف الشركة</TabsTrigger>
          <TabsTrigger value="invoice">إعدادات الفاتورة</TabsTrigger>
          <TabsTrigger value="branding">الهوية</TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="mt-4">
          <Card className="p-6 border-border/60 max-w-2xl space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>اسم الشركة</Label><Input className="mt-1.5" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>البريد</Label><Input className="mt-1.5" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>الهاتف</Label><Input className="mt-1.5" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><Label>الرقم الضريبي</Label><Input className="mt-1.5" value={profile.tax} onChange={e => setProfile(p => ({ ...p, tax: e.target.value }))} /></div>
              <div className="sm:col-span-2"><Label>العنوان</Label><Input className="mt-1.5" value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} /></div>
            </div>
            <Button onClick={save}>حفظ التغييرات</Button>
          </Card>
        </TabsContent>
        <TabsContent value="invoice" className="mt-4">
          <Card className="p-6 border-border/60 max-w-2xl space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>بادئة الفاتورة</Label><Input className="mt-1.5" value={invoiceCfg.prefix} onChange={e => setInvoiceCfg(c => ({ ...c, prefix: e.target.value }))} /></div>
              <div><Label>العملة</Label><Input className="mt-1.5" value={invoiceCfg.currency} onChange={e => setInvoiceCfg(c => ({ ...c, currency: e.target.value }))} /></div>
              <div><Label>نسبة الضريبة %</Label><Input type="number" className="mt-1.5" value={invoiceCfg.taxRate} onChange={e => setInvoiceCfg(c => ({ ...c, taxRate: Number(e.target.value) }))} /></div>
            </div>
            <div><Label>شروط الفاتورة</Label><Textarea rows={4} className="mt-1.5" value={invoiceCfg.terms} onChange={e => setInvoiceCfg(c => ({ ...c, terms: e.target.value }))} /></div>
            <Button onClick={save}>حفظ التغييرات</Button>
          </Card>
        </TabsContent>
        <TabsContent value="branding" className="mt-4">
          <Card className="p-6 border-border/60 max-w-2xl space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-2xl gradient-hero text-primary-foreground flex items-center justify-center"><Calculator className="h-8 w-8" /></div>
              <div>
                <div className="font-semibold">شعار الشركة</div>
                <p className="text-sm text-muted-foreground mb-2">الشعار يظهر على الفواتير والصفحات العامة.</p>
                <Button variant="outline" size="sm">رفع شعار جديد</Button>
              </div>
            </div>
            <Button onClick={save}>حفظ التغييرات</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
