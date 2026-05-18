import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  TrendingUp, Users2, Building2, DollarSign, Repeat, UserMinus, Activity, Crown,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--destructive))'];

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
};

const ChartCard = ({
  title, hint, children, className = '',
}: { title: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <Card className={`p-5 border-border/60 shadow-soft ${className}`}>
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold">{title}</h3>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
    <div className="h-64">{children}</div>
  </Card>
);

const SkeletonBlock = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse bg-muted rounded-lg ${className}`} />
);

interface SeriesPoint {
  key: string;
  signups: number;
  mrr: number;
  churn: number;
}
interface Kpis {
  mrr: number;
  arr: number;
  arpu: number;
  churn_rate: number;
  total_companies: number;
  active_subs: number;
  total_users: number;
}
interface PlanDist { name: string; count: number; revenue: number }
interface StatusDist { status: string; count: number }
interface TopCompany { name: string; revenue: number }
interface AnalyticsData {
  series: SeriesPoint[];
  kpis: Kpis;
  plan_dist: PlanDist[];
  status_dist: StatusDist[];
  top_companies: TopCompany[];
}

const STATUS_LABELS: Record<string, string> = {
  active: 'نشطة', expired: 'منتهية', cancelled: 'ملغاة', trialing: 'تجريبية', suspended: 'موقوفة',
};

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'short' });
}

const Analytics = () => {
  const [range, setRange] = useState<6 | 12>(12);
  const apiOn = isApiConfigured();

  const q = useQuery({
    enabled: apiOn,
    queryKey: ['admin-analytics'],
    queryFn: async () => (await api.get<{ data: AnalyticsData }>('/api/platform/analytics')).data,
    staleTime: 5 * 60 * 1000,
  });

  const series = useMemo(() => {
    const raw = q.data?.series ?? [];
    const sliced = raw.slice(-range);
    return sliced.map(pt => ({ ...pt, m: monthLabel(pt.key) }));
  }, [q.data, range]);

  const kpis = q.data?.kpis;

  const planDist = useMemo(() =>
    (q.data?.plan_dist ?? []).map(p => ({ name: p.name, value: p.count, revenue: p.revenue })),
    [q.data]);

  const statusDist = useMemo(() =>
    (q.data?.status_dist ?? []).map(s => ({ name: STATUS_LABELS[s.status] ?? s.status, value: s.count })),
    [q.data]);

  const topCompanies = useMemo(() => q.data?.top_companies ?? [], [q.data]);

  const lastMonth = series[series.length - 1];
  const prevMonth = series[series.length - 2];
  const mrrTrendPct = (prevMonth && prevMonth.mrr)
    ? ((( lastMonth?.mrr ?? 0) - prevMonth.mrr) / prevMonth.mrr) * 100
    : 0;
  const signupsTrendPct = (prevMonth && prevMonth.signups)
    ? (((lastMonth?.signups ?? 0) - prevMonth.signups) / prevMonth.signups) * 100
    : 0;

  if (q.isError) {
    return (
      <div>
        <PageHeader title="تحليلات المنصة" description="مؤشرات النمو والإيرادات وسلوك الاشتراكات على مستوى المنصة" />
        <Card className="p-8 flex flex-col items-center gap-3 text-center border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="font-semibold">تعذّر تحميل بيانات التحليلات</p>
          <p className="text-sm text-muted-foreground">حاول تحديث الصفحة أو تسجيل الدخول من جديد.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} className="gap-2 mt-1">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  const loading = q.isPending;

  return (
    <div>
      <PageHeader
        title="تحليلات المنصة"
        description="مؤشرات النمو والإيرادات وسلوك الاشتراكات على مستوى المنصة"
        actions={
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button size="sm" variant={range === 6 ? 'default' : 'ghost'} onClick={() => setRange(6)} className="h-8">٦ أشهر</Button>
            <Button size="sm" variant={range === 12 ? 'default' : 'ghost'} onClick={() => setRange(12)} className="h-8">١٢ شهراً</Button>
          </div>
        }
      />

      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-28" />)}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-28" />)}
          </div>
          <div className="grid lg:grid-cols-3 gap-4 mb-5">
            <SkeletonBlock className="h-80 lg:col-span-2" />
            <SkeletonBlock className="h-80" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4 mb-5">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80 lg:col-span-2" />
          </div>
          <SkeletonBlock className="h-40" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard
              title="MRR (إيراد شهري متكرر)"
              value={formatCurrency(kpis?.mrr ?? 0)}
              icon={DollarSign}
              accent="primary"
              trend={{ value: `${mrrTrendPct >= 0 ? '+' : ''}${mrrTrendPct.toFixed(1)}% مقابل الشهر السابق`, positive: mrrTrendPct >= 0 }}
            />
            <StatCard title="ARR (إيراد سنوي)" value={formatCurrency(kpis?.arr ?? 0)} icon={TrendingUp} accent="success" />
            <StatCard title="ARPU (متوسط لكل عميل)" value={formatCurrency(Math.round(kpis?.arpu ?? 0))} icon={Crown} accent="info" />
            <StatCard
              title="تسجيلات الشهر"
              value={lastMonth?.signups ?? 0}
              icon={Users2}
              accent="warning"
              trend={{ value: `${signupsTrendPct >= 0 ? '+' : ''}${signupsTrendPct.toFixed(1)}%`, positive: signupsTrendPct >= 0 }}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard title="إجمالي الشركات" value={kpis?.total_companies ?? 0} icon={Building2} accent="primary" />
            <StatCard title="اشتراكات نشطة" value={kpis?.active_subs ?? 0} icon={Activity} accent="success" />
            <StatCard title="معدل التسرّب (30 يوم)" value={`${(kpis?.churn_rate ?? 0).toFixed(1)}%`} icon={UserMinus} accent="destructive" />
            <StatCard title="إجمالي المستخدمين" value={kpis?.total_users ?? 0} icon={Repeat} accent="info" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-5">
            <ChartCard title="نمو الإيراد الشهري المتكرر (MRR)" hint={`آخر ${range} شهراً`} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-mrr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="mrr" name="MRR" stroke="hsl(var(--primary))" fill="url(#g-mrr)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="توزيع الاشتراكات حسب الباقة">
              {planDist.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">لا توجد بيانات</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={planDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2}>
                      {planDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <ChartCard title="تسجيلات الشركات الجديدة" hint="عدد التسجيلات شهرياً">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="signups" name="تسجيلات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="التسرّب الشهري (Churn)" hint="عدد الاشتراكات الملغاة / المنتهية">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="churn" name="ملغاة / منتهية" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-5">
            <ChartCard title="حالات الاشتراكات">
              {statusDist.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">لا توجد بيانات</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                      label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}>
                      {statusDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="أعلى الشركات إيراداً" className="lg:col-span-2">
              {topCompanies.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">لا توجد مدفوعات مسجّلة بعد</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCompanies} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" name="الإيراد" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <Card className="p-5 border-border/60 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">إيراد الباقات</h3>
              <span className="text-xs text-muted-foreground">مجموع التحصيلات حسب الباقة</span>
            </div>
            {planDist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد باقات نشطة بعد</p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3">
                {planDist.map((p, i) => (
                  <div key={p.name} className="rounded-lg border border-border/60 p-4 bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{p.name}</span>
                      <Badge variant="secondary" className="text-xs" style={{ background: `${PIE_COLORS[i % PIE_COLORS.length]}20`, color: PIE_COLORS[i % PIE_COLORS.length] }}>
                        {p.value} اشتراك
                      </Badge>
                    </div>
                    <div className="text-2xl font-bold tracking-tight">{formatCurrency(p.revenue)}</div>
                    <div className="text-xs text-muted-foreground mt-1">إجمالي محصّل</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default Analytics;
