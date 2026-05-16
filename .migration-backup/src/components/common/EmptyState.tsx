import { LucideIcon, Inbox } from 'lucide-react';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
      <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="font-semibold text-lg">{title}</h3>
    {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
