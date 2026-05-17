/**
 * Tracking & Marketing settings — super-admin controlled.
 * Configures the IDs that TrackingScripts injects into the public site.
 */
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, RefreshCw, ShieldCheck, BarChart3, Megaphone, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { useTrackingSettings, type TrackingSettings } from '@/hooks/useTrackingSettings';

const TrackingSettingsAdmin = () => {
  const { settings, save, reset } = useTrackingSettings();
  const [draft, setDraft] = useState<TrackingSettings>(settings);
  useEffect(() => { setDraft(settings); }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const update = <K extends keyof TrackingSettings>(key: K, val: TrackingSettings[K]) =>
    setDraft(d => ({ ...d, [key]: val }));

  const onSave = async () => {
    try { await save(draft); toast.success('تم حفظ إعدادات التتبع'); }
    catch { toast.error('تعذّر حفظ إعدادات التتبع'); }
  };
  const onReset = async () => {
    try { await reset(); toast.message('تمت الاستعادة للإعدادات الافتراضية'); }
    catch { toast.error('تعذّر استعادة الافتراضي'); }
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="التسويق والتحليلات"
        description="ربط أدوات التتبع والإعلانات بمنصتك (تُحقن في الصفحات العامة فقط)"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onReset}><RefreshCw className="h-4 w-4 ms-1" /> استعادة</Button>
            <Button size="sm" onClick={onSave} disabled={!dirty}><Save className="h-4 w-4 ms-1" /> حفظ</Button>
          </div>
        }
      />

      {/* Privacy / consent */}
      <Card className="p-5 border-border/60 mb-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="h-4 w-4 text-primary" /> الخصوصية والموافقة
        </div>
        <Row
          label="طلب موافقة المستخدم قبل تفعيل التتبع (Cookie Banner)"
          checked={draft.consentRequired}
          onChange={(v) => update('consentRequired', v)}
        />
        <Row
          label="تعطيل التتبع داخل صفحات التطبيق والإدارة (/app و /admin)"
          checked={draft.privateAppRoutes}
          onChange={(v) => update('privateAppRoutes', v)}
        />
      </Card>

      <Tabs dir="rtl" defaultValue="analytics">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 ms-1" /> التحليلات</TabsTrigger>
          <TabsTrigger value="ads"><Megaphone className="h-4 w-4 ms-1" /> الإعلانات</TabsTrigger>
          <TabsTrigger value="behavior"><Activity className="h-4 w-4 ms-1" /> سلوك المستخدم</TabsTrigger>
        </TabsList>

        {/* Analytics */}
        <TabsContent value="analytics" className="mt-5 space-y-4">
          <ProviderCard
            title="Google Analytics 4"
            desc="قياس الزوار، الأحداث، وتدفّق التحويل."
            enabled={draft.ga4.enabled}
            onToggle={(v) => update('ga4', { ...draft.ga4, enabled: v })}
          >
            <IdField
              label="Measurement ID"
              placeholder="G-XXXXXXXXXX"
              value={draft.ga4.measurementId}
              onChange={(v) => update('ga4', { ...draft.ga4, measurementId: v.trim() })}
            />
          </ProviderCard>

          <ProviderCard
            title="Google Tag Manager"
            desc="إدارة جميع وسوم التتبع من حاوية واحدة."
            enabled={draft.gtm.enabled}
            onToggle={(v) => update('gtm', { ...draft.gtm, enabled: v })}
          >
            <IdField
              label="Container ID"
              placeholder="GTM-XXXXXXX"
              value={draft.gtm.containerId}
              onChange={(v) => update('gtm', { ...draft.gtm, containerId: v.trim() })}
            />
          </ProviderCard>

          <ProviderCard
            title="PostHog"
            desc="منتج تحليلي مفتوح المصدر مع تجارب وميزات."
            enabled={draft.posthog.enabled}
            onToggle={(v) => update('posthog', { ...draft.posthog, enabled: v })}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <IdField
                label="Project API Key"
                placeholder="phc_xxx"
                value={draft.posthog.apiKey}
                onChange={(v) => update('posthog', { ...draft.posthog, apiKey: v.trim() })}
              />
              <IdField
                label="API Host"
                placeholder="https://us.i.posthog.com"
                value={draft.posthog.apiHost}
                onChange={(v) => update('posthog', { ...draft.posthog, apiHost: v.trim() })}
              />
            </div>
          </ProviderCard>
        </TabsContent>

        {/* Ads */}
        <TabsContent value="ads" className="mt-5 space-y-4">
          <ProviderCard
            title="Meta Pixel (Facebook / Instagram)"
            desc="تتبّع التحويلات من حملات فيسبوك وإنستغرام."
            enabled={draft.metaPixel.enabled}
            onToggle={(v) => update('metaPixel', { ...draft.metaPixel, enabled: v })}
          >
            <IdField
              label="Pixel ID"
              placeholder="123456789012345"
              value={draft.metaPixel.pixelId}
              onChange={(v) => update('metaPixel', { ...draft.metaPixel, pixelId: v.trim() })}
            />
          </ProviderCard>

          <ProviderCard
            title="LinkedIn Insight Tag"
            desc="تتبّع زوار B2B لإعادة الاستهداف عبر LinkedIn Ads."
            enabled={draft.linkedinInsight.enabled}
            onToggle={(v) => update('linkedinInsight', { ...draft.linkedinInsight, enabled: v })}
          >
            <IdField
              label="Partner ID"
              placeholder="1234567"
              value={draft.linkedinInsight.partnerId}
              onChange={(v) => update('linkedinInsight', { ...draft.linkedinInsight, partnerId: v.trim() })}
            />
          </ProviderCard>

          <ProviderCard
            title="TikTok Pixel"
            desc="قياس تحويلات حملات TikTok Ads."
            enabled={draft.tiktokPixel.enabled}
            onToggle={(v) => update('tiktokPixel', { ...draft.tiktokPixel, enabled: v })}
          >
            <IdField
              label="Pixel ID"
              placeholder="CXXXXXXXXXXXXXXXXXXX"
              value={draft.tiktokPixel.pixelId}
              onChange={(v) => update('tiktokPixel', { ...draft.tiktokPixel, pixelId: v.trim() })}
            />
          </ProviderCard>
        </TabsContent>

        {/* Behavior */}
        <TabsContent value="behavior" className="mt-5 space-y-4">
          <ProviderCard
            title="Microsoft Clarity"
            desc="جلسات مسجّلة وخرائط حرارة مجانية تماماً."
            enabled={draft.microsoftClarity.enabled}
            onToggle={(v) => update('microsoftClarity', { ...draft.microsoftClarity, enabled: v })}
          >
            <IdField
              label="Project ID"
              placeholder="abcdefghij"
              value={draft.microsoftClarity.projectId}
              onChange={(v) => update('microsoftClarity', { ...draft.microsoftClarity, projectId: v.trim() })}
            />
          </ProviderCard>

          <ProviderCard
            title="Hotjar"
            desc="خرائط حرارة، تسجيلات، واستطلاعات."
            enabled={draft.hotjar.enabled}
            onToggle={(v) => update('hotjar', { ...draft.hotjar, enabled: v })}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <IdField
                label="Site ID (hjid)"
                placeholder="1234567"
                value={draft.hotjar.siteId}
                onChange={(v) => update('hotjar', { ...draft.hotjar, siteId: v.trim() })}
              />
              <IdField
                label="Snippet Version (hjsv)"
                placeholder="6"
                value={draft.hotjar.version}
                onChange={(v) => update('hotjar', { ...draft.hotjar, version: v.trim() })}
              />
            </div>
          </ProviderCard>
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

const Row = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5">
    <Label className="text-sm cursor-pointer">{label}</Label>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const IdField = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input dir="ltr" className="mt-1.5 font-mono text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

const ProviderCard = ({
  title, desc, enabled, onToggle, children,
}: { title: string; desc: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) => (
  <Card className="p-5 border-border/60">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <div className="font-bold text-base">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
    {enabled && <div className="pt-3 border-t border-border/60">{children}</div>}
  </Card>
);

export default TrackingSettingsAdmin;
