import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoices as initialInvoices, clients, payments as initialPayments, accounts } from '@/data/mock';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InvoiceSummary } from '@/components/common/InvoiceSummary';
import { StatusBadge } from '@/components/common/StatusBadge';
import { formatCurrency, formatDate, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PaymentForm } from '@/components/common/PaymentForm';
import { Plus, Share2, Mail, MessageCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { Payment } from '@/types';

const InvoiceDetails = () => {
  const { id } = useParams();
  const baseInvoice = initialInvoices.find(i => i.id === id) ?? initialInvoices[0];
  const [extraPayments, setExtraPayments] = useState<Payment[]>([]);
  const allPayments = useMemo(() => [...initialPayments, ...extraPayments].filter(p => p.invoiceId === baseInvoice.id), [extraPayments, baseInvoice.id]);
  const paid = allPayments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, +(baseInvoice.total - paid).toFixed(2));
  const status = remaining <= 0 ? 'paid' : (paid > 0 ? 'partial' : (new Date(baseInvoice.dueDate) < new Date() ? 'overdue' : 'unpaid'));
  const client = clients.find(c => c.id === baseInvoice.clientId);
  const [open, setOpen] = useState(false);

  const recordPayment = (splits: any[], notes?: string) => {
    const amount = splits.reduce((s, x) => s + Number(x.amount || 0), 0);
    const p: Payment = { id: `pay-${Date.now()}`, companyId: baseInvoice.companyId, invoiceId: baseInvoice.id, date: new Date().toISOString(), amount, splits, notes };
    setExtraPayments(prev => [p, ...prev]);
    setOpen(false);
    toast.success('تم تسجيل الدفعة');
  };

  const publicUrl = `${window.location.origin}/invoice/${baseInvoice.publicId}`;

  return (
    <div>
      <PageHeader
        title={`فاتورة ${baseInvoice.number}`}
        description={client?.name}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('تم نسخ رابط المشاركة'); }}>
              <Share2 className="h-4 w-4 ml-1" /> نسخ الرابط العام
            </Button>
            <Button variant="outline" asChild><Link to={`/invoice/${baseInvoice.publicId}`} target="_blank"><Printer className="h-4 w-4 ml-1" /> عرض/طباعة</Link></Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button disabled={remaining <= 0}><Plus className="h-4 w-4 ml-1" /> تسجيل دفعة</Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader><SheetTitle>تسجيل دفعة جديدة</SheetTitle></SheetHeader>
                <div className="mt-6"><PaymentForm remaining={remaining} onSubmit={recordPayment} onCancel={() => setOpen(false)} /></div>
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-6 border-border/60 shadow-soft">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
            <div>
              <div className="text-xs text-muted-foreground">العميل</div>
              <div className="font-semibold text-lg">{client?.name}</div>
              <div className="text-sm text-muted-foreground">{client?.phone}</div>
            </div>
            <div className="text-left">
              <StatusBadge status={status} label={invoiceStatusLabel(status)} />
              <div className="text-xs text-muted-foreground mt-2">تاريخ الإصدار: {formatDate(baseInvoice.issueDate)}</div>
              <div className="text-xs text-muted-foreground">تاريخ الاستحقاق: {formatDate(baseInvoice.dueDate)}</div>
            </div>
          </div>

          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="text-right text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold">الوصف</th>
                <th className="py-2 font-semibold w-20">الكمية</th>
                <th className="py-2 font-semibold w-28">سعر الوحدة</th>
                <th className="py-2 font-semibold w-28 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {baseInvoice.items.map(it => (
                <tr key={it.id} className="border-b border-border/60">
                  <td className="py-3">{it.name}</td>
                  <td className="py-3">{it.quantity}</td>
                  <td className="py-3">{formatCurrency(it.unitPrice)}</td>
                  <td className="py-3 text-left">{formatCurrency(it.quantity * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => toast.message('إرسال عبر البريد (placeholder)')}><Mail className="h-4 w-4 ml-1" /> إرسال بريد</Button>
            <Button variant="outline" size="sm" onClick={() => toast.message('إرسال عبر واتساب (placeholder)')}><MessageCircle className="h-4 w-4 ml-1" /> واتساب</Button>
          </div>
        </Card>

        <div className="space-y-5">
          <InvoiceSummary subtotal={baseInvoice.subtotal} tax={baseInvoice.tax} discount={baseInvoice.discount} total={baseInvoice.total} paid={paid} remaining={remaining} />

          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-3">سجل المدفوعات</h3>
            {allPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مدفوعات بعد.</p>
            ) : (
              <div className="space-y-2">
                {allPayments.map(p => (
                  <div key={p.id} className="p-3 rounded-lg bg-muted/40 text-sm">
                    <div className="flex justify-between">
                      <span className="font-semibold">{formatCurrency(p.amount)}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.splits.map((s, i) => (
                        <span key={i}>
                          {paymentMethodLabel(s.method)} ({accounts.find(a => a.id === s.accountId)?.name}): {formatCurrency(s.amount)}
                          {i < p.splits.length - 1 ? ' • ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-2">رابط المشاركة العام</h3>
            <p className="text-xs text-muted-foreground break-all bg-muted/40 p-2 rounded">{publicUrl}</p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetails;
