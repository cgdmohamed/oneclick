import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@/components/common/StatCard';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { FileText, CreditCard, TrendingDown, Users, Package, Wallet, AlertTriangle, ArrowUpFromLine, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDateShort, invoiceStatusLabel, paymentMethodLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api, isApiConfigured } from '@/lib/api';
import { useProducts } from '@/hooks/entities';
import {
  invoices as mockInvoices,
  clients as mockClients,
  products as mockProducts,
} from '@/data/mock';

const ARABIC_MONTHS: Record<string, string> = {
  '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
  '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
  '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
};

interface RecentInvoice {
  id: string; number: string; issue_date: string;
  total: string | number; remaining: string | number;
  status: string; client_name: string | null;
}

interface RecentCollection {
  id: string; amount: string | number; paid_at: string;
  method: string; account_name: string;
  invoice_number: string | null; client_name: string | null;
}

interface RecentPayout {
  id: string; amount: string | number; paid_at: string;
  method: string; account_name: string;
  supplier_name: string | null; category_name: string | null;
}

interface AccountBalance {
  id: string; name: string; type: string; balance: string | number;
}

interface OverviewData {
  totals: {
    total_sales: string | number; total_paid: string | number;
    total_remaining: string | number; invoices_count: string | number;
    total_payouts: string | number; net_cash: string | number;
  };
  low_stock: number;
  clients: number;
  monthly_sales: Array<{ month: string; total: string | number }>;
  recent_invoices: RecentInvoice[];
  recent_collections: RecentCollection[];
  recent_payouts: RecentPayout[];
  account_balances: AccountBalance[];
}

