import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, CreditCard, Wallet, Package,
  BarChart3, Bell, ShieldCheck, Settings, Building2, Layers,
  Receipt, ToggleRight, Megaphone, Cog, LucideIcon,
} from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
}

// Route → icon (used when no explicit icon prop is passed)
const routeIcon = (path: string): LucideIcon => {
  if (path.startsWith('/admin/companies')) return Building2;
  if (path.startsWith('/admin/plans')) return Layers;
  if (path.startsWith('/admin/subscriptions')) return FileText;
  if (path.startsWith('/admin/payments')) return Receipt;
  if (path.startsWith('/admin/feature-access')) return ToggleRight;
  if (path.startsWith('/admin/notifications')) return Megaphone;
  if (path.startsWith('/admin/settings')) return Cog;
  if (path === '/admin' || path.startsWith('/admin')) return LayoutDashboard;

  if (path.startsWith('/app/clients')) return Users;
  if (path.startsWith('/app/invoices') || path.startsWith('/app/invoice')) return FileText;
  if (path.startsWith('/app/payments')) return CreditCard;
  if (path.startsWith('/app/accounts')) return Wallet;
  if (path.startsWith('/app/products')) return Package;
  if (path.startsWith('/app/reports')) return BarChart3;
  if (path.startsWith('/app/notifications')) return Bell;
  if (path.startsWith('/app/users')) return ShieldCheck;
  if (path.startsWith('/app/settings')) return Settings;
  return LayoutDashboard;
};

export const PageHeader = ({ title, description, actions, icon: IconProp }: PageHeaderProps) => {
  const { pathname } = useLocation();
  const Icon = IconProp ?? routeIcon(pathname);

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-page-accent shadow-soft gradient-page">
      {/* Decorative right-side gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-2xl gradient-page-strong"
      />
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-1 gradient-page-strong" />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-xl gradient-page-strong text-white flex items-center justify-center shadow-elev">
            <Icon className="h-6 w-6 md:h-7 md:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">{title}</h1>
            {description && (
              <p className="text-muted-foreground mt-1 text-sm md:text-[0.95rem]">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
};
