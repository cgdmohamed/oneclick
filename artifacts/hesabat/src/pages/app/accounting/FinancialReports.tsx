import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { ArrowLeft, BookOpen, Clock, FileSpreadsheet } from 'lucide-react';
import { getRecentReports, type RecentReport } from './recentReports';

const reportGroups = [
  {
    label: 'القوائم المالية',
    items: [
      ['income-statement', 'قائمة الدخل', 'الإيرادات والمصروفات وصافي الربح.'],
      ['balance-sheet', 'الميزانية / المركز المالي', 'الأصول والالتزامات وحقوق الملكية.'],
    ],
  },
  {
    label: 'دفاتر الأستاذ',
    items: [
      ['general-ledger', 'دفتر الأستاذ العام', 'دفتر الأستاذ العام لكل القيود المرحلة.'],
      ['account-statement', 'كشف حساب', 'حركة ورصيد حساب محدد من دفتر الأستاذ.'],
      ['trial-balance', 'ميزان المراجعة', 'إجمالي المدين والدائن ورصيد كل حساب.'],
      ['customer-ledger', 'دفتر أستاذ العملاء', 'أرصدة العملاء والفواتير والتحصيلات.'],
      ['ar-aging', 'أعمار الديون', 'أرصدة العملاء غير المحصلة حسب فترات التأخير.'],
      ['supplier-ledger', 'دفتر أستاذ الموردين', 'أرصدة الموردين والمشتريات والمدفوعات.'],
    ],
  },
  {
    label: 'الضرائب',
    items: [
      ['vat', 'تقرير ضريبة القيمة المضافة', 'ضريبة المخرجات والمدخلات وصافي المستحق.'],
    ],
  },
  {
    label: 'المخزون والأصول الثابتة',
    items: [
      ['inventory', 'تقييم المخزون', 'قيمة المخزون الحالية حسب المنتجات.'],
      ['fixed-asset-register', 'سجل الأصول الثابتة', 'تكلفة الأصول ومجمع الإهلاك وصافي القيمة.'],
      ['depreciation-schedule', 'جدول الإهلاك', 'تفاصيل إهلاك الأصول حسب التشغيلات.'],
      ['accumulated-depreciation', 'ملخص مجمع الإهلاك', 'ملخص مجمع الإهلاك حسب التصنيف.'],
    ],
  },
  {
    label: 'الرواتب',
    items: [
      ['payroll-summary', 'ملخص الرواتب', 'ملخص الرواتب حسب الشهر.'],
      ['payroll-by-employee', 'الرواتب حسب الموظف', 'إجمالي الرواتب والاستقطاعات حسب الموظف.'],
      ['payroll-by-dimension', 'الرواتب حسب الفرع ومركز التكلفة', 'تحليل الرواتب حسب الفرع ومركز التكلفة.'],
    ],
  },
] as const;

const ReportCard = ({ id, title, desc }: { id: string; title: string; desc: string }) => (
  <Card className="p-5 border-border/60 shadow-soft">
    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
      {id === 'general-ledger' ? <BookOpen className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
    </div>
    <h3 className="font-semibold">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    <Link to={`/app/accounting/reports/${id}`} className="inline-flex items-center gap-1 text-sm text-primary mt-4 font-medium">عرض التقرير <ArrowLeft className="h-4 w-4" /></Link>
  </Card>
);

const FinancialReports = () => {
  const [recent, setRecent] = useState<RecentReport[]>([]);

  useEffect(() => {
    setRecent(getRecentReports());
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="التقارير المالية" description="تقارير محاسبية مبنية على قيود اليومية ودفتر الأستاذ" />

      {recent.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5"><Clock className="h-4 w-4" /> شوهدت مؤخرًا</h3>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <Link key={r.id} to={`/app/accounting/reports/${r.id}`} className="text-sm rounded-full border border-border/60 bg-card px-3.5 py-1.5 hover:border-primary/50 hover:text-primary transition-colors">
                {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {reportGroups.map((group) => (
        <div key={group.label} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.items.map(([id, title, desc]) => <ReportCard key={id} id={id} title={title} desc={desc} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FinancialReports;
