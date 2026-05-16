import { useMemo, useState, useSyncExternalStore } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import {
  Bell, Mail, CheckCheck, AlertTriangle, CheckCircle2, FileText, Clock,
  Users, UserCog, Download, BellRing,
} from 'lucide-react';
import {
  getSentAlerts, subscribeSentAlerts, markAlertRead, markAllAlertsRead, eventLabel,
  type SentAlert, type AlertEventKind, type AlertChannel, type AlertRecipientKind,
} from '@/lib/sentAlerts';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';

const eventIcon: Record<AlertEventKind, typeof FileText> = {
  onCreated: FileText,
  onDueSoon: Clock,
  onOverdue: AlertTriangle,
  onPaid: CheckCircle2,
};

const eventTone: Record<AlertEventKind, 'active' | 'pending' | 'overdue' | 'inactive'> = {
  onCreated: 'active',
  onDueSoon: 'pending',
  onOverdue: 'overdue',
  onPaid: 'active',
};

const formatDateTime = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return iso; }
};

type EventFilter = 'all' | AlertEventKind;
type ChannelFilter = 'all' | AlertChannel;
type AudienceFilter = 'all' | AlertRecipientKind;
type StatusFilter = 'all' | 'read' | 'unread';

const AlertsLog = () => {
  const all = useSyncExternalStore(subscribeSentAlerts, getSentAlerts, getSentAlerts);
  const [event, setEvent] = useState<EventFilter>('all');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const rows = useMemo(() => all
    .filter(a => event === 'all' || a.event === event)
    .filter(a => channel === 'all' || a.channel === channel)
    .filter(a => audience === 'all' || a.recipientKind === audience)
    .filter(a => status === 'all' || (status === 'read' ? a.read : !a.read))
    .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt)),
  [all, event, channel, audience, status]);

  const stats = useMemo(() => ({
    total: all.length,
    unread: all.filter(a => !a.read).length,
    email: all.filter(a => a.channel === 'email').length,
    inApp: all.filter(a => a.channel === 'inApp').length,
  }), [all]);

  const exportCsv = () => {
    const head = ['التاريخ', 'الحدث', 'القناة', 'نوع المستلم', 'المستلم', 'جهة الاتصال', 'الفاتورة', 'المبلغ', 'الحالة', 'وقت القراءة'];
    const lines = rows.map(a => [
      formatDateTime(a.sentAt),
      eventLabel(a.event),
      a.channel === 'email' ? 'بريد' : 'داخل التطبيق',
      a.recipientKind === 'client' ? 'عميل' : 'مستخدم',
      a.recipientName,
      a.recipientContact,
      a.invoiceNumber,
      String(a.amount),
      a.read ? 'مقروء' : 'غير مقروء',
      a.readAt ? formatDateTime(a.readAt) : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [head.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `alerts-log-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير السجل');
  };

  const columns: Column<SentAlert>[] = [
    {
      key: 'event', header: 'الحدث', cell: (r) => {
        const Icon = eventIcon[r.event];
        return (
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-md bg-muted flex items-center justify-center"><Icon className="h-3.5 w-3.5" /></span>
            <div className="min-w-0">
              <div className="font-medium text-sm">{eventLabel(r.event)}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">{r.subject}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'recipient', header: 'المستلم', cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            {r.recipientKind === 'client' ? <Users className="h-3.5 w-3.5 text-muted-foreground" /> : <UserCog className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="font-medium">{r.recipientName}</span>
          </div>
          <div className="text-xs text-muted-foreground" dir="ltr">{r.recipientContact}</div>
        </div>
      ),
    },
    {
      key: 'channel', header: 'القناة', cell: (r) => (
        <Badge variant="secondary" className="bg-muted border-0 gap-1">
          {r.channel === 'email' ? <Mail className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
          {r.channel === 'email' ? 'بريد' : 'داخل التطبيق'}
        </Badge>
      ),
    },
    {
      key: 'invoice', header: 'الفاتورة', cell: (r) => (
        <div className="text-sm">
          <div className="font-medium">{r.invoiceNumber}</div>
          <div className="text-xs text-muted-foreground">{formatCurrency(r.amount, r.currencySymbol)}</div>
        </div>
      ),
    },
    {
      key: 'sentAt', header: 'التوقيت', cell: (r) => (
        <div className="text-xs">
          <div>{formatDateTime(r.sentAt)}</div>
          {r.read && r.readAt && <div className="text-muted-foreground mt-0.5">قُرئ: {formatDateTime(r.readAt)}</div>}
        </div>
      ),
    },
    {
      key: 'status', header: 'الحالة', cell: (r) => (
        <StatusBadge status={r.read ? 'active' : 'pending'} label={r.read ? 'مقروء' : 'غير مقروء'} />
      ),
    },
    {
      key: 'tone', header: 'النوع', cell: (r) => (
        <StatusBadge status={eventTone[r.event]} label={eventLabel(r.event)} />
      ),
    },
    {
      key: 'actions', header: '', cell: (r) => (
        !r.read ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAlertRead(r.id)}>
            <CheckCheck className="h-3.5 w-3.5 ml-1" /> تعليم كمقروء
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="سجل التنبيهات"
        description="جميع التنبيهات التلقائية الصادرة من النظام مع المستلم، القناة، التوقيت، والحالة."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { markAllAlertsRead(); toast.success('تم تعليم الكل كمقروء'); }} disabled={stats.unread === 0}>
              <CheckCheck className="h-4 w-4 ml-1" /> <span className="hidden sm:inline">تعليم الكل</span><span className="sm:hidden">تعليم</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4 ml-1" /> <span className="hidden sm:inline">تصدير CSV</span><span className="sm:hidden">CSV</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard title="إجمالي التنبيهات" value={String(stats.total)} icon={BellRing} />
        <StatCard title="غير مقروءة" value={String(stats.unread)} icon={AlertTriangle} accent={stats.unread > 0 ? 'warning' : 'primary'} />
        <StatCard title="عبر البريد" value={String(stats.email)} icon={Mail} />
        <StatCard title="داخل التطبيق" value={String(stats.inApp)} icon={Bell} />
      </div>

      <Card className="p-4 border-border/60 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          <FilterField label="الحدث">
            <Select value={event} onValueChange={(v) => setEvent(v as EventFilter)}>
              <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأحداث</SelectItem>
                <SelectItem value="onCreated">إصدار فاتورة</SelectItem>
                <SelectItem value="onDueSoon">قبل الاستحقاق</SelectItem>
                <SelectItem value="onOverdue">تأخر السداد</SelectItem>
                <SelectItem value="onPaid">استلام دفعة</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="القناة">
            <Select value={channel} onValueChange={(v) => setChannel(v as ChannelFilter)}>
              <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل القنوات</SelectItem>
                <SelectItem value="email">بريد إلكتروني</SelectItem>
                <SelectItem value="inApp">داخل التطبيق</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="نوع المستلم">
            <Select value={audience} onValueChange={(v) => setAudience(v as AudienceFilter)}>
              <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الجميع</SelectItem>
                <SelectItem value="client">العملاء</SelectItem>
                <SelectItem value="user">مستخدمو النظام</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="الحالة">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="read">المقروءة</SelectItem>
                <SelectItem value="unread">غير المقروءة</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <div className="text-xs text-muted-foreground sm:col-span-1 col-span-2 sm:text-end">إجمالي النتائج: {rows.length}</div>
        </div>
      </Card>

      <DataTable
        data={rows}
        columns={columns}
        searchKeys={['recipientName', 'recipientContact', 'invoiceNumber', 'subject']}
        searchPlaceholder="ابحث بالمستلم أو رقم الفاتورة أو الموضوع..."
        emptyTitle="لا توجد تنبيهات بهذه المعايير"
      />
    </div>
  );
};

const FilterField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <div className="text-xs text-muted-foreground">{label}</div>
    {children}
  </div>
);

export default AlertsLog;
