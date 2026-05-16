import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusKind =
  | 'paid' | 'partial' | 'unpaid' | 'overdue'
  | 'active' | 'suspended' | 'expired' | 'inactive';

const map: Record<string, { label: string; cls: string; dot: string }> = {
  paid:      { label: 'مدفوعة',        cls: 'bg-success/15 text-success border-success/30',           dot: 'bg-success' },
  partial:   { label: 'مدفوعة جزئياً', cls: 'bg-warning/15 text-warning border-warning/30',           dot: 'bg-warning' },
  unpaid:    { label: 'غير مدفوعة',    cls: 'bg-muted text-muted-foreground border-border',           dot: 'bg-muted-foreground' },
  overdue:   { label: 'متأخرة',        cls: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive' },
  active:    { label: 'نشطة',          cls: 'bg-success/15 text-success border-success/30',           dot: 'bg-success' },
  suspended: { label: 'موقوفة',        cls: 'bg-warning/15 text-warning border-warning/30',           dot: 'bg-warning' },
  expired:   { label: 'منتهية',        cls: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive' },
  inactive:  { label: 'غير نشطة',      cls: 'bg-muted text-muted-foreground border-border',           dot: 'bg-muted-foreground' },
};

interface Props {
  status: StatusKind | string;
  label?: string;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export const StatusBadge = ({ status, label, size = 'sm', showDot = true }: Props) => {
  const m = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border inline-flex items-center gap-1.5',
        size === 'md' && 'px-3 py-1 text-sm',
        m.cls,
      )}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />}
      {label ?? m.label}
    </Badge>
  );
};
