/**
 * Landing CMS — super-admin controlled content for the public marketing pages.
 * All edits are stored locally (via useLandingContent) until backend is wired up.
 */
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, RefreshCw, Save, ExternalLink, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useLandingContent, DEFAULT_LANDING, type LandingContent, type BentoItem } from '@/hooks/useLandingContent';

const BENTO_ICONS = ['FileText', 'CreditCard', 'BarChart3', 'Package', 'ShieldCheck', 'Wallet', 'Bell', 'Users', 'Cloud', 'Sparkles', 'Receipt', 'Building2'];

const newId = (p: string) => `${p}-${Date.now().toString(36)}`;

const LandingContentAdmin = () => {
  const { content, save, reset } = useLandingContent();
  const [draft, setDraft] = useState<LandingContent>(content);

  useEffect(() => { setDraft(content); }, [content]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(content);

  const update = <K extends keyof LandingContent>(key: K, partial: Partial<LandingContent[K]>) => {
    setDraft(d => ({ ...d, [key]: { ...d[key], ...partial } }));
  };

  const onSave = () => {
    save(draft);
    toast.success('تم حفظ محتوى الصفحة العامة');
  };

  const onReset = () => {
    reset();
    toast.message('تمت الاستعادة للإعدادات الافتراضية');
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="محتوى الصفحات العامة"
        description="تحكّم كامل في محتوى الصفحة الرئيسية والأقسام التسويقية"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm"><Link to="/" target="_blank"><Eye className="h-4 w-4 ms-1" /> معاينة</Link></Button>
            <Button variant="outline" size="sm" onClick={onReset}><RefreshCw className="h-4 w-4 ms-1" /> استعادة الافتراضي</Button>
            <Button size="sm" onClick={onSave} disabled={!dirty}><Save className="h-4 w-4 ms-1" /> حفظ التغييرات</Button>
          </div>
        }
      />

      <Tabs dir="rtl" defaultValue="hero" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="hero">الواجهة الرئيسية</TabsTrigger>
          <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
          <TabsTrigger value="logos">شعارات العملاء</TabsTrigger>
          <TabsTrigger value="bento">شبكة المميزات</TabsTrigger>
          <TabsTrigger value="testimonials">آراء العملاء</TabsTrigger>
          <TabsTrigger value="faq">الأسئلة الشائعة</TabsTrigger>
          <TabsTrigger value="cta">الدعوة للتسجيل</TabsTrigger>
        </TabsList>

        {/* ---------- HERO ---------- */}
        <TabsContent value="hero" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار قسم الواجهة" checked={draft.hero.enabled} onChange={(v) => update('hero', { enabled: v })} />
            <Field label="نص علوي صغير (Eyebrow)" value={draft.hero.eyebrow} onChange={(v) => update('hero', { eyebrow: v })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="العنوان الأساسي" value={draft.hero.title} onChange={(v) => update('hero', { title: v })} />
              <Field label="الجزء المُلوّن من العنوان" value={draft.hero.titleHighlight} onChange={(v) => update('hero', { titleHighlight: v })} />
            </div>
            <Area label="النص التوضيحي" value={draft.hero.subtitle} onChange={(v) => update('hero', { subtitle: v })} rows={3} />
            <div className="grid sm:grid-cols-2 gap-4">
              <CtaEditor label="زر رئيسي" value={draft.hero.primary} onChange={(v) => update('hero', { primary: v })} />
              <CtaEditor label="زر ثانوي" value={draft.hero.secondary} onChange={(v) => update('hero', { secondary: v })} />
            </div>
            <ToggleRow label="إظهار صورة الواجهة" checked={draft.hero.showImage} onChange={(v) => update('hero', { showImage: v })} />
            <ImageUploadField
              label="صورة الواجهة"
              value={draft.hero.imageUrl}
              onChange={(v) => update('hero', { imageUrl: v })}
            />

            {/* Frame / border / shadow controls */}
            <div className="rounded-lg border border-border/60 p-4 space-y-4 bg-muted/20">
              <div className="text-xs font-semibold text-muted-foreground">إعدادات إطار الصورة</div>
              <ToggleRow
                label="إظهار شريط المتصفح (macOS)"
                checked={draft.hero.showBrowserFrame}
                onChange={(v) => update('hero', { showBrowserFrame: v })}
              />
              <div className="grid sm:grid-cols-3 gap-4">
                <NumberField
                  label="سماكة الحدود (px)"
                  value={draft.hero.borderWidth}
                  min={0} max={4} step={1}
                  onChange={(v) => update('hero', { borderWidth: v })}
                />
                <NumberField
                  label="انحناء الزوايا (px)"
                  value={draft.hero.borderRadius}
                  min={0} max={32} step={1}
                  onChange={(v) => update('hero', { borderRadius: v })}
                />
                <SelectField
                  label="شدّة الظل"
                  value={draft.hero.shadowIntensity}
                  options={[
                    { value: 'none', label: 'بدون' },
                    { value: 'soft', label: 'خفيف' },
                    { value: 'elev', label: 'مرتفع' },
                    { value: 'glow', label: 'توهج لوني' },
                  ]}
                  onChange={(v) => update('hero', { shadowIntensity: v as 'none' | 'soft' | 'elev' | 'glow' })}
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ---------- STATS ---------- */}
        <TabsContent value="stats" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار شريط الإحصائيات" checked={draft.stats.enabled} onChange={(v) => update('stats', { enabled: v })} />
            <ListEditor
              items={draft.stats.items}
              onChange={(items) => update('stats', { items })}
              addLabel="إضافة إحصائية"
              create={() => ({ id: newId('s'), value: '', label: '' })}
              render={(it, set) => (
                <div className="grid sm:grid-cols-2 gap-3 flex-1">
                  <Field label="القيمة" value={it.value} onChange={(v) => set({ ...it, value: v })} />
                  <Field label="الوصف" value={it.label} onChange={(v) => set({ ...it, label: v })} />
                </div>
              )}
            />
          </Card>
        </TabsContent>

        {/* ---------- LOGOS ---------- */}
        <TabsContent value="logos" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار شريط شعارات العملاء" checked={draft.logos.enabled} onChange={(v) => update('logos', { enabled: v })} />
            <Field label="عنوان الشريط" value={draft.logos.title} onChange={(v) => update('logos', { title: v })} />
            <ListEditor
              items={draft.logos.items}
              onChange={(items) => update('logos', { items })}
              addLabel="إضافة شعار/عميل"
              create={() => ({ id: newId('l'), name: '' })}
              render={(it, set) => (
                <Field label="اسم الشركة" value={it.name} onChange={(v) => set({ ...it, name: v })} />
              )}
            />
          </Card>
        </TabsContent>

        {/* ---------- BENTO ---------- */}
        <TabsContent value="bento" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار شبكة المميزات (Bento)" checked={draft.bento.enabled} onChange={(v) => update('bento', { enabled: v })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="نص علوي" value={draft.bento.eyebrow} onChange={(v) => update('bento', { eyebrow: v })} />
              <Field label="عنوان القسم" value={draft.bento.title} onChange={(v) => update('bento', { title: v })} />
            </div>
            <Area label="الوصف" value={draft.bento.desc} onChange={(v) => update('bento', { desc: v })} rows={2} />
            <ListEditor
              items={draft.bento.items}
              onChange={(items) => update('bento', { items })}
              addLabel="إضافة بطاقة"
              create={() => ({ id: newId('b'), icon: 'Sparkles', title: '', desc: '', tone: 'default', size: 'sm' }) as BentoItem}
              render={(it, set) => (
                <div className="grid sm:grid-cols-2 gap-3 flex-1">
                  <Field label="العنوان" value={it.title} onChange={(v) => set({ ...it, title: v })} />
                  <SelectField
                    label="الأيقونة"
                    value={it.icon}
                    options={BENTO_ICONS.map(i => ({ value: i, label: i }))}
                    onChange={(v) => set({ ...it, icon: v })}
                  />
                  <Area label="الوصف" value={it.desc} onChange={(v) => set({ ...it, desc: v })} rows={2} className="sm:col-span-2" />
                  <SelectField
                    label="الحجم"
                    value={it.size ?? 'sm'}
                    options={[{ value: 'sm', label: 'صغير (1×1)' }, { value: 'md', label: 'متوسط (2×1)' }, { value: 'lg', label: 'كبير (2×2)' }]}
                    onChange={(v) => set({ ...it, size: v as BentoItem['size'] })}
                  />
                  <SelectField
                    label="المظهر"
                    value={it.tone ?? 'default'}
                    options={[{ value: 'default', label: 'افتراضي' }, { value: 'accent', label: 'مُميّز' }, { value: 'dark', label: 'داكن' }]}
                    onChange={(v) => set({ ...it, tone: v as BentoItem['tone'] })}
                  />
                </div>
              )}
            />
          </Card>
        </TabsContent>

        {/* ---------- TESTIMONIALS ---------- */}
        <TabsContent value="testimonials" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار قسم آراء العملاء" checked={draft.testimonials.enabled} onChange={(v) => update('testimonials', { enabled: v })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="نص علوي" value={draft.testimonials.eyebrow} onChange={(v) => update('testimonials', { eyebrow: v })} />
              <Field label="عنوان القسم" value={draft.testimonials.title} onChange={(v) => update('testimonials', { title: v })} />
            </div>
            <ListEditor
              items={draft.testimonials.items}
              onChange={(items) => update('testimonials', { items })}
              addLabel="إضافة رأي"
              create={() => ({ id: newId('t'), name: '', role: '', quote: '', initials: '' })}
              render={(it, set) => (
                <div className="grid sm:grid-cols-3 gap-3 flex-1">
                  <Field label="الاسم" value={it.name} onChange={(v) => set({ ...it, name: v })} />
                  <Field label="المنصب/الشركة" value={it.role} onChange={(v) => set({ ...it, role: v })} />
                  <Field label="الحرف المختصر" value={it.initials} onChange={(v) => set({ ...it, initials: v })} />
                  <Area label="الاقتباس" value={it.quote} onChange={(v) => set({ ...it, quote: v })} rows={3} className="sm:col-span-3" />
                </div>
              )}
            />
          </Card>
        </TabsContent>

        {/* ---------- FAQ ---------- */}
        <TabsContent value="faq" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار الأسئلة الشائعة" checked={draft.faq.enabled} onChange={(v) => update('faq', { enabled: v })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="نص علوي" value={draft.faq.eyebrow} onChange={(v) => update('faq', { eyebrow: v })} />
              <Field label="عنوان القسم" value={draft.faq.title} onChange={(v) => update('faq', { title: v })} />
            </div>
            <ListEditor
              items={draft.faq.items}
              onChange={(items) => update('faq', { items })}
              addLabel="إضافة سؤال"
              create={() => ({ id: newId('f'), q: '', a: '' })}
              render={(it, set) => (
                <div className="space-y-3 flex-1">
                  <Field label="السؤال" value={it.q} onChange={(v) => set({ ...it, q: v })} />
                  <Area label="الإجابة" value={it.a} onChange={(v) => set({ ...it, a: v })} rows={3} />
                </div>
              )}
            />
          </Card>
        </TabsContent>

        {/* ---------- CTA ---------- */}
        <TabsContent value="cta" className="mt-5">
          <Card className="p-6 border-border/60 space-y-4">
            <ToggleRow label="إظهار شريط الدعوة للتسجيل" checked={draft.cta.enabled} onChange={(v) => update('cta', { enabled: v })} />
            <Field label="العنوان" value={draft.cta.title} onChange={(v) => update('cta', { title: v })} />
            <Area label="النص" value={draft.cta.subtitle} onChange={(v) => update('cta', { subtitle: v })} rows={2} />
            <div className="grid sm:grid-cols-2 gap-4">
              <CtaEditor label="زر رئيسي" value={draft.cta.primary} onChange={(v) => update('cta', { primary: v })} />
              <CtaEditor label="زر ثانوي" value={draft.cta.secondary} onChange={(v) => update('cta', { secondary: v })} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 mt-6 flex justify-end">
        <Button onClick={onSave} disabled={!dirty} size="lg" className="shadow-elev">
          <Save className="h-4 w-4 ms-1" /> {dirty ? 'حفظ التغييرات' : 'لا تغييرات بانتظار الحفظ'}
        </Button>
      </div>
    </div>
  );
};

