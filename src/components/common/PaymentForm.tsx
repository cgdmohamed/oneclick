import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { accounts as mockAccounts } from '@/data/mock';
import { paymentMethodLabel, formatCurrency } from '@/lib/format';
import type { PaymentMethod, PaymentSplit } from '@/types';
import { toast } from 'sonner';

interface PaymentFormProps {
  remaining: number;
  onSubmit: (splits: PaymentSplit[], notes?: string) => void;
  onCancel?: () => void;
  companyId?: string;
}

export const PaymentForm = ({ remaining, onSubmit, onCancel, companyId = 'co-1' }: PaymentFormProps) => {
  const accountsForCompany = mockAccounts.filter(a => a.companyId === companyId && a.status === 'active');
  const [splits, setSplits] = useState<PaymentSplit[]>([
    { method: 'cash', accountId: accountsForCompany[0]?.id ?? '', amount: remaining },
  ]);
  const [notes, setNotes] = useState('');

  const total = useMemo(() => splits.reduce((s, p) => s + (Number(p.amount) || 0), 0), [splits]);

  const update = (i: number, patch: Partial<PaymentSplit>) => {
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const add = () => setSplits(prev => [...prev, { method: 'cash', accountId: accountsForCompany[0]?.id ?? '', amount: 0 }]);
  const remove = (i: number) => setSplits(prev => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    if (total <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    if (total > remaining + 0.01) return toast.error('المبلغ يتجاوز المتبقي على الفاتورة');
    if (splits.some(s => !s.accountId)) return toast.error('اختر حساباً مالياً لكل دفعة');
    onSubmit(splits, notes);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-muted/40 p-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">المتبقي على الفاتورة</span>
        <span className="font-semibold">{formatCurrency(remaining)}</span>
      </div>

      <div className="space-y-3">
        {splits.map((s, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-xl border border-border/70 bg-card">
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">طريقة الدفع</Label>
              <Select value={s.method} onValueChange={(v: PaymentMethod) => update(i, { method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{paymentMethodLabel('cash')}</SelectItem>
                  <SelectItem value="bank">{paymentMethodLabel('bank')}</SelectItem>
                  <SelectItem value="wallet">{paymentMethodLabel('wallet')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs">الحساب المالي</Label>
              <Select value={s.accountId} onValueChange={(v) => update(i, { accountId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر حساباً" /></SelectTrigger>
                <SelectContent>
                  {accountsForCompany.filter(a => a.type === s.method).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                  {accountsForCompany.filter(a => a.type === s.method).length === 0 && (
                    <SelectItem value="none" disabled>لا توجد حسابات لهذا النوع</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-10 md:col-span-2">
              <Label className="text-xs">المبلغ</Label>
              <Input type="number" min={0} value={s.amount} onChange={(e) => update(i, { amount: Number(e.target.value) })} />
            </div>
            <div className="col-span-2 md:col-span-1 flex justify-end">
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={splits.length === 1}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 ml-1" /> إضافة طريقة دفع أخرى
        </Button>
      </div>

      <div>
        <Label className="text-xs">ملاحظات (اختياري)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مرجع التحويل أو ملاحظة..." />
      </div>

      <div className="flex items-center justify-between rounded-xl bg-primary/5 p-4">
        <span className="text-sm text-muted-foreground">إجمالي الدفعة</span>
        <span className="font-bold text-lg">{formatCurrency(total)}</span>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && <Button variant="outline" onClick={onCancel}>إلغاء</Button>}
        <Button onClick={submit}>تأكيد الدفعة</Button>
      </div>
    </div>
  );
};
