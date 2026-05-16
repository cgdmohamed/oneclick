import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { getCurrencySymbol } from '@/lib/currency';
import type { Plan } from '@/types';

interface PlanCardProps {
  plan: Plan;
  yearly: boolean;
  cta?: string;
  onSelect?: () => void;
}

export const PlanCard = ({ plan, yearly, cta = 'اختر الباقة', onSelect }: PlanCardProps) => {
  const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
  return (
    <Card className={cn(
      'relative p-7 flex flex-col gap-5 border shadow-soft',
      plan.popular && 'border-primary ring-1 ring-primary shadow-elev'
    )}>
      {plan.popular && (
        <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
          الأكثر شيوعاً
        </div>
      )}
      <div>
        <h3 className="text-xl font-bold">{plan.name}</h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight">{formatCurrency(price, '')}</span>
          <span className="text-muted-foreground text-sm">{getCurrencySymbol()} / {yearly ? 'سنة' : 'شهر'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Limit label="مستخدمين" value={plan.limits.users} />
        <Limit label="فاتورة" value={plan.limits.invoices} />
        <Limit label="منتج" value={plan.limits.products} />
        <Limit label="تقرير" value={plan.limits.reports} />
      </div>
      <ul className="space-y-2.5 text-sm flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 h-5 w-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
              <Check className="h-3 w-3" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button onClick={onSelect} variant={plan.popular ? 'default' : 'outline'} className="w-full">
        {cta}
      </Button>
    </Card>
  );
};

const Limit = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-muted/50 px-3 py-2">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-semibold">{value.toLocaleString('en-US')}</div>
  </div>
);
