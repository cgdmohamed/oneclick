import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { ArrowLeft, BookOpen, FileSpreadsheet } from 'lucide-react';

const reports = [
  ['general-ledger', 'General Ledger', 'دفتر الأستاذ العام لكل القيود المرحلة.'],
  ['trial-balance', 'Trial Balance', 'إجمالي المدين والدائن ورصيد كل حساب.'],
  ['income-statement', 'Income Statement', 'الإيرادات والمصروفات وصافي الربح.'],
  ['balance-sheet', 'Balance Sheet', 'الأصول والالتزامات وحقوق الملكية.'],
  ['customer-ledger', 'Customer Ledger', 'أرصدة العملاء والفواتير والتحصيلات.'],
  ['supplier-ledger', 'Supplier Ledger', 'أرصدة الموردين والمشتريات والمدفوعات.'],
  ['vat', 'VAT Report', 'ضريبة المخرجات والمدخلات وصافي المستحق.'],
  ['inventory', 'Inventory Valuation', 'قيمة المخزون الحالية حسب المنتجات.'],
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
