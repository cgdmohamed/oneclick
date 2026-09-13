import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Mail, Building2, Crown, FileText, CreditCard, Activity, ShieldCheck, Wallet, AlertCircle } from 'lucide-react';
import { api, ApiError, isApiConfigured } from '@/lib/api';
import { roleLabel, formatCurrency, formatDate, formatDateShort, invoiceStatusLabel, paymentMethodLabel } from '@/lib/format';

interface ApiCompany {
  company_id: string;
  company_name: string;
  role: string;
  is_active?: boolean;
  review_status?: string;
  created_at?: string;
  users_count?: number;
  stats?: {
    invoices_count: number;
    total_sales: string;
    total_paid: string;
    total_remaining: string;
  } | null;
  subscription?: {
    status: string;
    started_at: string;
    expires_at: string | null;
    amount: string;
    plan_name: string;
    plan_code: string;
    max_users: number;
    max_invoices_monthly: number;
  } | null;
}

interface ApiInvoice {
  id: string;
  number: string;
  issue_date: string;
  status: string;
  total: string;
  paid: string;
  remaining: string;
  company_name: string;
  client_name: string | null;
}

interface ApiPayment {
  id: string;
  amount: string;
  paid_at: string;
  method: string;
  reference: string | null;
  company_name: string;
  account_name: string | null;
  invoice_number: string | null;
}

interface ApiActivity {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
  company_name: string | null;
}

interface ApiUser {
  id: string;
  email: string;
  name: string;
  is_super_admin: boolean;
  disabled?: boolean;
  email_verified_at?: string | null;
  onboarding_done?: boolean;
  created_at: string;
  updated_at?: string;
  companies: ApiCompany[] | null;
  recent_invoices?: ApiInvoice[];
  recent_payments?: ApiPayment[];
  activity?: ApiActivity[];
}

