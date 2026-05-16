import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'الرئيسية' },
  { to: '/features', label: 'المميزات' },
  { to: '/pricing', label: 'الأسعار' },
  { to: '/about', label: 'من نحن' },
  { to: '/contact', label: 'تواصل معنا' },
];

const publicKey = (path: string): string => {
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/features')) return 'features';
  if (path.startsWith('/pricing')) return 'pricing';
  if (path.startsWith('/about')) return 'about';
  if (path.startsWith('/contact')) return 'contact';
  if (path.startsWith('/login')) return 'login';
  if (path.startsWith('/register')) return 'register';
  return 'home';
};

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

const PublicLayout = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));
  return (
    <div className="min-h-screen flex flex-col bg-background" data-public={publicKey(pathname)}>
      <header className={cn("sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border/60", isAuthPage && "hidden")}>
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg" aria-label="الصفحة الرئيسية">
            <BrandLogo size="md" />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <NavLink key={l.to} to={l.to} end className={({ isActive }) => cn(
                'px-3.5 py-2 text-sm font-medium rounded-lg transition-colors',
                isActive ? 'text-primary bg-primary/8' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              )}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="font-medium"><Link to="/login">تسجيل الدخول</Link></Button>
            <Button asChild size="sm" className="font-medium shadow-sm"><Link to="/register">ابدأ مجاناً</Link></Button>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(v => !v)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        {open && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="container py-3 flex flex-col gap-1">
              {links.map(l => (
                <NavLink key={l.to} to={l.to} end onClick={() => setOpen(false)} className={({ isActive }) => cn(
                  'px-3 py-2 text-sm rounded-lg hover:bg-accent', isActive && 'text-primary font-semibold'
                )}>{l.label}</NavLink>
              ))}
              <div className="flex gap-2 pt-2">
                <Button asChild variant="outline" className="flex-1"><Link to="/login">دخول</Link></Button>
                <Button asChild className="flex-1"><Link to="/register">ابدأ</Link></Button>
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className={cn("border-t border-border/60 bg-card/50 mt-16", isAuthPage && "hidden")}>
        <div className="container py-10 grid md:grid-cols-4 gap-8">
          <div>
            <div className="mb-3">
              <BrandLogo size="md" />
            </div>
            <p className="text-sm text-muted-foreground">ون كليك: منصة محاسبة سحابية للشركات الصغيرة والمتوسطة. أدِر فواتيرك ومدفوعاتك ومخزونك بنقرة واحدة.</p>
          </div>
          <FooterCol title="المنتج" items={[['/features', 'المميزات'], ['/pricing', 'الأسعار'], ['/register', 'ابدأ الآن']]} />
          <FooterCol title="الشركة" items={[['/about', 'من نحن'], ['/contact', 'تواصل معنا']]} />
          <FooterCol title="الحساب" items={[['/login', 'تسجيل الدخول'], ['/register', 'تسجيل شركة جديدة']]} />
        </div>
        <div className="border-t border-border/60">
          <div className="container py-4 text-xs text-muted-foreground flex justify-between">
            <span>© {new Date().getFullYear()} ون كليك. جميع الحقوق محفوظة.</span>
            <span>صنع بعناية للشركات العربية.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FooterCol = ({ title, items }: { title: string; items: [string, string][] }) => (
  <div>
    <h4 className="font-semibold mb-3 text-sm">{title}</h4>
    <ul className="space-y-2 text-sm text-muted-foreground">
      {items.map(([to, label]) => (
        <li key={to}><Link to={to} className="hover:text-foreground">{label}</Link></li>
      ))}
    </ul>
  </div>
);

export default PublicLayout;