const Overview = () => {
  const apiOn = isApiConfigured();

  const overviewQuery = useQuery({
    enabled: apiOn,
    queryKey: ['reports-overview'],
    queryFn: async () => {
      const res = await api.get<{ data: OverviewData }>('/api/reports/overview');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { list: products } = useProducts();

  const data = overviewQuery.data;

  const totalSales     = data ? Number(data.totals.total_sales)     : mockInvoices.reduce((s, i) => s + i.total, 0);
  const totalPaid      = data ? Number(data.totals.total_paid)      : mockInvoices.reduce((s, i) => s + i.paid, 0);
  const totalRemaining = data ? Number(data.totals.total_remaining) : mockInvoices.reduce((s, i) => s + i.remaining, 0);
  const invoicesCount  = data ? Number(data.totals.invoices_count)  : mockInvoices.length;
  const clientsCount   = data ? data.clients                        : mockClients.length;
  const totalPayouts   = data ? Number(data.totals.total_payouts)   : 0;
  const netCash        = data ? Number(data.totals.net_cash)        : totalPaid;
  const lowStockCount  = data
    ? data.low_stock
    : mockProducts.filter((p) => p.quantity <= p.alertLevel).length;

  const monthly = data
    ? data.monthly_sales.map((row) => ({
        m: ARABIC_MONTHS[row.month.slice(5, 7)] ?? row.month,
        v: Number(row.total),
      }))
    : [
        { m: 'يناير', v: 32500 }, { m: 'فبراير', v: 41200 },
        { m: 'مارس', v: 38700 }, { m: 'أبريل', v: 52100 },
        { m: 'مايو', v: 47800 }, { m: 'يونيو', v: 61400 },
      ];

  const lowStock = apiOn
    ? products.filter((p) => p.quantity <= p.alertLevel)
    : mockProducts.filter((p) => p.quantity <= p.alertLevel);

  const recentInvoices: RecentInvoice[] = data?.recent_invoices ?? (
    apiOn ? [] : mockInvoices.slice(0, 6).map((inv) => ({
      id: String(inv.id), number: inv.number,
      issue_date: inv.issueDate, total: inv.total,
      remaining: inv.remaining, status: inv.status,
      client_name: mockClients.find((c) => c.id === inv.clientId)?.name ?? null,
    }))
  );

  const recentCollections: RecentCollection[] = data?.recent_collections ?? [];
  const recentPayouts: RecentPayout[]         = data?.recent_payouts      ?? [];
  const accountBalances: AccountBalance[]     = data?.account_balances     ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="نظرة عامة" description="ملخص أداء شركتك المالي" />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="إجمالي المبيعات"    value={formatCurrency(totalSales)}     icon={Wallet}             accent="primary" />
        <StatCard title="إجمالي التحصيل"     value={formatCurrency(totalPaid)}      icon={CreditCard}         accent="success" />
        <StatCard title="إجمالي المصروفات"   value={formatCurrency(totalPayouts)}   icon={ArrowUpFromLine}    accent="destructive" />
        <StatCard title="صافي التدفق النقدي" value={formatCurrency(netCash)}        icon={TrendingUp}         accent={netCash >= 0 ? 'success' : 'destructive'} />
        <StatCard title="إجمالي المتبقي"     value={formatCurrency(totalRemaining)} icon={TrendingDown}       accent="warning" />
        <StatCard title="الفواتير"           value={invoicesCount}                  icon={FileText}           accent="info" />
        <StatCard title="العملاء"            value={clientsCount}                   icon={Users}              accent="primary" />
        <StatCard title="مخزون منخفض"       value={lowStockCount}                  icon={AlertTriangle}      accent="destructive" />
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

      {/* Account balances */}
      {accountBalances.length > 0 && (
        <Card className="p-5 shadow-soft border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">أرصدة الحسابات المالية</h3>
            <Button asChild variant="ghost" size="sm"><Link to="/app/accounts">عرض الكل</Link></Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {accountBalances.map(a => (
              <div key={a.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="text-sm text-muted-foreground">{a.name}</div>
                <div className="font-bold text-lg mt-1">{formatCurrency(Number(a.balance))}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Collections & Payouts */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5 shadow-soft border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">آخر التحصيلات</h3>
            <Button asChild variant="ghost" size="sm"><Link to="/app/payments">عرض الكل</Link></Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold text-right">التاريخ</th>
                <th className="py-2 font-semibold text-right">العميل</th>
                <th className="py-2 font-semibold text-right">الحساب</th>
                <th className="py-2 font-semibold text-end">المبلغ</th>
              </tr></thead>
              <tbody>
                {recentCollections.length === 0
                  ? <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">لا توجد تحصيلات بعد</td></tr>
                  : recentCollections.map(c => (
                      <tr key={c.id} className="border-b border-border/40">
                        <td className="py-2 text-muted-foreground">{formatDateShort(c.paid_at)}</td>
                        <td className="py-2">{c.client_name ?? '—'}</td>
                        <td className="py-2 text-muted-foreground">{c.account_name}</td>
                        <td className="py-2 text-end font-semibold text-success">{formatCurrency(Number(c.amount))}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 shadow-soft border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">آخر المصروفات</h3>
            <Button asChild variant="ghost" size="sm"><Link to="/app/payouts">عرض الكل</Link></Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold text-right">التاريخ</th>
                <th className="py-2 font-semibold text-right">المورد / التصنيف</th>
                <th className="py-2 font-semibold text-right">الحساب</th>
                <th className="py-2 font-semibold text-end">المبلغ</th>
              </tr></thead>
              <tbody>
                {recentPayouts.length === 0
                  ? <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">لا توجد مصروفات بعد</td></tr>
                  : recentPayouts.map(p => (
                      <tr key={p.id} className="border-b border-border/40">
                        <td className="py-2 text-muted-foreground">{formatDateShort(p.paid_at)}</td>
                        <td className="py-2">{p.supplier_name ?? p.category_name ?? '—'}</td>
                        <td className="py-2 text-muted-foreground">{p.account_name}</td>
                        <td className="py-2 text-end font-semibold text-destructive">{formatCurrency(Number(p.amount))}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
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
              {!overviewQuery.isLoading && recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="w-10 h-10 opacity-30" />
                      <p className="text-sm">لا توجد فواتير بعد</p>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/app/invoices/new">إنشاء فاتورة</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                recentInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="py-3 font-medium"><Link to={`/app/invoices/${inv.id}`} className="text-primary">{inv.number}</Link></td>
                    <td className="py-3">{inv.client_name ?? '—'}</td>
                    <td className="py-3 text-muted-foreground">{formatDateShort(inv.issue_date)}</td>
                    <td className="py-3">{formatCurrency(Number(inv.total))}</td>
                    <td className="py-3">{formatCurrency(Number(inv.remaining))}</td>
                    <td className="py-3"><StatusBadge status={inv.status} label={invoiceStatusLabel(inv.status)} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Overview;
