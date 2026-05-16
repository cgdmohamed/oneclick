import { StatCard } from '@/components/common/StatCard';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { invoices, clients, products, payments } from '@/data/mock';
import { FileText, CreditCard, TrendingDown, Users, Package, Wallet, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDateShort, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const Overview = () => {
  const totalSales = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paid, 0);
  const totalRemaining = invoices.reduce((s, i) => s + i.remaining, 0);
  const lowStock = products.filter(p => p.quantity <= p.alertLevel);

  const monthly = [
    { m: 'يناير', v: 32500 },{ m: 'فبراير', v: 41200 },{ m: 'مارس', v: 38700 },
    { m: 'أبريل', v: 52100 },{ m: 'مايو', v: 47800 },{ m: 'يونيو', v: 61400 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="نظرة عامة" description="ملخص أداء شركتك المالي" />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="إجمالي المبيعات" value={formatCurrency(totalSales)} icon={Wallet} accent="primary" />
        <StatCard title="إجمالي المدفوع" value={formatCurrency(totalPaid)} icon={CreditCard} accent="success" />
        <StatCard title="إجمالي المتبقي" value={formatCurrency(totalRemaining)} icon={TrendingDown} accent="warning" />
        <StatCard title="عدد الفواتير" value={invoices.length} icon={FileText} accent="info" />
        <StatCard title="العملاء" value={clients.length} icon={Users} accent="primary" />
        <StatCard title="مخزون منخفض" value={lowStock.length} icon={AlertTriangle} accent="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5 shadow-soft border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">المبيعات الشهرية</h3>
            <span className="text-xs text-muted-foreground">آخر 6 أشهر</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 shadow-soft border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">منتجات منخفضة المخزون</h3>
            <Button asChild variant="ghost" size="sm"><Link to="/app/products">عرض الكل</Link></Button>
          </div>
          <div className="space-y-2.5">
            {lowStock.length === 0 && <p className="text-sm text-muted-foreground">لا توجد منتجات منخفضة.</p>}
            {lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.code}</div>
                </div>
                <div className="text-end">
                  <div className="font-bold text-destructive">{p.quantity}</div>
                  <div className="text-xs text-muted-foreground">من {p.alertLevel}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5 shadow-soft border-border/60">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">آخر الفواتير</h3>
          <Button asChild variant="ghost" size="sm"><Link to="/app/invoices">عرض الكل</Link></Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold">رقم الفاتورة</th>
                <th className="py-2 font-semibold">العميل</th>
                <th className="py-2 font-semibold">التاريخ</th>
                <th className="py-2 font-semibold">الإجمالي</th>
                <th className="py-2 font-semibold">المتبقي</th>
                <th className="py-2 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 6).map(inv => {
                const c = clients.find(x => x.id === inv.clientId);
                return (
                  <tr key={inv.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="py-3 font-medium"><Link to={`/app/invoices/${inv.id}`} className="text-primary">{inv.number}</Link></td>
                    <td className="py-3">{c?.name}</td>
                    <td className="py-3 text-muted-foreground">{formatDateShort(inv.issueDate)}</td>
                    <td className="py-3">{formatCurrency(inv.total)}</td>
                    <td className="py-3">{formatCurrency(inv.remaining)}</td>
                    <td className="py-3"><StatusBadge status={inv.status} label={invoiceStatusLabel(inv.status)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Overview;
