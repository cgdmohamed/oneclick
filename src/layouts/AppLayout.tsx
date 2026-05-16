import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar, SidebarHeader, SidebarFooter } from '@/components/ui/sidebar';
import { LayoutDashboard, Users, FileText, CreditCard, Wallet, Package, BarChart3, Bell, ShieldCheck, Settings, Calculator, LogOut, Building2, Layers, Receipt, ToggleRight, Megaphone, Cog, ChevronLeft, Crown, History, LayoutTemplate, LineChart, UserSearch, PieChart, ScrollText, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePendingSignupsCount } from '@/hooks/usePendingSignups';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { roleLabel } from '@/lib/format';
import { useEffect } from 'react';
import type { Role } from '@/types';
import { useCurrentFeatureSet } from '@/hooks/usePlanAccess';

const companyNav: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; feature?: string }[] = [
  { to: '/app', label: 'الرئيسية', icon: LayoutDashboard, end: true },
  { to: '/app/clients', label: 'العملاء', icon: Users, feature: 'clients' },
  { to: '/app/invoices', label: 'الفواتير', icon: FileText, feature: 'invoices' },
  { to: '/app/payments', label: 'المدفوعات', icon: CreditCard, feature: 'payments' },
  { to: '/app/accounts', label: 'الحسابات المالية', icon: Wallet, feature: 'accounts' },
  { to: '/app/products', label: 'المنتجات والمخزون', icon: Package, feature: 'products' },
  { to: '/app/reports', label: 'التقارير', icon: BarChart3, feature: 'reports_basic' },
  { to: '/app/notifications', label: 'التنبيهات', icon: Bell, feature: 'notifications' },
  { to: '/app/users', label: 'المستخدمون والصلاحيات', icon: ShieldCheck, feature: 'rbac' },
  { to: '/app/activity', label: 'سجل الأنشطة', icon: History, feature: 'activity_log' },
  { to: '/app/subscription', label: 'الاشتراك والفوترة', icon: Crown },
  { to: '/app/settings', label: 'الإعدادات', icon: Settings },
];