/* ---------- Small editor primitives ---------- */

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

const Area = ({ label, value, onChange, rows = 3, className }: { label: string; value: string; onChange: (v: string) => void; rows?: number; className?: string }) => (
  <div className={className}>
    <Label className="text-xs">{label}</Label>
    <Textarea className="mt-1.5" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const NumberField = ({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input
      type="number" min={min} max={max} step={step}
      className="mt-1.5"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
);

const SelectField = ({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

const ToggleRow = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5">
    <Label className="text-sm cursor-pointer">{label}</Label>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const CtaEditor = ({ label, value, onChange }: { label: string; value: { label: string; url: string }; onChange: (v: { label: string; url: string }) => void }) => (
  <div className="rounded-lg border border-border/60 p-3 space-y-2.5">
    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <ExternalLink className="h-3.5 w-3.5" /> {label}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Input value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} placeholder="نص الزر" />
      <Input value={value.url} onChange={(e) => onChange({ ...value, url: e.target.value })} placeholder="/register" dir="ltr" />
    </div>
  </div>
);

interface ListEditorProps<T extends { id: string }> {
  items: T[];
  onChange: (next: T[]) => void;
  addLabel: string;
  create: () => T;
  render: (item: T, set: (next: T) => void) => React.ReactNode;
}
function ListEditor<T extends { id: string }>({ items, onChange, addLabel, create, render }: ListEditorProps<T>) {
  const setAt = (i: number, next: T) => onChange(items.map((it, idx) => (idx === i ? next : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, create()]);
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3 bg-card">
          <div className="flex-1 min-w-0">{render(it, (n) => setAt(i, n))}</div>
          <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-destructive shrink-0" title="حذف">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 ms-1" /> {addLabel}</Button>
    </div>
  );
}

export default LandingContentAdmin;
// re-export default to silence unused warnings during dev
export { DEFAULT_LANDING };
