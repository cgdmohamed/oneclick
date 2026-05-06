import { useParams, Link } from 'react-router-dom';
import { invoices, clients, companies } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calculator, Printer, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';

const PublicInvoice = () => {
  const { publicId } = useParams();
  const invoice = invoices.find(i => i.publicId === publicId) ?? invoices[0];
  const client = clients.find(c => c.id === invoice.clientId);
  const company = companies.find(c => c.id === invoice.companyId);

  if (!invoice) return <EmptyState title="الفاتورة غير موجودة" />;

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:p-0">
      <div className="container max-w-3xl">
        <div className="flex items-center justify-between mb-6 no-print">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" /> العودة للرئيسية
          </Link>
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="h-4 w-4 ml-2" /> طباعة
          </Button>
        </div>

        <Card className="p-8 md:p-10 shadow-soft border-border/60 print:shadow-none print:border-0">
          <div className="flex items-start justify-between gap-4 pb-6 border-b border-border">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="h-10 w-10 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
                  <Calculator className="h-5 w-5" />
                </span>
                <span className="font-bold text-lg">{company?.name}</span>
              </div>
              <p className="text-sm text-muted-foreground">{company?.address}</p>
              <p className="text-sm text-muted-foreground">{company?.phone}</p>
              {company?.taxNumber && <p className="text-sm text-muted-foreground">الرقم الضريبي: {company.taxNumber}</p>}
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground">فاتورة ضريبية</div>
              <div className="font-bold text-lg">{invoice.number}</div>
              <div className="mt-2"><StatusBadge status={invoice.status} label={invoiceStatusLabel(invoice.status)} /></div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 py-6 border-b border-border text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">فاتورة إلى</div>
              <div className="font-semibold">{client?.name}</div>
              {client?.phone && <div className="text-muted-foreground">{client.phone}</div>}
              {client?.email && <div className="text-muted-foreground">{client.email}</div>}
              {client?.taxNumber && <div className="text-muted-foreground">الرقم الضريبي: {client.taxNumber}</div>}
            </div>
            <div className="sm:text-left">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">تاريخ الإصدار</div><div>{formatDate(invoice.issueDate)}</div></div>
                <div><div className="text-xs text-muted-foreground">تاريخ الاستحقاق</div><div>{formatDate(invoice.dueDate)}</div></div>
              </div>
            </div>
          </div>

          <div className="py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 font-semibold">الوصف</th>
                  <th className="py-2 font-semibold w-20">الكمية</th>
                  <th className="py-2 font-semibold w-28">سعر الوحدة</th>
                  <th className="py-2 font-semibold w-28 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map(it => (
                  <tr key={it.id} className="border-b border-border/60">
                    <td className="py-3">{it.name}</td>
                    <td className="py-3">{it.quantity}</td>
                    <td className="py-3">{formatCurrency(it.unitPrice)}</td>
                    <td className="py-3 text-left">{formatCurrency(it.quantity * it.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <Row label="المجموع الفرعي" value={formatCurrency(invoice.subtotal)} />
              <Row label="الضريبة" value={formatCurrency(invoice.tax)} />
              <div className="border-t border-border pt-2"><Row label="الإجمالي" value={formatCurrency(invoice.total)} bold /></div>
              <Row label="المدفوع" value={formatCurrency(invoice.paid)} cls="text-success" />
              <Row label="المتبقي" value={formatCurrency(invoice.remaining)} cls="text-destructive" bold />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border text-center text-xs text-muted-foreground">
            شكراً لتعاملكم معنا — تم إنشاء هذه الفاتورة عبر منصة حسابات
          </div>
        </Card>
      </div>
    </div>
  );
};

const Row = ({ label, value, bold, cls }: { label: string; value: string; bold?: boolean; cls?: string }) => (
  <div className={`flex justify-between ${bold ? 'font-bold text-base' : ''} ${cls ?? ''}`}>
    <span className="text-muted-foreground font-normal">{label}</span>
    <span>{value}</span>
  </div>
);

export default PublicInvoice;
