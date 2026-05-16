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
import { loadSmtp } from '@/lib/smtpSettings';
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
  const smtpConfigured = useMemo(() => {
    const s = loadSmtp();
    return Boolean(s?.host && s?.fromEmail);
  }, []);

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

        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={() => { reset(); toast.success('تمت إعادة الضبط للإعدادات الافتراضية'); }}>
            <RotateCcw className="h-4 w-4 ml-1" /> إعادة الضبط
          </Button>
          <p className="text-xs text-muted-foreground">يتم حفظ التغييرات تلقائياً.</p>
        </div>
      </div>
    </div>
  );
};
