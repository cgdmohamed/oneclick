import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  accent?: 'primary' | 'success' | 'warning' | 'destructive' | 'info';
}

const accentMap = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

export const StatCard = ({ title, value, icon: Icon, hint, trend, accent = 'primary' }: StatCardProps) => (
  <Card className="p-4 sm:p-5 shadow-soft border-border/60 hover:shadow-elev transition-shadow">
    <div className="flex items-start justify-between gap-2 sm:gap-3">
      <div className="space-y-1.5 min-w-0 flex-1">
        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{title}</p>
        <p className="text-lg sm:text-2xl font-bold tracking-tight tabular-nums break-words leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground line-clamp-1">{hint}</p>}
        {trend && (
          <p className={cn('text-xs font-medium', trend.positive ? 'text-success' : 'text-destructive')}>
            {trend.value}
          </p>
        )}
      </div>
      {Icon && (
        <div className={cn('h-9 w-9 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center shrink-0', accentMap[accent])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      )}
    </div>
  </Card>
);
