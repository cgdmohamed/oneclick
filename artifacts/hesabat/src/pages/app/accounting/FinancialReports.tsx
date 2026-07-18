import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { ArrowLeft, BookOpen, FileSpreadsheet } from 'lucide-react';

const reports = [
  ['general-ledger', 'دفتر الأستاذ العام', 'دفتر الأستاذ العام لكل القيود المرحلة.'],
  ['account-statement', 'كشف حساب', 'حركة ورصيد حساب محدد من دفتر الأستاذ.'],
  ['trial-balance', 'ميزان المراجعة', 'إجمالي المدين والدائن ورصيد كل حساب.'],
  ['income-statement', 'قائمة الدخل', 'الإيرادات والمصروفات وصافي الربح.'],
  ['balance-sheet', 'الميزانية / المركز المالي', 'الأصول والالتزامات وحقوق الملكية.'],
  ['customer-ledger', 'دفتر أستاذ العملاء', 'أرصدة العملاء والفواتير والتحصيلات.'],
  ['ar-aging', 'أعمار الديون', 'أرصدة العملاء غير المحصلة حسب فترات التأخير.'],
  ['supplier-ledger', 'دفتر أستاذ الموردين', 'أرصدة الموردين والمشتريات والمدفوعات.'],
  ['vat', 'تقرير ضريبة القيمة المضافة', 'ضريبة المخرجات والمدخلات وصافي المستحق.'],
  ['inventory', 'تقييم المخزون', 'قيمة المخزون الحالية حسب المنتجات.'],
  ['fixed-asset-register', 'سجل الأصول الثابتة', 'تكلفة الأصول ومجمع الإهلاك وصافي القيمة.'],
  ['depreciation-schedule', 'جدول الإهلاك', 'تفاصيل إهلاك الأصول حسب التشغيلات.'],
  ['accumulated-depreciation', 'ملخص مجمع الإهلاك', 'ملخص مجمع الإهلاك حسب التصنيف.'],
  ['payroll-summary', 'ملخص الرواتب', 'ملخص الرواتب حسب الشهر.'],
  ['payroll-by-employee', 'الرواتب حسب الموظف', 'إجمالي الرواتب والاستقطاعات حسب الموظف.'],
  ['payroll-by-dimension', 'الرواتب حسب الفرع ومركز التكلفة', 'تحليل الرواتب حسب الفرع ومركز التكلفة.'],
] as const;

const FinancialReports = () => (
  <div className="space-y-5">
    <PageHeader title="التقارير المالية" description="تقارير محاسبية مبنية على قيود اليومية ودفتر الأستاذ" />
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {reports.map(([id, title, desc]) => (
        <Card key={id} className="p-5 border-border/60 shadow-soft">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
            {id === 'general-ledger' ? <BookOpen className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
          </div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{desc}</p>
          <Link to={`/app/accounting/reports/${id}`} className="inline-flex items-center gap-1 text-sm text-primary mt-4 font-medium">عرض التقرير <ArrowLeft className="h-4 w-4" /></Link>
        </Card>
      ))}
    </div>
  </div>
);

export default FinancialReports;
