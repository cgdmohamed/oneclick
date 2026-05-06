import React, { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, Building2, Check, Loader2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

interface CompanyProfile {
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  taxNumber: string;
  commercialReg: string;
  country: string;
  city: string;
  district: string;
  street: string;
  postalCode: string;
}

interface InvoiceConfig {
  prefix: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  template: 'classic' | 'modern' | 'minimal';
  accentColor: string;
  showLogo: boolean;
  showTaxNumber: boolean;
  terms: string;
  footer: string;
}

interface ClientInfo {
  name: string;
  email: string;
  address: string;
  taxNumber: string;
}

const CURRENCIES = [
  { code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', name: 'درهم إماراتي' },
  { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري' },
  { code: 'KWD', symbol: 'د.ك', name: 'دينار كويتي' },
  { code: 'QAR', symbol: 'ر.ق', name: 'ريال قطري' },
  { code: 'USD', symbol: '$', name: 'دولار أمريكي' },
  { code: 'EUR', symbol: '€', name: 'يورو' },
];

const Settings = () => {
  const [profile, setProfile] = useState<CompanyProfile>({
    name: 'شركة الأفق للتجارة',
    ownerName: 'أحمد عبدالله',
    email: 'info@alofok.sa',
    phone: '+966551112233',
    taxNumber: '300123456700003',
    commercialReg: '1010234567',
    country: 'المملكة العربية السعودية',
    city: 'الرياض',
    district: 'حي الملقا',
    street: 'شارع الأمير محمد بن سلمان',
    postalCode: '13524',
  });

  const [invoiceCfg, setInvoiceCfg] = useState<InvoiceConfig>({
    prefix: 'INV',
    currency: 'SAR',
    currencySymbol: 'ر.س',
    taxRate: 15,
    template: 'modern',
    accentColor: '#4F46E5',
    showLogo: true,
    showTaxNumber: true,
    terms: 'تستحق الفاتورة خلال 30 يوماً من تاريخ الإصدار.',
    footer: 'شكراً لتعاملكم معنا',
  });

  const [client, setClient] = useState<ClientInfo>({
    name: 'شركة العميل التجريبية',
    email: 'client@example.com',
    address: 'جدة، حي الروضة',
    taxNumber: '310987654300003',
  });
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof ClientInfo, string>>>({});

  const setP = (patch: Partial<CompanyProfile>) => setProfile(p => ({ ...p, ...patch }));
  const setI = (patch: Partial<InvoiceConfig>) => setInvoiceCfg(c => ({ ...c, ...patch }));
  const setC = (patch: Partial<ClientInfo>) => {
    setClient(c => ({ ...c, ...patch }));
    const key = Object.keys(patch)[0] as keyof ClientInfo;
    const val = (patch[key] ?? '').toString().trim();
    let err = '';
    if (key === 'name' && !val) err = 'الاسم مطلوب';
    if (key === 'name' && val.length > 100) err = 'الاسم طويل جداً';
    if (key === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) err = 'بريد غير صالح';
    if (key === 'taxNumber' && val && !/^\d{5,20}$/.test(val)) err = 'الرقم الضريبي غير صالح';
    if (key === 'address' && val.length > 200) err = 'العنوان طويل جداً';
    setClientErrors(p => ({ ...p, [key]: err || undefined }));
  };

  const onCurrencyChange = (code: string) => {
    const c = CURRENCIES.find(x => x.code === code);
    if (c) setI({ currency: c.code, currencySymbol: c.symbol });
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    debounceRef.current = setTimeout(() => {
      setSaveStatus('saved');
      toast.success('تم حفظ التغييرات تلقائياً');
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [profile, invoiceCfg, client]);

  const fullAddress = [profile.street, profile.district, profile.city, profile.country, profile.postalCode]
    .filter(Boolean)
    .join('، ');

  const previewRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <PageHeader
        title="إعدادات الشركة"
        description="بيانات الشركة والعنوان والعملة ومعاينة الفاتورة"
        actions={<SaveIndicator status={saveStatus} />}
      />
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">بيانات الشركة</TabsTrigger>
          <TabsTrigger value="address">العنوان</TabsTrigger>
          <TabsTrigger value="invoice">الفاتورة والعملة</TabsTrigger>
          <TabsTrigger value="client">بيانات العميل</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card className="p-6 border-border/60 max-w-3xl space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>اسم الشركة</Label><Input className="mt-1.5" value={profile.name} onChange={e => setP({ name: e.target.value })} /></div>
              <div><Label>اسم المالك</Label><Input className="mt-1.5" value={profile.ownerName} onChange={e => setP({ ownerName: e.target.value })} /></div>
              <div><Label>البريد الإلكتروني</Label><Input className="mt-1.5" value={profile.email} onChange={e => setP({ email: e.target.value })} /></div>
              <div><Label>رقم الهاتف</Label><Input className="mt-1.5" value={profile.phone} onChange={e => setP({ phone: e.target.value })} /></div>
              <div><Label>الرقم الضريبي</Label><Input className="mt-1.5" value={profile.taxNumber} onChange={e => setP({ taxNumber: e.target.value })} /></div>
              <div><Label>السجل التجاري</Label><Input className="mt-1.5" value={profile.commercialReg} onChange={e => setP({ commercialReg: e.target.value })} /></div>
            </div>
            <SaveIndicator status={saveStatus} />
          </Card>
        </TabsContent>

        <TabsContent value="address" className="mt-4">
          <Card className="p-6 border-border/60 max-w-3xl space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>الدولة</Label><Input className="mt-1.5" value={profile.country} onChange={e => setP({ country: e.target.value })} /></div>
              <div><Label>المدينة</Label><Input className="mt-1.5" value={profile.city} onChange={e => setP({ city: e.target.value })} /></div>
              <div><Label>الحي</Label><Input className="mt-1.5" value={profile.district} onChange={e => setP({ district: e.target.value })} /></div>
              <div><Label>الشارع</Label><Input className="mt-1.5" value={profile.street} onChange={e => setP({ street: e.target.value })} /></div>
              <div><Label>الرمز البريدي</Label><Input className="mt-1.5" value={profile.postalCode} onChange={e => setP({ postalCode: e.target.value })} /></div>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border/60 p-4 text-sm">
              <div className="text-muted-foreground mb-1">العنوان الكامل</div>
              <div className="font-medium">{fullAddress || '—'}</div>
            </div>
            <SaveIndicator status={saveStatus} />
          </Card>
        </TabsContent>

        <TabsContent value="invoice" className="mt-4">
          <div className="grid lg:grid-cols-5 gap-5">
            <Card className="p-6 border-border/60 lg:col-span-2 space-y-4 h-fit">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>العملة</Label>
                  <Select value={invoiceCfg.currency} onValueChange={onCurrencyChange}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.name} ({c.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>رمز العملة</Label><Input className="mt-1.5" value={invoiceCfg.currencySymbol} onChange={e => setI({ currencySymbol: e.target.value })} /></div>
                <div><Label>بادئة الفاتورة</Label><Input className="mt-1.5" value={invoiceCfg.prefix} onChange={e => setI({ prefix: e.target.value })} /></div>
                <div><Label>نسبة الضريبة %</Label><Input type="number" className="mt-1.5" value={invoiceCfg.taxRate} onChange={e => setI({ taxRate: Number(e.target.value) })} /></div>
                <div>
                  <Label>قالب الفاتورة</Label>
                  <Select value={invoiceCfg.template} onValueChange={(v: InvoiceConfig['template']) => setI({ template: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern">عصري</SelectItem>
                      <SelectItem value="classic">كلاسيكي</SelectItem>
                      <SelectItem value="minimal">مبسّط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>اللون الأساسي</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input type="color" className="h-10 w-14 p-1" value={invoiceCfg.accentColor} onChange={e => setI({ accentColor: e.target.value })} />
                    <Input value={invoiceCfg.accentColor} onChange={e => setI({ accentColor: e.target.value })} />
                  </div>
                </div>
              </div>
              <div><Label>شروط الدفع</Label><Textarea rows={3} className="mt-1.5" value={invoiceCfg.terms} onChange={e => setI({ terms: e.target.value })} /></div>
              <div><Label>تذييل الفاتورة</Label><Input className="mt-1.5" value={invoiceCfg.footer} onChange={e => setI({ footer: e.target.value })} /></div>
              <SaveIndicator status={saveStatus} className="w-full justify-center" />
            </Card>

            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">معاينة مباشرة</div>
                <DownloadPdfButton targetRef={previewRef} fileName={`${invoiceCfg.prefix}-preview.pdf`} />
              </div>
              <div ref={previewRef}>
                <InvoicePreview profile={profile} cfg={invoiceCfg} address={fullAddress} client={client} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="client" className="mt-4">
          <div className="grid lg:grid-cols-5 gap-5">
            <Card className="p-6 border-border/60 lg:col-span-2 space-y-4 h-fit">
              <div className="space-y-3">
                <div>
                  <Label>اسم العميل</Label>
                  <Input className="mt-1.5" maxLength={100} value={client.name} onChange={e => setC({ name: e.target.value })} />
                  {clientErrors.name && <p className="text-xs text-destructive mt-1">{clientErrors.name}</p>}
                </div>
                <div>
                  <Label>البريد الإلكتروني</Label>
                  <Input className="mt-1.5" type="email" maxLength={255} value={client.email} onChange={e => setC({ email: e.target.value })} />
                  {clientErrors.email && <p className="text-xs text-destructive mt-1">{clientErrors.email}</p>}
                </div>
                <div>
                  <Label>العنوان</Label>
                  <Textarea rows={2} className="mt-1.5" maxLength={200} value={client.address} onChange={e => setC({ address: e.target.value })} />
                  {clientErrors.address && <p className="text-xs text-destructive mt-1">{clientErrors.address}</p>}
                </div>
                <div>
                  <Label>الرقم الضريبي</Label>
                  <Input className="mt-1.5" maxLength={20} value={client.taxNumber} onChange={e => setC({ taxNumber: e.target.value.replace(/\D/g, '') })} />
                  {clientErrors.taxNumber && <p className="text-xs text-destructive mt-1">{clientErrors.taxNumber}</p>}
                </div>
              </div>
              <SaveIndicator status={saveStatus} className="w-full justify-center" />
            </Card>
            <div className="lg:col-span-3">
              <div className="text-sm text-muted-foreground mb-2">معاينة مباشرة</div>
              <InvoicePreview profile={profile} cfg={invoiceCfg} address={fullAddress} client={client} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const sampleItems = [
  { name: 'استشارة محاسبية شهرية', qty: 1, price: 1500 },
  { name: 'اشتراك برنامج المخزون', qty: 2, price: 450 },
  { name: 'تدريب فريق المبيعات', qty: 3, price: 600 },
];

const InvoicePreview = ({ profile, cfg, address, client }: { profile: CompanyProfile; cfg: InvoiceConfig; address: string; client: ClientInfo }) => {
  const subtotal = sampleItems.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = +(subtotal * (cfg.taxRate / 100)).toFixed(2);
  const total = subtotal + tax;
  const fmt = (n: number) => `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(n)} ${cfg.currencySymbol}`;

  const isMinimal = cfg.template === 'minimal';
  const isClassic = cfg.template === 'classic';

  return (
    <div className="rounded-xl border border-border/60 bg-white text-slate-900 shadow-soft overflow-hidden" dir="rtl">
      <div
        className="p-6 flex items-start justify-between gap-4"
        style={
          isMinimal
            ? { background: '#fff', borderBottom: `1px solid ${cfg.accentColor}22` }
            : isClassic
            ? { background: '#f8fafc', borderBottom: `4px solid ${cfg.accentColor}` }
            : { background: cfg.accentColor, color: '#fff' }
        }
      >
        <div className="flex items-center gap-3">
          {cfg.showLogo && (
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center"
              style={{
                background: cfg.template === 'modern' ? 'rgba(255,255,255,0.2)' : cfg.accentColor + '22',
                color: cfg.template === 'modern' ? '#fff' : cfg.accentColor,
              }}
            >
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div>
            <div className="font-bold text-lg">{profile.name}</div>
            <div className="text-xs opacity-80">{profile.email} · {profile.phone}</div>
          </div>
        </div>
        <div className="text-left">
          <div className="font-bold text-xl">فاتورة ضريبية</div>
          <div className="text-sm opacity-80">رقم: {cfg.prefix}-2026-0042</div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-2 gap-4 text-sm border-b border-slate-200">
        <div>
          <div className="text-slate-500 text-xs mb-1">فاتورة إلى</div>
          <div className="font-semibold">{client.name || '—'}</div>
          {client.address && <div className="text-slate-600 text-xs">{client.address}</div>}
          {client.email && <div className="text-slate-600 text-xs">{client.email}</div>}
          {client.taxNumber && <div className="text-slate-600 text-xs">الرقم الضريبي: {client.taxNumber}</div>}
        </div>
        <div className="text-left">
          <div className="text-slate-500 text-xs">تاريخ الإصدار: <span className="text-slate-900">06/05/2026</span></div>
          <div className="text-slate-500 text-xs">تاريخ الاستحقاق: <span className="text-slate-900">05/06/2026</span></div>
          {cfg.showTaxNumber && profile.taxNumber && (
            <div className="text-slate-500 text-xs">الرقم الضريبي: <span className="text-slate-900">{profile.taxNumber}</span></div>
          )}
        </div>
      </div>

      <div className="p-6">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: cfg.accentColor }} className="text-right border-b-2" >
              <th className="py-2 font-semibold">الوصف</th>
              <th className="py-2 font-semibold w-16 text-center">الكمية</th>
              <th className="py-2 font-semibold w-28 text-left">السعر</th>
              <th className="py-2 font-semibold w-28 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {sampleItems.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2.5">{it.name}</td>
                <td className="py-2.5 text-center">{it.qty}</td>
                <td className="py-2.5 text-left">{fmt(it.price)}</td>
                <td className="py-2.5 text-left font-medium">{fmt(it.qty * it.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>المجموع الفرعي</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>الضريبة ({cfg.taxRate}%)</span><span>{fmt(tax)}</span></div>
            <div
              className="flex justify-between font-bold text-base pt-2 border-t"
              style={{ color: cfg.accentColor, borderColor: cfg.accentColor + '40' }}
            >
              <span>الإجمالي</span><span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500 border-t border-slate-100 pt-4 space-y-1">
          {cfg.terms && <div>{cfg.terms}</div>}
          {address && <div>{address}</div>}
          {cfg.footer && <div className="text-center font-medium pt-2" style={{ color: cfg.accentColor }}>{cfg.footer}</div>}
        </div>
      </div>
    </div>
  );
};

export default Settings;

const SaveIndicator = ({ status, className }: { status: 'idle' | 'saving' | 'saved'; className?: string }) => (
  <div className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}>
    {status === 'saving' && (<><Loader2 className="h-4 w-4 animate-spin" /><span>جارٍ الحفظ...</span></>)}
    {status === 'saved' && (<><Check className="h-4 w-4 text-success" /><span className="text-success">تم الحفظ تلقائياً</span></>)}
    {status === 'idle' && (<><Check className="h-4 w-4 text-muted-foreground/60" /><span>كل التغييرات محفوظة</span></>)}
  </div>
);


const DownloadPdfButton = ({ targetRef, fileName }: { targetRef: React.RefObject<HTMLDivElement | null>; fileName: string }) => {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    if (!targetRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(targetRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
      while (heightLeft > 0) {
        position = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        heightLeft -= pageH - margin * 2;
      }
      pdf.save(fileName);
      toast.success('تم تنزيل ملف PDF بنجاح');
    } catch (e) {
      toast.error('تعذّر إنشاء ملف PDF');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button size="sm" onClick={handle} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      تنزيل PDF
    </Button>
  );
};
