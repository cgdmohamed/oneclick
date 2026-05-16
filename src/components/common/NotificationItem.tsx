import { Bell, CreditCard, FileText, Package, AlertCircle, TrendingDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, notificationCategoryLabel } from '@/lib/format';
import type { Notification } from '@/types';
import { Button } from '@/components/ui/button';

const iconMap = {
  invoice: FileText,
  payment: CreditCard,
  debt: TrendingDown,
  product: Package,
  stock: AlertCircle,
  system: Settings,
};

export const NotificationItem = ({ n, onMarkRead }: { n: Notification; onMarkRead?: () => void }) => {
  const Icon = iconMap[n.category] ?? Bell;
  return (
    <div dir="rtl" className={cn('flex items-start gap-3 p-4 rounded-xl border border-border/70 bg-card text-start', !n.read && 'border-primary/30 bg-primary/5')}>
      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 text-start">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-sm">{n.title}</h4>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{notificationCategoryLabel(n.category)}</span>
          {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
        </div>
        <p className="text-sm text-muted-foreground mt-1" style={{ unicodeBidi: 'plaintext' }}>{n.body}</p>
        <p className="text-xs text-muted-foreground mt-2">{formatDate(n.date)}</p>
      </div>
      {!n.read && onMarkRead && (
        <Button variant="ghost" size="sm" onClick={onMarkRead} className="self-start shrink-0">تم القراءة</Button>
      )}
    </div>
  );
};
