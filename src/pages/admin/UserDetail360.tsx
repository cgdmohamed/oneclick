import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, Mail, Phone, Building2, Crown, FileText, CreditCard, Activity, ShieldCheck, Wallet } from 'lucide-react';
import {
  users as mockUsers, companies as mockCompanies, subscriptions as mockSubs,
  plans as mockPlans, invoices as mockInvoices, payments as mockPayments,
  rolePermissions,
} from '@/data/mock';
import { roleLabel, companyStatusLabel, formatCurrency, formatDate, formatDateShort, invoiceStatusLabel } from '@/lib/format';

const UserDetail360 = () => {
  const { id } = useParams<{ id: string }>();
  const user = useMemo(() => mockUsers.find(u => u.id === id), [id]);

  if (!user) {
    return (
      <div>
        <PageHeader title="مستخدم غير موجود" />
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">لم نعثر على المستخدم المطلوب.</p>
          <Button asChild><Link to="/admin/users">العودة للقائمة</Link></Button>
        </Card>
      </div>
    );
  }

  const company = user.companyId ? mockCompanies.find(c => c.id === user.companyId) : null;
  const sub = user.companyId ? mockSubs.find(s => s.companyId === user.companyId) : null;
  const plan = sub ? mockPlans.find(p => p.id === sub.planId) : null;
  const invoices = user.companyId ? mockInvoices.filter(i => i.companyId === user.companyId) : [];
  const payments = user.companyId ? mockPayments.filter(p => p.companyId === user.companyId) : [];
  const teamUsers = user.companyId ? mockUsers.filter(u => u.companyId === user.companyId) : [];

  const totalBilled = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = invoices.reduce((s, i) => s + i.remaining, 0);

  // Generate fake login/activity timeline so the 360 view feels alive
  const activity = useMemo(() => {
    const events: { date: string; type: string; label: string }[] = [];
    invoices.slice(0, 4).forEach((inv, idx) => {
      events.push({
        date: inv.issueDate,
        type: 'invoice',
        label: `أصدر الفاتورة ${inv.number} بقيمة ${formatCurrency(inv.total)}`,
      });
      if (idx < 2) events.push({
        date: new Date(new Date(inv.issueDate).getTime() + 86400000 * 2).toISOString(),
        type: 'login',
        label: 'تسجيل دخول من متصفح Chrome — الرياض',
      });
    });
    payments.slice(0, 3).forEach((p) => events.push({
      date: p.date,
      type: 'payment',
      label: `سجّل دفعة بقيمة ${formatCurrency(p.amount)}`,
    }));
    return events.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [invoices, payments]);

  const perms = rolePermissions[user.role] ?? [];

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 gap-1">
        <Link to="/admin/users"><ArrowRight className="h-4 w-4" /> قائمة المستخدمين</Link>
      </Button>

      <PageHeader title={`ملف ${user.name}`} description="عرض موحّد لنشاط المستخدم واشتراك شركته" />

      <Card className="p-5 border-border/60 shadow-soft mb-5">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <Avatar className="h-20 w-20 ring-2 ring-primary/10">
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {user.name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold truncate">{user.name}</h2>
              <Badge variant="secondary">{roleLabel(user.role)}</Badge>
              {company && <StatusBadge status={company.status} label={companyStatusLabel(company.status)} />}
            </div>
            <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {user.email}</span>
              {user.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {user.phone}</span>}
              {company && (
                <Link to="/admin/companies" className="flex items-center gap-1.5 hover:text-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {company.name}
                </Link>
              )}
              {plan && <span className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" /> باقة {plan.name}</span>}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="إجمالي الفواتير" value={invoices.length} icon={FileText} accent="primary" />
        <StatCard title="إجمالي المبيعات" value={formatCurrency(totalBilled)} icon={Wallet} accent="success" />
        <StatCard title="إجمالي المحصّل" value={formatCurrency(totalPaid)} icon={CreditCard} accent="info" />
        <StatCard title="متبقي على العملاء" value={formatCurrency(outstanding)} icon={Activity} accent="warning" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="subscription">الاشتراك</TabsTrigger>
          <TabsTrigger value="invoices">الفواتير</TabsTrigger>
          <TabsTrigger value="payments">المدفوعات</TabsTrigger>
          <TabsTrigger value="activity">سجل النشاط</TabsTrigger>
          <TabsTrigger value="permissions">الصلاحيات</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5 border-border/60 shadow-soft">
              <h3 className="font-semibold mb-3">معلومات الحساب</h3>
              <dl className="space-y-2.5 text-sm">
                <Row label="الاسم">{user.name}</Row>
                <Row label="البريد">{user.email}</Row>
                <Row label="الهاتف">{user.phone ?? '—'}</Row>
                <Row label="الدور">{roleLabel(user.role)}</Row>
                <Row label="الشركة">{company?.name ?? 'منصة ون كليك'}</Row>
                {company && <Row label="تاريخ الانضمام">{formatDate(company.createdAt)}</Row>}
              </dl>
            </Card>

            <Card className="p-5 border-border/60 shadow-soft">
              <h3 className="font-semibold mb-3">فريق الشركة ({teamUsers.length})</h3>
              {teamUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد أعضاء آخرون.</p>
              ) : (
                <ul className="space-y-2.5">
                  {teamUsers.map(t => (
                    <li key={t.id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-muted text-foreground text-xs">{t.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}{t.id === user.id && <span className="text-xs text-muted-foreground"> (هذا المستخدم)</span>}</div>
                        <div className="text-xs text-muted-foreground truncate">{t.email}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">{roleLabel(t.role)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            {sub && plan && company ? (
              <div className="space-y-3 text-sm">
                <Row label="الباقة">{plan.name}</Row>
                <Row label="السعر الشهري">{formatCurrency(plan.monthlyPrice)}</Row>
                <Row label="السعر السنوي">{formatCurrency(plan.yearlyPrice)}</Row>
                <Row label="حالة الاشتراك"><StatusBadge status={sub.status} label={companyStatusLabel(sub.status)} /></Row>
                <Row label="بداية الاشتراك">{formatDate(sub.startDate)}</Row>
                <Row label="نهاية الاشتراك">{formatDate(sub.endDate)}</Row>
                <Row label="حالة الدفع">{sub.paid ? <Badge className="bg-success/15 text-success border-0">مدفوع</Badge> : <Badge className="bg-destructive/15 text-destructive border-0">غير مدفوع</Badge>}</Row>
                <Row label="قيمة الاشتراك">{formatCurrency(sub.amount)}</Row>
                <div className="pt-3 border-t border-border/60">
                  <h4 className="font-semibold mb-2">حدود الباقة</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {Object.entries(plan.limits).map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-border/60 p-3 bg-muted/30">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="text-lg font-bold">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">لا يوجد اشتراك مرتبط (مستخدم منصة).</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card className="p-0 border-border/60 shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-start py-2.5 px-4 font-semibold">الرقم</th>
                  <th className="text-start py-2.5 px-4 font-semibold">تاريخ</th>
                  <th className="text-start py-2.5 px-4 font-semibold">الإجمالي</th>
                  <th className="text-start py-2.5 px-4 font-semibold">المتبقي</th>
                  <th className="text-start py-2.5 px-4 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد فواتير.</td></tr>
                ) : invoices.map(i => (
                  <tr key={i.id} className="border-t border-border/60">
                    <td className="py-2.5 px-4 font-medium">{i.number}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{formatDateShort(i.issueDate)}</td>
                    <td className="py-2.5 px-4">{formatCurrency(i.total)}</td>
                    <td className="py-2.5 px-4">{formatCurrency(i.remaining)}</td>
                    <td className="py-2.5 px-4"><StatusBadge status={i.status} label={invoiceStatusLabel(i.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card className="p-0 border-border/60 shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-start py-2.5 px-4 font-semibold">التاريخ</th>
                  <th className="text-start py-2.5 px-4 font-semibold">المبلغ</th>
                  <th className="text-start py-2.5 px-4 font-semibold">طرق الدفع</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">لا توجد مدفوعات.</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="border-t border-border/60">
                    <td className="py-2.5 px-4">{formatDateShort(p.date)}</td>
                    <td className="py-2.5 px-4 font-semibold">{formatCurrency(p.amount)}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{p.splits.map(s => s.method).join('، ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا يوجد نشاط مسجّل بعد.</p>
            ) : (
              <ol className="relative border-r-2 border-border/60 pr-5 space-y-4">
                {activity.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute right-[-26px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                    <div className="text-sm font-medium">{e.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{formatDate(e.date)}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">صلاحيات دور «{roleLabel(user.role)}»</h3>
            </div>
            {perms.length === 0 ? (
              <p className="text-sm text-muted-foreground">صلاحيات كاملة على مستوى المنصة.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-2">
                {perms.map(p => (
                  <li key={p} className="flex items-center gap-2 text-sm rounded-lg bg-muted/40 px-3 py-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" /> {p}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-medium text-end">{children}</dd>
  </div>
);

export default UserDetail360;
