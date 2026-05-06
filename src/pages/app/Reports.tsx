import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { FileText, CreditCard, TrendingDown, Wallet, Building2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const reports = [
  { id: 'invoices', icon: FileText, title: 'تقرير الفواتير', desc: 'كل الفواتير الصادرة بحسب التاريخ والحالة.' },
  { id: 'payments', icon: CreditCard, title: 'تقرير المدفوعات', desc: 'تتبع المدفوعات المسجلة على الفواتير.' },
  { id: 'remaining', icon: TrendingDown, title: 'تقرير المتبقي', desc: 'الفواتير غير المسددة كلياً أو جزئياً.' },
  { id: 'by-method', icon: Wallet, title: 'تقرير حسب وسيلة الدفع', desc: 'تجميع المدفوعات حسب طريقة السداد.' },
  { id: 'by-account', icon: Building2, title: 'تقرير حسب الحساب المالي', desc: 'حركات الإيداع لكل حساب مالي.' },
];

const Reports = () => (
  <div>
    <PageHeader title="التقارير" description="تقارير مالية واضحة لاتخاذ قرارات أفضل" />
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
  </div>
);

export default Reports;