const adminNav = [
  { to: '/admin', label: 'لوحة الإدارة', icon: LayoutDashboard, end: true },
  { to: '/admin/analytics', label: 'تحليلات المنصة', icon: PieChart },
  { to: '/admin/approvals', label: 'طلبات التسجيل', icon: UserPlus, badge: 'pending-signups' as const },
  { to: '/admin/companies', label: 'الشركات', icon: Building2 },
  { to: '/admin/users', label: 'المشتركين', icon: UserSearch },
  { to: '/admin/plans', label: 'الباقات', icon: Layers },
  { to: '/admin/subscriptions', label: 'الاشتراكات', icon: FileText },
  { to: '/admin/payments', label: 'التحصيلات', icon: Receipt },
  { to: '/admin/wallets', label: 'محافظ التحصيل', icon: Wallet },
  { to: '/admin/feature-access', label: 'الصلاحيات حسب الباقة', icon: ToggleRight },
  { to: '/admin/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck },
  { to: '/admin/audit-log', label: 'سجل التدقيق', icon: ScrollText },
  { to: '/admin/notifications', label: 'إشعارات النظام', icon: Megaphone },
  { to: '/admin/landing', label: 'محتوى الصفحات العامة', icon: LayoutTemplate },
  { to: '/admin/tracking', label: 'التسويق والتحليلات', icon: LineChart },
  { to: '/admin/settings', label: 'إعدادات النظام', icon: Cog },
];

const pageKey = (kind: 'company' | 'admin', pathname: string): string => {
  if (kind === 'admin') {
    if (pathname.startsWith('/admin/analytics')) return 'admin-analytics';
    if (pathname.startsWith('/admin/approvals')) return 'admin-approvals';
    if (pathname.startsWith('/admin/companies')) return 'admin-companies';
    if (pathname.startsWith('/admin/users')) return 'admin-users';
    if (pathname.startsWith('/admin/plans')) return 'admin-plans';
    if (pathname.startsWith('/admin/subscriptions')) return 'admin-subscriptions';
    if (pathname.startsWith('/admin/payments')) return 'admin-payments';
    if (pathname.startsWith('/admin/wallets')) return 'admin-wallets';
    if (pathname.startsWith('/admin/feature-access')) return 'admin-feature-access';
    if (pathname.startsWith('/admin/roles')) return 'admin-roles';
    if (pathname.startsWith('/admin/audit-log')) return 'admin-audit-log';
    if (pathname.startsWith('/admin/notifications')) return 'admin-notifications';
    if (pathname.startsWith('/admin/landing')) return 'admin-landing';
    if (pathname.startsWith('/admin/tracking')) return 'admin-tracking';
    if (pathname.startsWith('/admin/settings')) return 'admin-settings';
    return 'admin-overview';
  }
  if (pathname.startsWith('/app/clients')) return 'clients';
  if (pathname.startsWith('/app/invoices') || pathname.startsWith('/app/invoice')) return 'invoices';
  if (pathname.startsWith('/app/payments')) return 'payments';
  if (pathname.startsWith('/app/accounts')) return 'accounts';
  if (pathname.startsWith('/app/products')) return 'products';
  if (pathname.startsWith('/app/reports')) return 'reports';
  if (pathname.startsWith('/app/notifications')) return 'notifications';
  if (pathname.startsWith('/app/users')) return 'users';
  if (pathname.startsWith('/app/activity')) return 'activity';
  if (pathname.startsWith('/app/subscription')) return 'subscription';
  if (pathname.startsWith('/app/settings')) return 'settings';
  return 'overview';
};

const PendingBadge = () => {
  const count = usePendingSignupsCount();
  if (!count) return null;
  return (
    <Badge variant="secondary" className="bg-warning/20 text-warning border-0 h-5 px-1.5 text-[10px] font-bold">
      {count}
    </Badge>
  );
};

const AppShellInner = ({ kind }: { kind: 'company' | 'admin' }) => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { user, logout, setRole, companyName } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const featureSet = useCurrentFeatureSet();
  const nav = kind === 'admin'
    ? adminNav
    : companyNav.filter((item) => !('feature' in item) || !item.feature || featureSet.has(item.feature));

  return (
    <div
      className="min-h-screen flex w-full bg-background"
      data-shell={kind}
      data-page={pageKey(kind, pathname)}
    >
      <Sidebar collapsible="icon" side="right" className="border-l border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="h-9 w-9 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shrink-0">
              <Calculator className="h-5 w-5" />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-bold text-sidebar-foreground">ون كليك</div>
                <div className="text-xs text-sidebar-foreground/60 truncate">{kind === 'admin' ? 'لوحة المشرف' : companyName}</div>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{kind === 'admin' ? 'الإدارة' : 'القائمة'}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map(item => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(
                        'flex items-center gap-3',
                        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                      )}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && 'badge' in item && item.badge === 'pending-signups' && <PendingBadge />}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {kind === 'company' && (
            <SidebarGroup>
              <SidebarGroupLabel>أخرى</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/admin" className="flex items-center gap-3">
                        <Building2 className="h-4 w-4" />
                        {!collapsed && <span>لوحة المشرف</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => { logout(); navigate('/'); }}>
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>تسجيل الخروج</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="shell-header relative h-14 bg-card/60 backdrop-blur sticky top-0 z-30 flex items-center px-4 gap-3 shadow-sm">
          <SidebarTrigger />
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <span className="text-xs text-muted-foreground">عرض كـ:</span>
                <span className="font-semibold">{roleLabel(user?.role ?? 'company_admin')}</span>
                <ChevronLeft className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>تبديل الدور (للعرض)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(['company_admin','accountant','sales','viewer','super_admin'] as Role[]).map(r => (
                <DropdownMenuItem key={r} onClick={() => { setRole(r); if (r === 'super_admin') navigate('/admin'); else navigate('/app'); }}>
                  {roleLabel(r)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => navigate(kind === 'admin' ? '/admin/notifications' : '/app/notifications')}>
            <Bell className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{user?.name?.[0] ?? 'م'}</AvatarFallback></Avatar>
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-semibold leading-tight">{user?.name}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{roleLabel(user?.role ?? 'company_admin')}</div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/app/settings')}>الإعدادات</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { logout(); navigate('/'); }}>تسجيل الخروج</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {kind === 'company' && (() => {
            const blocking = companyNav.find(n => n.feature && n.to !== '/app' && pathname.startsWith(n.to) && !featureSet.has(n.feature));
            if (!blocking) return <Outlet />;
            return (
              <div className="max-w-xl mx-auto mt-12 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-soft">
                <Crown className="h-10 w-10 mx-auto text-warning mb-3" />
                <h2 className="text-xl font-bold mb-2">هذه الميزة غير مفعّلة في باقتك</h2>
                <p className="text-sm text-muted-foreground mb-5">«{blocking.label}» متاحة في باقات أعلى. يمكنك ترقية الاشتراك للوصول إليها.</p>
                <Button onClick={() => navigate('/app/subscription')}>ترقية الباقة</Button>
              </div>
            );
          })()}
          {kind === 'admin' && <Outlet />}
        </main>
      </div>
    </div>
  );
};

const AppLayout = ({ kind = 'company' as 'company' | 'admin' }) => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) {
      // auto-demo login so previews work without forcing /login
      login(kind === 'admin' ? 'owner@oneclick.sa' : 'admin@alofok.sa');
    }
  }, [user, login, kind]);
  useEffect(() => {
    if (user && kind === 'admin' && user.role !== 'super_admin') navigate('/app');
  }, [user, kind, navigate]);
  return (
    <SidebarProvider defaultOpen>
      <AppShellInner kind={kind} />
    </SidebarProvider>
  );
};

export default AppLayout;
