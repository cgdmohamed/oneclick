import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
}

export const PageHeader = ({ title, description, actions, icon: Icon }: PageHeaderProps) => {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-border">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-5 w-5 text-muted-foreground shrink-0" />}
          <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>
      )}
    </div>
  );
};
