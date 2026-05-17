import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getCurrencySymbol, setCurrencySymbol } from '@/lib/currency';
import { useBrand, DEFAULT_BRAND, type BrandSettings } from '@/lib/brand';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Upload, Trash2, RotateCcw } from 'lucide-react';

const FONT_PRESETS: { label: string; value: string }[] = [
  { label: 'Cairo (افتراضي)', value: "'Cairo', 'Tajawal', 'Inter', system-ui, sans-serif" },
  { label: 'Tajawal',         value: "'Tajawal', 'Cairo', 'Inter', system-ui, sans-serif" },
  { label: 'IBM Plex Sans Arabic', value: "'IBM Plex Sans Arabic', 'Cairo', system-ui, sans-serif" },
  { label: 'Readex Pro',      value: "'Readex Pro', 'Cairo', system-ui, sans-serif" },
  { label: 'Inter (لاتيني)',   value: "'Inter', system-ui, sans-serif" },
];

const SystemSettings = () => {
  const { brand, save: saveBrand, reset: resetBrand, loading: brandLoading, pendingRemoteUpdate, applyRemoteUpdate } = useBrand();
  const [local, setLocal] = useState<BrandSettings>(brand);

  useEffect(() => { setLocal(brand); }, [brand]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(brand);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    if (!pendingRemoteUpdate) return;
    if (dirtyRef.current) {
      toast('تم تحديث إعدادات العلامة التجارية من تبويب آخر', {
        description: 'قد تكون مسوداتك الحالية قديمة — انقر «تحديث» لتطبيق التغييرات.',
        action: { label: 'تحديث', onClick: applyRemoteUpdate },
        duration: 12000,
      });
    } else {
      applyRemoteUpdate();
    }
  }, [pendingRemoteUpdate, applyRemoteUpdate]);
  const fullFileRef = useRef<HTMLInputElement>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);

  const [s, setS] = useState({
    appName: 'ون كليك',
    supportEmail: 'support@oneclick.eg',
    currency: getCurrencySymbol(),
    invoicePrefix: 'INV',
  });
  const [generalLoading, setGeneralLoading] = useState(true);
  const [generalSaving, setGeneralSaving] = useState(false);

  const [contact, setContact] = useState({ email: '', phone: '', address: '' });
  const [contactLoading, setContactLoading] = useState(true);
  const [contactSaving, setContactSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/platform/settings/general');
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled && json.data) {
          setS({
            appName: json.data.appName ?? 'ون كليك',
            supportEmail: json.data.supportEmail ?? 'support@oneclick.eg',
            currency: json.data.currency ?? getCurrencySymbol(),
            invoicePrefix: json.data.invoicePrefix ?? 'INV',
          });
          if (json.data.currency) setCurrencySymbol(json.data.currency);
        }
      } catch {
        // silent — defaults remain
      } finally {
        if (!cancelled) setGeneralLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/platform/settings/contact');
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled && json.data) {
          setContact({
            email: json.data.email ?? '',
            phone: json.data.phone ?? '',
            address: json.data.address ?? '',
          });
        }
      } catch {
        // silent — defaults remain
      } finally {
        if (!cancelled) setContactLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onFile = (f: File, key: 'logoFullUrl' | 'logoIconUrl') => {
    if (f.size > 512 * 1024) {
      toast.error('حجم الشعار يجب أن يكون أقل من 512KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLocal(v => ({ ...v, [key]: String(reader.result) }));
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="إعدادات النظام" description="الإعدادات العامة للمنصة وهوية العلامة" />

      {/* Brand identity */}
      <Card className="p-6 border-border/60 max-w-3xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold">هوية العلامة</h2>
          <p className="text-sm text-muted-foreground mt-1">
            شعار المنصة تيبوغرافي. ارفع صورة شعار اختيارية، وإن لم ترفع شيئاً سيظهر اسم العلامة كنص بالخط المختار.
          </p>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-6 flex items-center justify-center">
          {/* Force re-render preview from local state */}
          <BrandLogoPreview value={local} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>اسم العلامة (الشعار النصي)</Label>
            <Input
              className="mt-1.5"
              value={local.name}
              onChange={e => setLocal(v => ({ ...v, name: e.target.value }))}
              dir="auto"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>السطر التعريفي (اختياري)</Label>
            <Input
              className="mt-1.5"
              value={local.tagline}
              onChange={e => setLocal(v => ({ ...v, tagline: e.target.value }))}
              dir="auto"
            />
          </div>
          <div>
            <Label>الخط</Label>
            <Select value={local.fontFamily} onValueChange={v => setLocal(s => ({ ...s, fontFamily: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_PRESETS.map(f => (
                  <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>سماكة الخط</Label>
            <Select value={local.fontWeight} onValueChange={(v: BrandSettings['fontWeight']) => setLocal(s => ({ ...s, fontWeight: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="font-semibold">شبه عريض</SelectItem>
                <SelectItem value="font-bold">عريض</SelectItem>
                <SelectItem value="font-extrabold">عريض جداً</SelectItem>
                <SelectItem value="font-black">أسود</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>تباعد الأحرف</Label>
            <Select value={local.tracking} onValueChange={(v: BrandSettings['tracking']) => setLocal(s => ({ ...s, tracking: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tracking-tighter">ضيق جداً</SelectItem>
                <SelectItem value="tracking-tight">ضيق</SelectItem>
                <SelectItem value="tracking-normal">عادي</SelectItem>
                <SelectItem value="tracking-wide">واسع</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Full logo uploader */}
          <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <div>
              <Label>الشعار الكامل (أفقي)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">يُستخدم في الهيدر، صفحات الدخول، والفواتير. النسبة المقترحة 3:1 أو 4:1.</p>
            </div>
            <div className="h-16 rounded bg-muted/40 flex items-center justify-center overflow-hidden">
              {local.logoFullUrl
                ? <img src={local.logoFullUrl} alt="full" className="h-12 w-auto object-contain" />
                : <span className="text-xs text-muted-foreground">لا توجد صورة — يُستخدم النص</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fullFileRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f, 'logoFullUrl'); }}
              />
              <Button size="sm" variant="outline" type="button" onClick={() => fullFileRef.current?.click()}>
                <Upload className="h-4 w-4 ml-2" /> رفع
              </Button>
              {local.logoFullUrl && (
                <Button size="sm" variant="ghost" type="button" onClick={() => setLocal(v => ({ ...v, logoFullUrl: '' }))}>
                  <Trash2 className="h-4 w-4 ml-2" /> إزالة
                </Button>
              )}
            </div>
          </div>

          {/* Icon uploader */}
          <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <div>
              <Label>أيقونة الشعار (مربعة)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">تُستخدم في الشريط الجانبي المطوي والاستخدامات المضغوطة. النسبة 1:1.</p>
            </div>
            <div className="h-16 rounded bg-muted/40 flex items-center justify-center overflow-hidden">
              {local.logoIconUrl
                ? <img src={local.logoIconUrl} alt="icon" className="h-12 w-12 object-contain" />
                : <span className="text-xs text-muted-foreground">لا توجد أيقونة — يُستخدم الحرف الأول</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={iconFileRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f, 'logoIconUrl'); }}
              />
              <Button size="sm" variant="outline" type="button" onClick={() => iconFileRef.current?.click()}>
                <Upload className="h-4 w-4 ml-2" /> رفع
              </Button>
              {local.logoIconUrl && (
                <Button size="sm" variant="ghost" type="button" onClick={() => setLocal(v => ({ ...v, logoIconUrl: '' }))}>
                  <Trash2 className="h-4 w-4 ml-2" /> إزالة
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
          <Button onClick={async () => {
            try { await saveBrand(local); toast.success('تم حفظ هوية العلامة'); }
            catch { toast.error('تعذّر حفظ هوية العلامة'); }
          }}>
            حفظ هوية العلامة
          </Button>
          <Button variant="outline" onClick={() => setLocal(brand)}>تراجع</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try { await resetBrand(); setLocal(DEFAULT_BRAND); toast.success('تمت الاستعادة للافتراضي'); }
              catch { toast.error('تعذّر استعادة الافتراضي'); }
            }}
          >
            <RotateCcw className="h-4 w-4 ml-2" /> استعادة الافتراضي
          </Button>
        </div>
      </Card>

      {/* Contact Info */}
      <Card className="p-6 border-border/60 max-w-3xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold">معلومات التواصل</h2>
          <p className="text-sm text-muted-foreground mt-1">تظهر هذه البيانات في صفحة «تواصل معنا» العامة.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input
              className="mt-1.5"
              type="email"
              dir="ltr"
              value={contact.email}
              onChange={e => setContact(v => ({ ...v, email: e.target.value }))}
              placeholder="support@example.com"
            />
          </div>
          <div>
            <Label>رقم الهاتف</Label>
            <Input
              className="mt-1.5"
              dir="ltr"
              value={contact.phone}
              onChange={e => setContact(v => ({ ...v, phone: e.target.value }))}
              placeholder="+966 11 000 0000"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>العنوان</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              value={contact.address}
              onChange={e => setContact(v => ({ ...v, address: e.target.value }))}
              placeholder="الرياض، المملكة العربية السعودية"
            />
          </div>
        </div>
        <Button
          disabled={contactLoading || contactSaving}
          onClick={async () => {
            setContactSaving(true);
            try {
              await api.put('/api/platform/settings/contact', contact);
              toast.success('تم حفظ معلومات التواصل');
            } catch {
              toast.error('تعذّر حفظ معلومات التواصل');
            } finally {
              setContactSaving(false);
            }
          }}
        >
          {contactSaving ? 'جاري الحفظ…' : 'حفظ معلومات التواصل'}
        </Button>
      </Card>

      {/* General */}
      <Card className="p-6 border-border/60 max-w-3xl space-y-4">
        <h2 className="text-lg font-semibold">إعدادات عامة</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>اسم التطبيق</Label><Input className="mt-1.5" value={s.appName} onChange={e => setS(v => ({ ...v, appName: e.target.value }))} /></div>
          <div><Label>بريد الدعم</Label><Input className="mt-1.5" value={s.supportEmail} onChange={e => setS(v => ({ ...v, supportEmail: e.target.value }))} /></div>
          <div>
            <Label>العملة الافتراضية</Label>
            <Input
              className="mt-1.5"
              value={s.currency}
              onChange={e => { setS(v => ({ ...v, currency: e.target.value })); setCurrencySymbol(e.target.value); }}
            />
          </div>
          <div><Label>بادئة الفاتورة</Label><Input className="mt-1.5" value={s.invoicePrefix} onChange={e => setS(v => ({ ...v, invoicePrefix: e.target.value }))} /></div>
        </div>
        <Button
          disabled={generalLoading || generalSaving}
          onClick={async () => {
            setGeneralSaving(true);
            try {
              await api.put('/api/platform/settings/general', s);
              setCurrencySymbol(s.currency);
              toast.success('تم حفظ الإعدادات');
            } catch {
              toast.error('تعذّر حفظ الإعدادات');
            } finally {
              setGeneralSaving(false);
            }
          }}
        >
          {generalSaving ? 'جاري الحفظ…' : 'حفظ التغييرات'}
        </Button>
      </Card>
    </div>
  );
};

/** Inline preview that reflects unsaved edits without committing them. */
const BrandLogoPreview = ({ value }: { value: BrandSettings }) => {
  const fullSrc = value.logoFullUrl || value.logoIconUrl;
  return (
    <div className="flex items-center gap-8 flex-wrap justify-center">
      {/* Full lockup */}
      <div className="flex flex-col items-center gap-2">
        {fullSrc ? (
          <img src={fullSrc} alt={value.name} className="h-12 w-auto object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span
              className={`text-2xl leading-none ${value.fontWeight} ${value.tracking}`}
              style={{ fontFamily: value.fontFamily }}
            >
              {value.name}
            </span>
            {value.tagline && <span className="text-xs text-muted-foreground">{value.tagline}</span>}
          </div>
        )}
        <span className="text-[10px] text-muted-foreground">شعار كامل</span>
      </div>

      {/* Icon */}
      <div className="flex flex-col items-center gap-2">
        {value.logoIconUrl ? (
          <img src={value.logoIconUrl} alt={value.name} className="h-12 w-12 object-contain" />
        ) : value.logoFullUrl ? (
          <img src={value.logoFullUrl} alt={value.name} className="h-12 w-12 object-contain" />
        ) : (
          <span
            className={`h-12 w-12 inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-xl ${value.fontWeight}`}
            style={{ fontFamily: value.fontFamily }}
          >
            {(value.name || '•').trim().split(/\s+/).slice(0, 2).map(p => Array.from(p)[0] ?? '').join('')}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">أيقونة</span>
      </div>
    </div>
  );
};

export default SystemSettings;
