import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { FileText, CreditCard, TrendingDown, Wallet, Building2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInvoices, useAccounts } from '@/hooks/entities';
import { payments as mockPayments } from '@/data/mock';
import { InvoicesCharts, PaymentsCharts } from '@/components/common/ReportCharts';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, isApiConfigured } from '@/lib/api';

const reports = [
  { id: 'invoices', icon: FileText, title: 'تقرير الفواتير', desc: 'كل الفواتير الصادرة بحسب التاريخ والحالة.' },
  { id: 'payments', icon: CreditCard, title: 'تقرير المدفوعات', desc: 'تتبع المدفوعات المسجلة على الفواتير.' },
  { id: 'remaining', icon: TrendingDown, title: 'تقرير المتبقي', desc: 'الفواتير غير المسددة كلياً أو جزئياً.' },
  { id: 'by-method', icon: Wallet, title: 'تقرير حسب وسيلة الدفع', desc: 'تجميع المدفوعات حسب طريقة السداد.' },
  { id: 'by-account', icon: Building2, title: 'تقرير حسب الحساب المالي', desc: 'حركات الإيداع لكل حساب مالي.' },
];

interface FlatPayment {
  id: string; date: string; invoiceId: string;
  method: string; accountId: string; amount: number;
}

const Reports = () => {
  const { list: invoices } = useInvoices();
  const { list: accounts } = useAccounts();
  const apiOn = isApiConfigured();

  const paymentsQuery = useQuery({
    enabled: apiOn,
    queryKey: ['payments-flat'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        id: string; invoice_id: string; account_id: string;
        amount: string | number; method: string; paid_at: string;
      }> }>('/api/payments');
      return res.data.map<FlatPayment>((p) => ({
        id: p.id, date: p.paid_at, invoiceId: p.invoice_id,
        method: p.method, accountId: p.account_id, amount: Number(p.amount),
      }));
    },
  });

  const flatPayments = useMemo<FlatPayment[]>(() => {
    if (apiOn) return paymentsQuery.data ?? [];
    return mockPayments.flatMap((p) =>
      p.splits.map((s) => ({
        id: `${p.id}-${s.method}-${s.accountId}`,
        date: p.date, invoiceId: p.invoiceId,
        method: s.method, accountId: s.accountId, amount: s.amount,
      })),
    );
  }, [apiOn, paymentsQuery.data]);

  return (
    <div>
      <PageHeader title="التقارير" description="تقارير مالية واضحة لاتخاذ قرارات أفضل" />

      <InvoicesCharts invoices={invoices} />
      <PaymentsCharts payments={flatPayments} />

      <h3 className="text-sm font-semibold text-muted-foreground mt-6 mb-3">التقارير التفصيلية</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(r => (
          <Card key={r.id} className="p-5 border-border/60 shadow-soft hover:shadow-elev transition-shadow">
            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3"><r.icon className="h-5 w-5" /></div>
            <h3 className="font-semibold">{r.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{r.desc}</p>
            <Link to={`/app/reports/${r.id}`} className="inline-flex items-center gap-1 text-sm text-primary mt-4 font-medium">
              عرض التقرير <ArrowLeft className="h-4 w-4" />
            </Link>
          </Card>
        ))}
      </div>
      {accounts.length === 0 && null}
    </div>
  );
};

export default Reports;
