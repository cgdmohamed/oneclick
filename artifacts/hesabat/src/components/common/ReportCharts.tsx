import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import type { Invoice, FinancialAccount } from '@/types';
import { formatCurrency, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';

interface FlatPayment {
  id: string; date: string; invoiceId: string;
  method: string; accountId: string; amount: number;
}

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--info))'];

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
};

const ChartCard = ({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <Card className={`p-5 border-border/60 shadow-soft ${className}`}>
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold">{title}</h3>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
    <div className="h-64">{children}</div>
  </Card>
);

/** Monthly trend (issued / paid) — derived from invoices. */
const monthlyTrend = (invoices: Invoice[]) => {
  const buckets = new Map<string, { m: string; issued: number; paid: number }>();
  invoices.forEach((inv) => {
    const d = new Date(inv.issueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'short' });
    const cur = buckets.get(key) ?? { m: label, issued: 0, paid: 0 };
    cur.issued += inv.total; cur.paid += inv.paid;
    buckets.set(key, cur);
  });
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
};

export const InvoicesCharts = ({ invoices }: { invoices: Invoice[] }) => {
  const trend = useMemo(() => monthlyTrend(invoices), [invoices]);
  const status = useMemo(() => {
    const s: Record<string, number> = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
    invoices.forEach((i) => { s[i.status] = (s[i.status] ?? 0) + 1; });
    return Object.entries(s).map(([k, v]) => ({ name: invoiceStatusLabel(k), value: v, key: k }));
  }, [invoices]);

  return (
    <div className="grid lg:grid-cols-3 gap-4 mb-5">
      <ChartCard title="حركة الفواتير الشهرية" hint="مصدرة مقابل مدفوعة" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="g-issued" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-paid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="issued" name="مصدرة" stroke="hsl(var(--primary))" fill="url(#g-issued)" strokeWidth={2} />
            <Area type="monotone" dataKey="paid"   name="مدفوعة" stroke="hsl(var(--success))" fill="url(#g-paid)"   strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="توزيع حالات الفواتير">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={status} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {status.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export const PaymentsCharts = ({ payments }: { payments: FlatPayment[] }) => {
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => {
      const d = new Date(p.date);
      const key = d.toLocaleDateString('en-CA');
      map.set(key, (map.get(key) ?? 0) + p.amount);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([d, v]) => ({ d: d.slice(5), v }));
  }, [payments]);

  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    payments.forEach((p) => { m[p.method] = (m[p.method] ?? 0) + p.amount; });
    return Object.entries(m).map(([k, v]) => ({ name: paymentMethodLabel(k), value: v }));
  }, [payments]);

  return (
    <div className="grid lg:grid-cols-3 gap-4 mb-5">
      <ChartCard title="المدفوعات اليومية" hint="آخر 14 يوماً" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="v" name="المبلغ" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="حسب وسيلة الدفع">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}>
              {byMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export const RemainingCharts = ({ invoices }: { invoices: Invoice[] }) => {
  const aging = useMemo(() => {
    const buckets = [
      { name: 'لم يحن', amount: 0, color: 'hsl(var(--success))' },
      { name: '1–30 يوم', amount: 0, color: 'hsl(var(--primary))' },
      { name: '31–60 يوم', amount: 0, color: 'hsl(var(--warning))' },
      { name: '61–90 يوم', amount: 0, color: 'hsl(var(--destructive))' },
      { name: '+90 يوم', amount: 0, color: 'hsl(var(--destructive))' },
    ];
    const now = Date.now();
    invoices.filter((i) => i.remaining > 0).forEach((inv) => {
      const days = Math.floor((now - +new Date(inv.dueDate)) / 86400000);
      const idx = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      buckets[idx].amount += inv.remaining;
    });
    return buckets;
  }, [invoices]);

  const topDebtors = useMemo(() => {
    const by = new Map<string, number>();
    invoices.filter((i) => i.remaining > 0).forEach((i) => {
      const key = (i as Invoice & { clientName?: string }).clientName ?? i.clientId;
      by.set(key, (by.get(key) ?? 0) + i.remaining);
    });
    return Array.from(by.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, amount]) => ({ name, amount }));
  }, [invoices]);

  return (
    <div className="grid lg:grid-cols-2 gap-4 mb-5">
      <ChartCard title="تقادم الذمم المدينة">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={aging} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="amount" name="المتبقي" radius={[6, 6, 0, 0]}>
              {aging.map((b, i) => <Cell key={i} fill={b.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="أعلى العملاء بمتأخرات">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topDebtors} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={110} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export const ByAccountCharts = ({ accounts, payments }: { accounts: FinancialAccount[]; payments: FlatPayment[] }) => {
  const data = useMemo(() => accounts.map((a) => ({
    name: a.name,
    collected: payments.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.amount, 0),
    balance: a.balance,
  })), [accounts, payments]);

  return (
    <div className="mb-5">
      <ChartCard title="الحسابات: المُحصَّل مقابل الرصيد">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="collected" name="المُحصَّل" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            <Bar dataKey="balance"   name="الرصيد"    fill="hsl(var(--success))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};
