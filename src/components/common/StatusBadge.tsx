import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusKind =
  | 'paid' | 'partial' | 'unpaid' | 'overdue'
  | 'active' | 'suspended' | 'expired' | 'inactive';

const map: Record<string, { label: string; cls: string }> = {
  paid: { label: 'مدفوعة', cls: 'bg-success/15 text-success border-success/30' },
  partial: { label: 'مدفوعة جزئياً', cls: 'bg-warning/15 text-warning border-warning/30' },
  unpaid: { label: 'غير مدفوعة', cls: 'bg-muted text-muted-foreground border-border' },
  overdue: { label: 'متأخرة', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  active: { label: 'نشطة', cls: 'bg-success/15 text-success border-success/30' },
  suspended: { label: 'موقوفة', cls: 'bg-warning/15 text-warning border-warning/30' },
  expired: { label: 'منتهية', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  inactive: { label: 'غير نشطة', cls: 'bg-muted text-muted-foreground border-border' },
};

export const StatusBadge = ({ status, label }: { status: StatusKind | string; label?: string }) => {
  const m = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <Badge variant="outline" className={cn('font-medium border', m.cls)}>
      {label ?? m.label}
    </Badge>
  );
};
