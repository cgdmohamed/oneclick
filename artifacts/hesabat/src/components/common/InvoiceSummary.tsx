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

export const InvoiceSummary = ({ subtotal, tax, discount, total, paid, remaining, className }: InvoiceSummaryProps) => {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const isPaid = remaining <= 0 && total > 0;
  const isPartial = paid > 0 && remaining > 0;
  const remainingTone = isPaid ? 'text-success' : isPartial ? 'text-warning' : 'text-destructive';
  const remainingDot = isPaid ? 'bg-success' : isPartial ? 'bg-warning' : 'bg-destructive';
  const barTone = isPaid ? 'bg-success' : isPartial ? 'bg-warning' : 'bg-destructive';

  return (
    <div className={cn('rounded-xl border border-border/70 bg-card p-5 space-y-2.5 text-sm', className)}>
      <Row label="المجموع الفرعي" value={formatCurrency(subtotal)} />
      {discount > 0 && <Row label="الخصم" value={`- ${formatCurrency(discount)}`} />}
      <Row label="الضريبة" value={formatCurrency(tax)} />
      <div className="border-t border-border my-2" />
      <Row label="إجمالي الفاتورة" value={formatCurrency(total)} bold />

      <Row
        label={<span className="inline-flex items-center gap-2"><Dot cls="bg-success" /> المدفوع</span>}
        value={formatCurrency(paid)}
        className="text-success"
      />
      <Row
        label={<span className="inline-flex items-center gap-2"><Dot cls={remainingDot} /> المتبقي</span>}
        value={formatCurrency(remaining)}
        className={remainingTone}
        bold
      />

      <div className="pt-2">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground text-end">{pct}% مدفوع</div>
      </div>
    </div>
  );
};

const Dot = ({ cls }: { cls: string }) => <span className={cn('h-1.5 w-1.5 rounded-full', cls)} />;

const Row = ({ label, value, bold, className }: { label: React.ReactNode; value: string; bold?: boolean; className?: string }) => (
  <div className={cn('flex items-center justify-between', bold && 'text-base font-semibold', className)}>
    <span className="text-muted-foreground font-normal">{label}</span>
    <span>{value}</span>
  </div>
);
