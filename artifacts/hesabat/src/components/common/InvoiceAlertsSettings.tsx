import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, BellRing, CalendarClock, Eye, Mail, MailWarning, RotateCcw, Sparkles, Users, UserCog, CheckCircle2, FileText, Moon } from 'lucide-react';
import { useInvoiceAlerts, type AlertsAudience, type ScheduleMode, type WeekDay, type InvoiceAlertsSettings } from '@/hooks/useInvoiceAlerts';
import { isApiConfigured } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const dayLabels: Record<WeekDay, string> = {
  sun: 'الأحد', mon: 'الإثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة', sat: 'السبت',
};

const audienceLabel: Record<AlertsAudience, string> = {
  clients: 'العملاء فقط', users: 'مستخدمو النظام فقط', both: 'الجميع',
};

const scheduleLabel: Record<ScheduleMode, string> = {
  immediate: 'فوري عند وقوع الحدث', daily: 'تقرير يومي مجمّع', weekly: 'تقرير أسبوعي مجمّع',
};

const featureBullets = [
  { icon: Sparkles, text: 'تقليل الفواتير المتأخرة عبر تذكير العملاء قبل الاستحقاق' },
  { icon: Mail, text: 'قنوات متعددة: بريد إلكتروني وإشعارات داخل التطبيق' },
  { icon: CalendarClock, text: 'جدولة مرنة: فوري أو تقرير يومي/أسبوعي' },
  { icon: Moon, text: 'ساعات هدوء لمنع الإزعاج خارج أوقات العمل' },
];

