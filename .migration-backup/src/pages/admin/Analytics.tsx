import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  companies as mockCompanies, subscriptions as mockSubs, plans as mockPlans,
  invoices as mockInvoices, payments as mockPayments, users as mockUsers,
} from '@/data/mock';
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

// Generate a deterministic 12-month series so the dashboard feels real even on mock data
const useMonthlySeries = (range: 6 | 12) => useMemo(() => {
  const now = new Date();
  const months: { key: string; m: string; signups: number; mrr: number; churn: number; revenue: number }[] = [];
  let mrrBase = 14500;
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'short' });
    const growth = 1 + (Math.sin(i * 0.7) + 1) * 0.04 + 0.02;
    mrrBase = Math.round(mrrBase * growth);
    const signups = 8 + Math.round((Math.cos(i * 0.9) + 1.2) * 12);
    const churn = Math.max(0, Math.round(2 + Math.sin(i * 1.3) * 2));
    const revenue = Math.round(mrrBase * (1.05 + (Math.sin(i) + 1) * 0.06));
    months.push({ key, m: label, signups, mrr: mrrBase, churn, revenue });
  }
  return months;
}, [range]);

const Analytics = () => {
  const [range, setRange] = useState<6 | 12>(12);
  const series = useMonthlySeries(range);

  const stats = useMemo(() => {
    const active = mockSubs.filter(s => s.status === 'active');
    const expired = mockSubs.filter(s => s.status === 'expired');
    const mrr = active.reduce((sum, s) => {
      const plan = mockPlans.find(p => p.id === s.planId);
      if (!plan) return sum;
      // approximate monthly value from yearly when applicable
      return sum + (s.amount >= plan.yearlyPrice * 0.9 ? plan.monthlyPrice : s.amount);
    }, 0);
    const arr = mrr * 12;
    const arpu = active.length ? mrr / active.length : 0;
    const churnRate = mockSubs.length ? (expired.length / mockSubs.length) * 100 : 0;
    const collected = mockSubs.filter(s => s.paid).reduce((s, x) => s + x.amount, 0);
    return {
      companies: mockCompanies.length,
      activeSubs: active.length,
      mrr, arr, arpu, churnRate, collected,
      totalUsers: mockUsers.length,
    };
  }, []);

  const planDist = useMemo(() => mockPlans.map(p => ({
    name: p.name,
    value: mockSubs.filter(s => s.planId === p.id).length,
    revenue: mockSubs.filter(s => s.planId === p.id && s.paid).reduce((sum, s) => sum + s.amount, 0),
  })), []);

  const statusDist = useMemo(() => {
    const counts: Record<string, number> = { active: 0, expired: 0, suspended: 0, trialing: 0 };
    mockSubs.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
    const labelMap: Record<string, string> = { active: 'نشطة', expired: 'منتهية', suspended: 'موقوفة', trialing: 'تجريبية' };
    return Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: labelMap[k] ?? k, value: v }));
  }, []);

  const topCompanies = useMemo(() => {
    return mockCompanies.map(c => {
      const invs = mockInvoices.filter(i => i.companyId === c.id);
      const pays = mockPayments.filter(p => p.companyId === c.id);
      return {
        name: c.name.length > 18 ? c.name.slice(0, 18) + '…' : c.name,
        invoices: invs.length,
        revenue: pays.reduce((s, p) => s + p.amount, 0),
      };
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, []);

  const lastMonth = series[series.length - 1];
  const prevMonth = series[series.length - 2] ?? lastMonth;
  const mrrTrendPct = prevMonth.mrr ? ((lastMonth.mrr - prevMonth.mrr) / prevMonth.mrr) * 100 : 0;
  const signupsTrendPct = prevMonth.signups ? ((lastMonth.signups - prevMonth.signups) / prevMonth.signups) * 100 : 0;

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          title="MRR (إيراد شهري متكرر)"
          value={formatCurrency(stats.mrr)}
          icon={DollarSign}
          accent="primary"
          trend={{ value: `${mrrTrendPct >= 0 ? '+' : ''}${mrrTrendPct.toFixed(1)}% مقابل الشهر السابق`, positive: mrrTrendPct >= 0 }}
        />
        <StatCard title="ARR (إيراد سنوي)" value={formatCurrency(stats.arr)} icon={TrendingUp} accent="success" />
        <StatCard title="ARPU (متوسط لكل عميل)" value={formatCurrency(Math.round(stats.arpu))} icon={Crown} accent="info" />
        <StatCard
          title="تسجيلات الشهر"
          value={lastMonth.signups}
          icon={Users2}
          accent="warning"
          trend={{ value: `${signupsTrendPct >= 0 ? '+' : ''}${signupsTrendPct.toFixed(1)}%`, positive: signupsTrendPct >= 0 }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="إجمالي الشركات" value={stats.companies} icon={Building2} accent="primary" />
        <StatCard title="اشتراكات نشطة" value={stats.activeSubs} icon={Activity} accent="success" />
        <StatCard title="معدل التسرّب" value={`${stats.churnRate.toFixed(1)}%`} icon={UserMinus} accent="destructive" />
        <StatCard title="إجمالي المستخدمين" value={stats.totalUsers} icon={Repeat} accent="info" />
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
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={planDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2}>
                {planDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <ChartCard title="تسجيلات الشركات الجديدة" hint="عدد التسجيلات شهرياً">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="signups" name="تسجيلات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="التسرّب الشهري (Churn)" hint="عدد الاشتراكات الملغاة">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="churn" name="ملغاة" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <ChartCard title="حالات الاشتراكات">
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
        </ChartCard>

        <ChartCard title="أعلى الشركات إيراداً" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCompanies} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="revenue" name="الإيراد" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="p-5 border-border/60 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">إيراد الباقات</h3>
          <span className="text-xs text-muted-foreground">مجموع التحصيلات حسب الباقة</span>
        </div>
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
      </Card>
    </div>
  );
};

export default Analytics;
