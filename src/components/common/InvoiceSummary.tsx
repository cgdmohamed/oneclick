import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface InvoiceSummaryProps {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  className?: string;
}

export const InvoiceSummary = ({ subtotal, tax, discount, total, paid, remaining, className }: InvoiceSummaryProps) => (
  <div className={cn('rounded-xl border border-border/70 bg-card p-5 space-y-2.5 text-sm', className)}>
    <Row label="المجموع الفرعي" value={formatCurrency(subtotal)} />
    {discount > 0 && <Row label="الخصم" value={`- ${formatCurrency(discount)}`} />}
    <Row label="الضريبة" value={formatCurrency(tax)} />
    <div className="border-t border-border my-2" />
    <Row label="إجمالي الفاتورة" value={formatCurrency(total)} bold />
    <Row label="المدفوع" value={formatCurrency(paid)} className="text-success" />
    <Row label="المتبقي" value={formatCurrency(remaining)} className="text-destructive" bold />
  </div>
);

const Row = ({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) => (
  <div className={cn('flex items-center justify-between', bold && 'text-base font-semibold', className)}>
    <span className="text-muted-foreground font-normal">{label}</span>
    <span>{value}</span>
  </div>
);
