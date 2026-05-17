import { useMemo, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, BellRing, CheckCheck, Mail, FileText, Clock, AlertTriangle, CheckCircle2, Inbox } from 'lucide-react';
import { eventLabel, type SentAlert, type AlertRecipientKind, type AlertEventKind } from '@/lib/sentAlerts';
import { formatCurrency } from '@/lib/format';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';
import { useInvoiceAlerts } from '@/hooks/useNotificationsAlerts';
import { isApiConfigured } from '@/lib/api';

interface Props {
  recipientKind?: AlertRecipientKind;
  recipientId?: string;
  title?: string;
  description?: string;
  emptyDescription?: string;
  compact?: boolean;
}

const eventIcon = (e: AlertEventKind) => {
  switch (e) {
    case 'onCreated': return FileText;
    case 'onDueSoon': return Clock;
    case 'onOverdue': return AlertTriangle;
    case 'onPaid': return CheckCircle2;
  }
};

const eventTone = (e: AlertEventKind) => {
  switch (e) {
    case 'onCreated': return 'bg-primary/10 text-primary';
    case 'onDueSoon': return 'bg-warning/15 text-warning';
    case 'onOverdue': return 'bg-destructive/15 text-destructive';
    case 'onPaid': return 'bg-success/15 text-success';
  }
};

const timeAgo = (iso: string): string => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
  return `قبل ${Math.floor(diff / 86400)} يوم`;
};

export const SentAlertsCenter = ({
  recipientKind, recipientId, title, description, emptyDescription, compact,
}: Props) => {
  const apiOn = isApiConfigured();
  const { alerts: all, markAlertRead, markAllAlertsRead } = useInvoiceAlerts();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const pageSize = compact ? 5 : 8;
  const isScoped = !!(recipientKind || recipientId);

  const scoped = useMemo(() => all.filter(a =>
    (!recipientKind || a.recipientKind === recipientKind) &&
    (!recipientId || a.recipientId === recipientId)
  ).sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt)), [all, recipientKind, recipientId]);

  const unreadCount = scoped.filter(a => !a.read).length;
  const list = filter === 'unread' ? scoped.filter(a => !a.read) : scoped;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = list.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [filter, recipientKind, recipientId]);

  const onMarkAll = () => {
    if (isScoped) {
      scoped.filter(a => !a.read).forEach(a => markAlertRead(a.id));
    } else {
      markAllAlertsRead();
    }
  };

  if (!apiOn) {
    return (
      <EmptyState
        icon={Inbox}
        title="غير متصل بالخادم"
        description="تتطلب التنبيهات الاتصال بالخادم."
      />
    );
  }

  return (
    <div className="space-y-4">
      {(title || description) && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            {title && <h3 className="font-semibold text-base flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /> {title}</h3>}
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={onMarkAll} disabled={unreadCount === 0}>
            <CheckCheck className="h-4 w-4 ml-1" /> تعليم الكل كمقروء
          </Button>
        </div>
      )}

      <Tabs value={filter} onValueChange={v => setFilter(v as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all">الكل <Badge variant="secondary" className="mr-2">{scoped.length}</Badge></TabsTrigger>
          <TabsTrigger value="unread">
            غير المقروءة
            {unreadCount > 0 && <Badge className="mr-2 bg-primary text-primary-foreground">{unreadCount}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {list.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === 'unread' ? 'لا توجد تنبيهات غير مقروءة' : 'لا توجد تنبيهات مُرسَلة'}
          description={emptyDescription ?? 'ستظهر هنا التنبيهات التلقائية المُرسَلة من النظام.'}
        />
      ) : (
        <div className="space-y-2.5">
          {pageItems.map(a => {
            const Icon = eventIcon(a.event);
            const ChannelIcon = a.channel === 'email' ? Mail : Bell;
            return (
              <Card
                key={a.id}
                className={cn(
                  'p-4 border-border/60 transition-colors',
                  !a.read && 'bg-primary/[0.03] border-primary/30',
                )}
              >
                <div dir="rtl" className="flex items-start gap-3 text-start">
                  <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', eventTone(a.event))}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.subject}</span>
                      {!a.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                      <Badge variant="secondary" className="bg-muted border-0 text-[10px] h-5">
                        <ChannelIcon className="h-3 w-3 ml-1" />
                        {a.channel === 'email' ? 'بريد' : 'داخل التطبيق'}
                      </Badge>
                      <Badge variant="secondary" className="bg-muted border-0 text-[10px] h-5">{eventLabel(a.event)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2" style={{ unicodeBidi: 'plaintext' }}>{a.body}</p>
                    {!compact && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                        <span>المستلم: <span className="text-foreground">{a.recipientName}</span></span>
                        <span dir="ltr">{a.recipientContact}</span>
                        <span>الفاتورة: <span className="text-foreground">{a.invoiceNumber}</span></span>
                        <span>المبلغ: <span className="text-foreground">{formatCurrency(a.amount, a.currencySymbol)}</span></span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{timeAgo(a.sentAt)}{a.read && a.readAt ? ` · قُرئ ${timeAgo(a.readAt)}` : ''}</span>
                      {!a.read && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAlertRead(a.id)}>
                          <CheckCheck className="h-3.5 w-3.5 ml-1" /> تعليم كمقروء
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, list.length)} من {list.length}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>السابق</Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">{safePage} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>التالي</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
