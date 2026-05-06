import { Outlet, NavLink, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Calculator, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'الرئيسية' },
  { to: '/features', label: 'المميزات' },
  { to: '/pricing', label: 'الأسعار' },
  { to: '/about', label: 'من نحن' },
  { to: '/contact', label: 'تواصل معنا' },
];

const PublicLayout = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border/60">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="h-9 w-9 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
              <Calculator className="h-5 w-5" />
            </span>
            حسابات
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <NavLink key={l.to} to={l.to} end className={({ isActive }) => cn(
                'px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors',
                isActive && 'text-primary font-semibold'
              )}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/login">تسجيل الدخول</Link></Button>
            <Button asChild><Link to="/register">ابدأ مجاناً</Link></Button>
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
      <footer className="border-t border-border/60 bg-card/50 mt-16">
        <div className="container py-10 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 font-bold text-lg mb-3">
              <span className="h-9 w-9 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
                <Calculator className="h-5 w-5" />
              </span>
              حسابات
            </div>
            <p className="text-sm text-muted-foreground">منصة محاسبة سحابية للشركات الصغيرة والمتوسطة. نُبسّط لك الفواتير والمدفوعات والمخزون.</p>
          </div>
          <FooterCol title="المنتج" items={[['/features', 'المميزات'], ['/pricing', 'الأسعار'], ['/register', 'ابدأ الآن']]} />
          <FooterCol title="الشركة" items={[['/about', 'من نحن'], ['/contact', 'تواصل معنا']]} />
          <FooterCol title="الحساب" items={[['/login', 'تسجيل الدخول'], ['/register', 'تسجيل شركة جديدة']]} />
        </div>
        <div className="border-t border-border/60">
          <div className="container py-4 text-xs text-muted-foreground flex justify-between">
            <span>© {new Date().getFullYear()} حسابات. جميع الحقوق محفوظة.</span>
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