const UserDetail360 = () => {
  const { id } = useParams<{ id: string }>();

  const { data: user, isLoading, error } = useQuery<ApiUser>({
    queryKey: ['admin-user-detail', id],
    queryFn: () => api.get<ApiUser>(`/api/platform/users/${id}`),
    enabled: isApiConfigured() && Boolean(id),
    retry: (count, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return count < 2;
    },
  });

  if (isLoading) {
    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 gap-1">
          <Link to="/admin/users"><ArrowRight className="h-4 w-4" /> قائمة المستخدمين</Link>
        </Button>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Card className="p-5">
            <div className="flex gap-5">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  const isNotFound = error instanceof ApiError && error.status === 404;

  if (error || !user) {
    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 gap-1">
          <Link to="/admin/users"><ArrowRight className="h-4 w-4" /> قائمة المستخدمين</Link>
        </Button>
        <PageHeader title={isNotFound ? 'مستخدم غير موجود' : 'خطأ في التحميل'} />
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            {isNotFound
              ? 'لم نعثر على المستخدم المطلوب.'
              : 'حدث خطأ أثناء تحميل بيانات المستخدم. يرجى المحاولة مجدداً.'}
          </p>
          <Button asChild><Link to="/admin/users">العودة للقائمة</Link></Button>
        </Card>
      </div>
    );
  }

  const companies = user.companies ?? [];
  const primaryCompany = companies[0] ?? null;
  const displayRole = user.is_super_admin ? 'super_admin' : (primaryCompany?.role ?? 'viewer');
  const totals = companies.reduce((acc, company) => {
    const stats = company.stats;
    acc.invoices += Number(stats?.invoices_count ?? 0);
    acc.sales += Number(stats?.total_sales ?? 0);
    acc.paid += Number(stats?.total_paid ?? 0);
    acc.remaining += Number(stats?.total_remaining ?? 0);
    return acc;
  }, { invoices: 0, sales: 0, paid: 0, remaining: 0 });
  const recentInvoices = user.recent_invoices ?? [];
  const recentPayments = user.recent_payments ?? [];
  const activity = user.activity ?? [];

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
              <Badge variant="secondary">{roleLabel(displayRole)}</Badge>
              {user.is_super_admin && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">مشرف المنصة</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {user.email}</span>
              {primaryCompany && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {primaryCompany.company_name}
                </span>
              )}
              {companies.length > 1 && (
                <span className="flex items-center gap-1.5">
                  <Crown className="h-3.5 w-3.5" /> {companies.length} شركات
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="إجمالي الفواتير" value={totals.invoices.toLocaleString('en-US')} icon={FileText} tone="primary" />
        <StatCard title="إجمالي المبيعات" value={formatCurrency(totals.sales)} icon={Wallet} tone="success" />
        <StatCard title="إجمالي المحصّل" value={formatCurrency(totals.paid)} icon={CreditCard} tone="info" />
        <StatCard title="متبقي على العملاء" value={formatCurrency(totals.remaining)} icon={Activity} tone="warning" />
      </div>

      <Tabs dir="rtl" defaultValue="overview">
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
                <Row label="الدور">{roleLabel(displayRole)}</Row>
                <Row label="حالة الحساب">{user.disabled ? 'معطل' : 'نشط'}</Row>
                <Row label="تأكيد البريد">{user.email_verified_at ? 'مؤكد' : 'غير مؤكد'}</Row>
                <Row label="اكتمل الإعداد">{user.onboarding_done ? 'نعم' : 'لا'}</Row>
                <Row label="تاريخ التسجيل">{formatDate(user.created_at)}</Row>
                <Row label="الشركة الأساسية">{primaryCompany?.company_name ?? 'منصة ون كليك'}</Row>
              </dl>
            </Card>

            <Card className="p-5 border-border/60 shadow-soft">
              <h3 className="font-semibold mb-3">الشركات ({companies.length})</h3>
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد شركات مرتبطة (مستخدم منصة).</p>
              ) : (
                <ul className="space-y-2.5">
                  {companies.map(c => (
                    <li key={c.company_id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-muted text-foreground text-xs">{c.company_name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.company_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.users_count ?? 0} مستخدم · {c.stats?.invoices_count ?? 0} فاتورة
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">{roleLabel(c.role)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            <h3 className="font-semibold mb-3">الاشتراكات</h3>
            <SimpleTable
              empty="لا توجد اشتراكات مرتبطة."
              headers={['الشركة', 'الباقة', 'الحالة', 'المبلغ', 'المستخدمون', 'ينتهي في']}
              rows={companies.map(company => [
                company.company_name,
                company.subscription?.plan_name ?? '—',
                subscriptionStatusLabel(company.subscription?.status),
                formatCurrency(Number(company.subscription?.amount ?? 0)),
                `${company.users_count ?? 0} / ${company.subscription?.max_users ?? '—'}`,
                company.subscription?.expires_at ? formatDateShort(company.subscription.expires_at) : '—',
              ])}
            />
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            <h3 className="font-semibold mb-3">آخر الفواتير</h3>
            <SimpleTable
              empty="لا توجد فواتير مرتبطة."
              headers={['الرقم', 'الشركة', 'العميل', 'التاريخ', 'الحالة', 'الإجمالي', 'المتبقي']}
              rows={recentInvoices.map(invoice => [
                invoice.number,
                invoice.company_name,
                invoice.client_name ?? '—',
                formatDateShort(invoice.issue_date),
                invoiceStatusLabel(invoice.status),
                formatCurrency(Number(invoice.total)),
                formatCurrency(Number(invoice.remaining)),
              ])}
            />
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            <h3 className="font-semibold mb-3">آخر المدفوعات</h3>
            <SimpleTable
              empty="لا توجد مدفوعات مرتبطة."
              headers={['التاريخ', 'الشركة', 'الفاتورة', 'الحساب', 'الطريقة', 'المبلغ']}
              rows={recentPayments.map(payment => [
                formatDateShort(payment.paid_at),
                payment.company_name,
                payment.invoice_number ?? payment.reference ?? '—',
                payment.account_name ?? '—',
                paymentMethodLabel(payment.method),
                formatCurrency(Number(payment.amount)),
              ])}
            />
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            <h3 className="font-semibold mb-3">سجل النشاط</h3>
            <SimpleTable
              empty="لا يوجد نشاط مسجل لهذا المستخدم."
              headers={['التاريخ', 'الشركة', 'الإجراء', 'الكيان']}
              rows={activity.map(item => [
                formatDateShort(item.created_at),
                item.company_name ?? 'المنصة',
                item.action,
                item.entity,
              ])}
            />
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <Card className="p-5 border-border/60 shadow-soft">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">صلاحيات دور «{roleLabel(displayRole)}»</h3>
            </div>
            {user.is_super_admin ? (
              <p className="text-sm text-muted-foreground">صلاحيات كاملة على مستوى المنصة.</p>
            ) : (
              <div className="space-y-2">
                {companies.map(c => (
                  <div key={c.company_id} className="flex items-center gap-2 text-sm rounded-lg bg-muted/40 px-3 py-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                    <span className="font-medium">{c.company_name}</span>
                    <span className="text-muted-foreground">—</span>
                    <span>{roleLabel(c.role)}</span>
                  </div>
                ))}
                {companies.length === 0 && (
                  <p className="text-sm text-muted-foreground">لا توجد صلاحيات مرتبطة.</p>
                )}
              </div>
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

const toneClasses: Record<string, { border: string; bg: string; text: string }> = {
  primary: { border: 'border-t-primary/40', bg: 'bg-primary/10', text: 'text-primary' },
  success: { border: 'border-t-success/40', bg: 'bg-success/10', text: 'text-success' },
  info: { border: 'border-t-info/40', bg: 'bg-info/10', text: 'text-info' },
  warning: { border: 'border-t-warning/40', bg: 'bg-warning/10', text: 'text-warning' },
};

const StatCard = ({ title, value, icon: Icon, tone }: { title: string; value: string; icon: React.ElementType; tone: string }) => {
  const classes = toneClasses[tone] ?? toneClasses.primary;
  return (
  <Card className={`p-4 border-border/60 shadow-soft border-t-2 ${classes.border}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-xl font-bold whitespace-nowrap">{value}</p>
      </div>
      <div className={`p-2 rounded-lg ${classes.bg}`}>
        <Icon className={`h-4 w-4 ${classes.text}`} />
      </div>
    </div>
  </Card>
  );
};

const SimpleTable = ({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-muted-foreground">
          {headers.map(header => <th key={header} className="text-start py-2 px-3 font-medium whitespace-nowrap">{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} className="py-8 text-center text-muted-foreground">{empty}</td></tr>
        ) : rows.map((row, index) => (
          <tr key={index} className="border-b last:border-0">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="py-2.5 px-3 whitespace-nowrap">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

function subscriptionStatusLabel(status?: string | null) {
  switch (status) {
    case 'active': return 'نشط';
    case 'trialing': return 'تجريبي';
    case 'past_due': return 'متأخر';
    case 'cancelled': return 'ملغي';
    case 'expired': return 'منتهي';
    default: return '—';
  }
}

export default UserDetail360;
