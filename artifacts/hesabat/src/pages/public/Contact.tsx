import { useEffect, useState } from 'react';
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

interface ContactSettings {
  email: string;
  phone: string;
  address: string;
  twitter: string;
  linkedin: string;
  whatsapp: string;
  mapsEmbedUrl: string;
}

const DEFAULTS: ContactSettings = {
  email: 'support@oneclick.eg',
  phone: '+2 11 000 0000',
  address: 'الرياض، المملكة العربية السعودية',
  twitter: '',
  linkedin: '',
  whatsapp: '',
  mapsEmbedUrl: '',
};

const TwitterXIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<ContactSettings | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/platform/settings/contact');
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled && json.data) {
          setInfo({
            email: json.data.email || DEFAULTS.email,
            phone: json.data.phone || DEFAULTS.phone,
            address: json.data.address || DEFAULTS.address,
            twitter: json.data.twitter || '',
            linkedin: json.data.linkedin || '',
            whatsapp: json.data.whatsapp || '',
            mapsEmbedUrl: json.data.mapsEmbedUrl || '',
          });
        }
      } catch {
        if (!cancelled) setInfo(DEFAULTS);
      } finally {
        if (!cancelled) setInfoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const displayed = info ?? DEFAULTS;

  const hasSocial = displayed.twitter || displayed.linkedin || displayed.whatsapp;

  return (
    <div className="container py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">تواصل معنا</span>
        <h1 className="text-4xl md:text-5xl font-extrabold mt-4">نحن هنا لمساعدتك</h1>
        <p className="text-muted-foreground mt-4 text-lg">فريقنا جاهز للإجابة على استفساراتك ومساعدتك في اختيار الحل المناسب لشركتك.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <div className="space-y-4">
          {infoLoading ? (
            <>
              <ContactInfoSkeleton />
              <ContactInfoSkeleton />
              <ContactInfoSkeleton />
            </>
          ) : (
            <>
              <ContactInfo icon={Mail} label="البريد الإلكتروني" value={displayed.email} href={`mailto:${displayed.email}`} />
              <ContactInfo icon={Phone} label="الهاتف" value={displayed.phone} href={`tel:${displayed.phone}`} />
              <ContactInfo icon={MapPin} label="العنوان" value={displayed.address} />
              {hasSocial && (
                <Card className="p-5 border-border/60">
                  <div className="text-xs text-muted-foreground mb-3">تابعنا على</div>
                  <div className="flex gap-3">
                    {displayed.twitter && (
                      <a
                        href={displayed.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                        aria-label="Twitter / X"
                      >
                        <TwitterXIcon />
                      </a>
                    )}
                    {displayed.linkedin && (
                      <a
                        href={displayed.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                        aria-label="LinkedIn"
                      >
                        <LinkedInIcon />
                      </a>
                    )}
                    {displayed.whatsapp && (
                      <a
                        href={displayed.whatsapp.startsWith('http') ? displayed.whatsapp : `https://wa.me/${displayed.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                        aria-label="WhatsApp"
                      >
                        <WhatsAppIcon />
                      </a>
                    )}
                  </div>
                </Card>
              )}
            </>
          )}
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

      {!infoLoading && displayed.mapsEmbedUrl && (
        <div className="max-w-5xl mx-auto mt-8">
          <div className="rounded-2xl overflow-hidden border border-border/60 shadow-soft">
            <iframe
              src={displayed.mapsEmbedUrl}
              width="100%"
              height="400"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="الموقع على الخريطة"
            />
          </div>
        </div>
      )}
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

const ContactInfo = ({ icon: Icon, label, value, href }: any) => {
  const inner = (
    <Card className={`p-5 border-border/60 flex gap-3 items-start${href ? ' hover:border-primary/40 transition-colors' : ''}`}>
      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold mt-0.5">{value}</div>
      </div>
    </Card>
  );
  return href ? <a href={href} className="block">{inner}</a> : inner;
};

const ContactInfoSkeleton = () => (
  <Card className="p-5 border-border/60 flex gap-3 items-start">
    <div className="h-10 w-10 rounded-xl bg-muted animate-pulse shrink-0" />
    <div className="flex-1 space-y-2 pt-1">
      <div className="h-3 w-16 rounded bg-muted animate-pulse" />
      <div className="h-4 w-32 rounded bg-muted animate-pulse" />
    </div>
  </Card>
);

export default Contact;
