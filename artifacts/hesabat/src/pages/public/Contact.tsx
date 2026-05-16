import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MapPin } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(80),
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(255),
  phone: z.string().trim().min(6, 'رقم الهاتف غير صالح').max(20),
  company: z.string().trim().min(2, 'اسم الشركة مطلوب').max(120),
  message: z.string().trim().min(10, 'الرسالة قصيرة جداً').max(1000),
});

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach(i => { errs[i.path[0] as string] = i.message; });
      return setErrors(errs);
    }
    setErrors({});
    toast.success('تم استلام رسالتك بنجاح، سنتواصل معك قريباً.');
    setForm({ name: '', email: '', phone: '', company: '', message: '' });
  };

  return (
    <div className="container py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">تواصل معنا</span>
        <h1 className="text-4xl md:text-5xl font-extrabold mt-4">نحن هنا لمساعدتك</h1>
        <p className="text-muted-foreground mt-4 text-lg">فريقنا جاهز للإجابة على استفساراتك ومساعدتك في اختيار الحل المناسب لشركتك.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <div className="space-y-4">
          <ContactInfo icon={Mail} label="البريد الإلكتروني" value="support@oneclick.eg" />
          <ContactInfo icon={Phone} label="الهاتف" value="+2 11 000 0000" />
          <ContactInfo icon={MapPin} label="العنوان" value="الرياض، المملكة العربية السعودية" />
        </div>
        <Card className="lg:col-span-2 p-6 md:p-8 border-border/60 shadow-soft">
          <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
            <Field label="الاسم" name="name" form={form} setForm={setForm} error={errors.name} />
            <Field label="البريد الإلكتروني" name="email" type="email" form={form} setForm={setForm} error={errors.email} />
            <Field label="رقم الهاتف" name="phone" form={form} setForm={setForm} error={errors.phone} />
            <Field label="اسم الشركة" name="company" form={form} setForm={setForm} error={errors.company} />
            <div className="sm:col-span-2">
              <Label>الرسالة</Label>
              <Textarea rows={5} value={form.message} onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))} className="mt-1.5" />
              {errors.message && <p className="text-xs text-destructive mt-1">{errors.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" className="w-full sm:w-auto">إرسال الرسالة</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

const Field = ({ label, name, type = 'text', form, setForm, error }: any) => (
  <div>
    <Label>{label}</Label>
    <Input type={type} value={form[name]} onChange={(e) => setForm((f: any) => ({ ...f, [name]: e.target.value }))} className="mt-1.5" />
    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
  </div>
);

const ContactInfo = ({ icon: Icon, label, value }: any) => (
  <Card className="p-5 border-border/60 flex gap-3 items-start">
    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-5 w-5" /></div>
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  </Card>
);

export default Contact;