export const InvoiceAlertsSettingsPanel = () => {
  const { settings, setSettings, update, reset } = useInvoiceAlerts();
  const [previewOpen, setPreviewOpen] = useState(false);
  const smtpConfigured = useMemo(() => isApiConfigured(), []);

  const emailBlocked = settings.requireEmailConfigured && settings.channels.email && !smtpConfigured;
  const featureActive = settings.enabled;

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <Card className="p-5 border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base">التنبيه التلقائي للفواتير</h3>
                <Badge variant="secondary" className={cn('border-0', featureActive ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                  {featureActive ? 'مُفعَّل' : 'متوقّف'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                أرسل تذكيرات تلقائية للعملاء ومستخدمي النظام عند إصدار الفواتير، اقتراب الاستحقاق، التأخر، أو السداد.
              </p>
            </div>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => update('enabled', v)} />
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
          {featureBullets.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Conditional controls */}
      <div className={cn('space-y-5 transition-opacity', !featureActive && 'opacity-50 pointer-events-none select-none')}>
        {emailBlocked && (
          <Alert variant="default" className="border-warning/40 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription>
              قناة البريد الإلكتروني مُفعّلة لكن لم يتم إعداد SMTP بعد. الإرسال البريدي سيتوقّف حتى تكمل الإعداد من تبويب «البريد (SMTP)».
            </AlertDescription>
          </Alert>
        )}

        {/* Audience + Channels */}
        <Card className="p-5 border-border/60 space-y-4">
          <h4 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> الجمهور المستهدف</h4>
          <div className="grid sm:grid-cols-3 gap-2">
            {(['clients', 'users', 'both'] as AlertsAudience[]).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => update('audience', a)}
                className={cn(
                  'rounded-lg border p-3 text-sm text-center transition-colors',
                  settings.audience === a ? 'border-primary bg-primary/5 font-semibold' : 'border-border hover:bg-muted',
                )}
              >
                {a === 'clients' && <Users className="h-4 w-4 mx-auto mb-1" />}
                {a === 'users' && <UserCog className="h-4 w-4 mx-auto mb-1" />}
                {a === 'both' && <Sparkles className="h-4 w-4 mx-auto mb-1" />}
                {audienceLabel[a]}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><span className="text-sm font-medium">بريد إلكتروني</span></div>
              <Switch checked={settings.channels.email} onCheckedChange={(v) => setSettings(s => ({ ...s, channels: { ...s.channels, email: v } }))} />
            </div>
            <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /><span className="text-sm font-medium">إشعار داخل التطبيق</span></div>
              <Switch checked={settings.channels.inApp} onCheckedChange={(v) => setSettings(s => ({ ...s, channels: { ...s.channels, inApp: v } }))} />
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border/60 p-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-2"><MailWarning className="h-4 w-4 text-muted-foreground" /> اشتراط إعداد البريد</div>
              <p className="text-xs text-muted-foreground mt-0.5">عند التفعيل، لن يُرسل البريد ما لم يكن SMTP مكتمل الإعداد.</p>
            </div>
            <Switch checked={settings.requireEmailConfigured} onCheckedChange={(v) => update('requireEmailConfigured', v)} />
          </div>
        </Card>

        {/* Events */}
        <Card className="p-5 border-border/60 space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> أحداث التنبيه</h4>

          <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">عند إصدار فاتورة جديدة</div>
              <p className="text-xs text-muted-foreground">إشعار فوري بإصدار الفاتورة وروابط العرض/السداد.</p>
            </div>
            <Switch checked={settings.events.onCreated} onCheckedChange={(v) => setSettings(s => ({ ...s, events: { ...s.events, onCreated: v } }))} />
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">قبل تاريخ الاستحقاق</div>
                <p className="text-xs text-muted-foreground">تذكير العميل لتفادي التأخر.</p>
              </div>
              <Switch checked={settings.events.onDueSoon.enabled} onCheckedChange={(v) => setSettings(s => ({ ...s, events: { ...s.events, onDueSoon: { ...s.events.onDueSoon, enabled: v } } }))} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Label className="text-xs text-muted-foreground">قبل الاستحقاق بـ</Label>
              <Input
                type="number" min={1} max={60}
                className="w-20 h-8"
                value={settings.events.onDueSoon.daysBefore}
                onChange={e => setSettings(s => ({ ...s, events: { ...s.events, onDueSoon: { ...s.events.onDueSoon, daysBefore: Math.max(1, +e.target.value || 1) } } }))}
              />
              <span className="text-xs text-muted-foreground">يوم</span>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">عند تأخر السداد</div>
                <p className="text-xs text-muted-foreground">تذكير متكرر للفواتير المتأخرة.</p>
              </div>
              <Switch checked={settings.events.onOverdue.enabled} onCheckedChange={(v) => setSettings(s => ({ ...s, events: { ...s.events, onOverdue: { ...s.events.onOverdue, enabled: v } } }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Label className="text-xs text-muted-foreground">بعد التأخر بـ</Label>
                <Input
                  type="number" min={0} max={90} className="w-20 h-8"
                  value={settings.events.onOverdue.daysAfter}
                  onChange={e => setSettings(s => ({ ...s, events: { ...s.events, onOverdue: { ...s.events.onOverdue, daysAfter: Math.max(0, +e.target.value || 0) } } }))}
                />
                <span className="text-xs text-muted-foreground">يوم</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Label className="text-xs text-muted-foreground">يتكرّر كل</Label>
                <Input
                  type="number" min={1} max={30} className="w-20 h-8"
                  value={settings.events.onOverdue.repeatEveryDays}
                  onChange={e => setSettings(s => ({ ...s, events: { ...s.events, onOverdue: { ...s.events.onOverdue, repeatEveryDays: Math.max(1, +e.target.value || 1) } } }))}
                />
                <span className="text-xs text-muted-foreground">يوم</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <div>
                <div className="text-sm font-medium">عند استلام دفعة</div>
                <p className="text-xs text-muted-foreground">إشعار تأكيد للعميل وللمحاسب.</p>
              </div>
            </div>
            <Switch checked={settings.events.onPaid} onCheckedChange={(v) => setSettings(s => ({ ...s, events: { ...s.events, onPaid: v } }))} />
          </div>
        </Card>

        {/* Schedule + Quiet hours */}
        <Card className="p-5 border-border/60 space-y-4">
          <h4 className="font-semibold text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> الجدولة وساعات الهدوء</h4>

          <div>
            <Label className="text-xs">طريقة الإرسال</Label>
            <Select value={settings.schedule.mode} onValueChange={(v) => setSettings(s => ({ ...s, schedule: { ...s.schedule, mode: v as ScheduleMode } }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['immediate', 'daily', 'weekly'] as ScheduleMode[]).map(m => (
                  <SelectItem key={m} value={m}>{scheduleLabel[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings.schedule.mode !== 'immediate' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">وقت الإرسال</Label>
                <Input
                  type="time"
                  className="mt-1.5"
                  value={settings.schedule.dailyAt}
                  onChange={e => setSettings(s => ({ ...s, schedule: { ...s.schedule, dailyAt: e.target.value || '09:00' } }))}
                />
              </div>
              {settings.schedule.mode === 'weekly' && (
                <div>
                  <Label className="text-xs">يوم الأسبوع</Label>
                  <Select value={settings.schedule.weeklyDay} onValueChange={(v) => setSettings(s => ({ ...s, schedule: { ...s.schedule, weeklyDay: v as WeekDay } }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(dayLabels) as WeekDay[]).map(d => (
                        <SelectItem key={d} value={d}>{dayLabels[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">ساعات الهدوء</div>
                  <p className="text-xs text-muted-foreground">لا تُرسَل التنبيهات خلال هذه الفترة.</p>
                </div>
              </div>
              <Switch checked={settings.quietHours.enabled} onCheckedChange={(v) => setSettings(s => ({ ...s, quietHours: { ...s.quietHours, enabled: v } }))} />
            </div>
            {settings.quietHours.enabled && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">من</Label>
                  <Input type="time" className="mt-1.5" value={settings.quietHours.from}
                    onChange={e => setSettings(s => ({ ...s, quietHours: { ...s.quietHours, from: e.target.value } }))} />
                </div>
                <div>
                  <Label className="text-xs">إلى</Label>
                  <Input type="time" className="mt-1.5" value={settings.quietHours.to}
                    onChange={e => setSettings(s => ({ ...s, quietHours: { ...s.quietHours, to: e.target.value } }))} />
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap justify-between items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { reset(); toast.success('تمت إعادة الضبط للإعدادات الافتراضية'); }}>
            <RotateCcw className="h-4 w-4 ml-1" /> إعادة الضبط
          </Button>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">يتم حفظ التغييرات تلقائياً.</p>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 ml-1" /> معاينة القالب
            </Button>
          </div>
        </div>
      </div>

      <AlertsPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} settings={settings} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Preview dialog: shows email template + in-app notification preview */
/* ------------------------------------------------------------------ */

interface PreviewProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: InvoiceAlertsSettings;
}

const sample = {
  clientName: 'شركة الأفق للتجارة',
  invoiceNumber: 'INV-2026-0042',
  total: 12450,
  dueDate: '15/06/2026',
  daysLeft: 3,
  companyName: 'مؤسستك',
  publicLink: 'https://app.example.com/invoice/abc123',
};

const eventTitles: Record<string, string> = {
  onCreated: 'فاتورة جديدة بانتظار السداد',
  onDueSoon: `تذكير: استحقاق فاتورتك خلال ${sample.daysLeft} أيام`,
  onOverdue: 'فاتورتك متأخرة عن السداد',
  onPaid: 'تم استلام دفعتك — شكراً لك',
};

const eventBody: Record<string, string> = {
  onCreated: `مرحباً ${sample.clientName}،\nتم إصدار الفاتورة رقم ${sample.invoiceNumber} بمبلغ ${formatCurrency(sample.total)}، تاريخ الاستحقاق ${sample.dueDate}.`,
  onDueSoon: `مرحباً ${sample.clientName}،\nنذكّرك بأن الفاتورة ${sample.invoiceNumber} بمبلغ ${formatCurrency(sample.total)} تستحق خلال ${sample.daysLeft} أيام (${sample.dueDate}).`,
  onOverdue: `مرحباً ${sample.clientName}،\nالفاتورة ${sample.invoiceNumber} بمبلغ ${formatCurrency(sample.total)} متأخرة عن موعد السداد ${sample.dueDate}. يرجى المبادرة بالسداد.`,
  onPaid: `مرحباً ${sample.clientName}،\nتم تأكيد استلام دفعتك على الفاتورة ${sample.invoiceNumber}. شكراً لتعاملك معنا.`,
};

const AlertsPreviewDialog = ({ open, onOpenChange, settings }: PreviewProps) => {
  const enabledEvents = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (settings.events.onCreated) list.push({ key: 'onCreated', label: 'إصدار فاتورة' });
    if (settings.events.onDueSoon.enabled) list.push({ key: 'onDueSoon', label: 'قبل الاستحقاق' });
    if (settings.events.onOverdue.enabled) list.push({ key: 'onOverdue', label: 'تأخر السداد' });
    if (settings.events.onPaid) list.push({ key: 'onPaid', label: 'استلام دفعة' });
    return list;
  }, [settings.events]);

  const [activeEvent, setActiveEvent] = useState(enabledEvents[0]?.key ?? 'onCreated');
  const currentKey = enabledEvents.find(e => e.key === activeEvent) ? activeEvent : (enabledEvents[0]?.key ?? 'onCreated');

  const scheduleText =
    settings.schedule.mode === 'immediate' ? 'فوري عند وقوع الحدث' :
    settings.schedule.mode === 'daily' ? `تقرير يومي مجمّع الساعة ${settings.schedule.dailyAt}` :
    `تقرير أسبوعي ${dayLabels[settings.schedule.weeklyDay]} الساعة ${settings.schedule.dailyAt}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> معاينة تنبيه الفواتير</DialogTitle>
          <DialogDescription>هكذا سيظهر التنبيه للعميل/المستخدم بناءً على إعداداتك الحالية.</DialogDescription>
        </DialogHeader>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-0">{audienceLabel[settings.audience]}</Badge>
          {settings.channels.email && <Badge variant="secondary" className="bg-muted border-0"><Mail className="h-3 w-3 ml-1" /> بريد</Badge>}
          {settings.channels.inApp && <Badge variant="secondary" className="bg-muted border-0"><BellRing className="h-3 w-3 ml-1" /> داخل التطبيق</Badge>}
          <Badge variant="secondary" className="bg-muted border-0"><CalendarClock className="h-3 w-3 ml-1" /> {scheduleText}</Badge>
          {settings.quietHours.enabled && (
            <Badge variant="secondary" className="bg-muted border-0"><Moon className="h-3 w-3 ml-1" /> هدوء {settings.quietHours.from}–{settings.quietHours.to}</Badge>
          )}
        </div>

        {enabledEvents.length === 0 ? (
          <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>لا يوجد حدث مُفعَّل لعرضه. فعّل حدثاً واحداً على الأقل.</AlertDescription></Alert>
        ) : (
          <>
            {/* Event selector */}
            <div className="flex flex-wrap gap-1.5">
              {enabledEvents.map(e => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => setActiveEvent(e.key)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border transition-colors',
                    currentKey === e.key ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted'
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>

            <Tabs defaultValue={settings.channels.email ? 'email' : 'inapp'} className="mt-2">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="email" disabled={!settings.channels.email}><Mail className="h-4 w-4 ml-1" /> قالب البريد</TabsTrigger>
                <TabsTrigger value="inapp" disabled={!settings.channels.inApp}><BellRing className="h-4 w-4 ml-1" /> إشعار التطبيق</TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="mt-3">
                <Card className="overflow-hidden border-border/60">
                  <div className="border-b border-border/60 bg-muted/40 p-3 text-xs space-y-1">
                    <div><span className="text-muted-foreground">من:</span> {sample.companyName} &lt;no-reply@example.com&gt;</div>
                    <div><span className="text-muted-foreground">إلى:</span> {sample.clientName} &lt;client@example.com&gt;</div>
                    <div><span className="text-muted-foreground">الموضوع:</span> <span className="font-semibold">{eventTitles[currentKey]}</span></div>
                  </div>
                  <div className="p-5 bg-white text-foreground" dir="rtl">
                    <div className="border-b pb-3 mb-4 flex items-center justify-between">
                      <div className="font-bold text-primary">{sample.companyName}</div>
                      <div className="text-xs text-muted-foreground">{sample.invoiceNumber}</div>
                    </div>
                    <p className="text-sm whitespace-pre-line leading-relaxed">{eventBody[currentKey]}</p>
                    <div className="mt-4 rounded-md bg-muted/50 border border-border/60 p-3 text-sm flex justify-between">
                      <span className="text-muted-foreground">الإجمالي</span>
                      <span className="font-bold">{formatCurrency(sample.total)}</span>
                    </div>
                    <div className="mt-4">
                      <span className="inline-block bg-primary text-primary-foreground text-sm px-4 py-2 rounded-md">عرض الفاتورة والسداد</span>
                      <div className="text-xs text-muted-foreground mt-1 break-all">{sample.publicLink}</div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-5 border-t pt-3">
                      رسالة آلية من {sample.companyName}. للاستفسار يرجى الرد على هذا البريد.
                    </p>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="inapp" className="mt-3">
                <Card className="p-4 border-border/60 max-w-md mx-auto">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <BellRing className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm">{eventTitles[currentKey]}</div>
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line line-clamp-3">{eventBody[currentKey]}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">الآن</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs">عرض الفاتورة</Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button onClick={() => { onOpenChange(false); toast.success('تم اعتماد القالب وحفظ الإعدادات'); }}>
            <CheckCircle2 className="h-4 w-4 ml-1" /> اعتماد وحفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
