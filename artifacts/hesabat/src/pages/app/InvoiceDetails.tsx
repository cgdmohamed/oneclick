import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoices as initialInvoices, clients as mockClients, payments as initialPayments } from '@/data/mock';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InvoiceSummary } from '@/components/common/InvoiceSummary';
import { InvoiceQR } from '@/components/common/InvoiceQR';
import { PrintableQr } from '@/components/common/PrintableQr';
import { StatusBadge } from '@/components/common/StatusBadge';
import { formatCurrency, formatDate, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { PaymentForm } from '@/components/common/PaymentForm';
import { Plus, Share2, Mail, MessageCircle, Printer, Copy, Send, XCircle, RotateCcw, Paperclip, Image as ImageIcon, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Payment, PaymentSplit, Invoice, InvoiceStatus } from '@/types';
import { api, ApiError, isApiConfigured, resolveAssetUrl } from '@/lib/api';
import { useAccounts } from '@/hooks/entities';
import { printElementOnly } from '@/lib/print';

interface ApiItem { id: string; description: string; quantity: number; unit_price: string | number; discount?: string | number | null; line_total?: string | number | null; product_id: string | null }
interface ApiPayment { id: string; amount: string | number; paid_at: string; method: string; account_id: string; reference: string | null; notes: string | null }
interface ApiInvoice {
  id: string; company_id: string; client_id: string; number: string;
  public_id: string;
  issue_date: string; due_date: string | null;
  subtotal: string | number; vat_amount: string | number; discount: string | number;
  total: string | number; paid: string | number; remaining: string | number;
  status: string; notes: string | null;
  qr_public_visible?: boolean | null;
  internal_attachment_type?: 'text' | 'image' | null;
  internal_attachment_text?: string | null;
  internal_attachment_upload_id?: string | null;
  internal_attachment_filename?: string | null;
  internal_attachment_mime_type?: string | null;
  internal_attachment_url?: string | null;
  client_name: string; client_email: string | null; client_tax: string | null;
  client_phone: string | null; client_whatsapp: string | null;
  items: ApiItem[]; payments: ApiPayment[];
}

const mapStatus = (s: string): InvoiceStatus =>
  (s === 'paid' || s === 'partial' || s === 'overdue' || s === 'draft' || s === 'cancelled' || s === 'sent') ? s : 'unpaid';

const InvoiceDetails = () => {
  const { id } = useParams();
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const { list: accounts } = useAccounts();
  const navigate = useNavigate();

  const { data: apiInvoice } = useQuery({
    enabled: apiOn && !!id,
    queryKey: ['invoice', id],
    queryFn: async () => (await api.get<{ data: ApiInvoice }>(`/api/invoices/${id}`)).data,
  });

  /* --- Mock fallback derived state --- */
  const baseMockInvoice = initialInvoices.find(i => i.id === id) ?? initialInvoices[0];
  const [extraPayments, setExtraPayments] = useState<Payment[]>([]);
  const mockAllPayments = useMemo(
    () => [...initialPayments, ...extraPayments].filter(p => p.invoiceId === baseMockInvoice.id),
    [extraPayments, baseMockInvoice.id],
  );

  const [open, setOpen] = useState(false);

  /* --- Normalize for rendering --- */
  type ViewItem = { id: string; name: string; quantity: number; unitPrice: number; discount: number; netTotal: number };
  type ViewPayment = { id: string; date: string; amount: number; splits: PaymentSplit[] };
  let invoice: Invoice;
  let viewItems: ViewItem[];
  let viewPayments: ViewPayment[];
  let clientName = '';
  let clientPhone = '';
  let clientWhatsapp = '';
  let clientEmail = '';

  if (apiOn && apiInvoice) {
    const d = apiInvoice;
    invoice = {
      id: d.id, publicId: d.public_id, companyId: d.company_id, clientId: d.client_id,
      number: d.number, issueDate: d.issue_date, dueDate: d.due_date ?? d.issue_date,
      items: [], subtotal: Number(d.subtotal), tax: Number(d.vat_amount),
      discount: Number(d.discount), total: Number(d.total),
      paid: Number(d.paid), remaining: Number(d.remaining),
      status: mapStatus(d.status), notes: d.notes ?? undefined,
    };
    clientName = d.client_name;
    clientPhone = d.client_phone ?? '';
    clientWhatsapp = d.client_whatsapp ?? '';
    clientEmail = d.client_email ?? '';
    viewItems = d.items.map(it => {
      const gross = Number(it.quantity) * Number(it.unit_price);
      const itemDiscount = Number(it.discount ?? 0);
      return {
        id: it.id,
        name: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        discount: itemDiscount,
        netTotal: Math.max(0, gross - itemDiscount),
      };
    });
    viewPayments = d.payments.map(p => ({
      id: p.id, date: p.paid_at, amount: Number(p.amount),
      splits: [{ method: p.method as PaymentSplit['method'], accountId: p.account_id, amount: Number(p.amount) }],
    }));
  } else {
    invoice = baseMockInvoice;
    const mc = mockClients.find(c => c.id === invoice.clientId);
    clientName = mc?.name ?? '';
    clientPhone = mc?.phone ?? '';
    clientWhatsapp = mc?.whatsapp ?? '';
    clientEmail = mc?.email ?? '';
    viewItems = invoice.items.map(it => ({ id: it.id, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, discount: 0, netTotal: it.quantity * it.unitPrice }));
    viewPayments = mockAllPayments.map(p => ({ id: p.id, date: p.date, amount: p.amount, splits: p.splits }));
  }

  const paid = viewPayments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, +(invoice.total - paid).toFixed(2));
  const status: InvoiceStatus = remaining <= 0
    ? 'paid'
    : (paid > 0 ? 'partial' : (new Date(invoice.dueDate) < new Date() ? 'overdue' : 'unpaid'));

  const recordPayment = async (splits: PaymentSplit[], notes?: string) => {
    const amount = splits.reduce((s, x) => s + Number(x.amount || 0), 0);
    if (apiOn) {
      try {
        // Backend expects one payment per (invoice, account, amount); split into N calls
        for (const s of splits) {
          await api.post('/api/payments', {
            invoice_id: invoice.id,
            account_id: s.accountId,
            amount: s.amount,
            method: s.method,
            notes,
          });
        }
        await qc.invalidateQueries({ queryKey: ['invoice', invoice.id] });
        await qc.invalidateQueries({ queryKey: ['invoices'] });
        await qc.invalidateQueries({ queryKey: ['payments'] });
        await qc.invalidateQueries({ queryKey: ['reports-overview'] });
        toast.success('تم تسجيل التحصيل');
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر تسجيل التحصيل');
      }
      return;
    }
    const p: Payment = {
      id: `pay-${Date.now()}`, companyId: invoice.companyId, invoiceId: invoice.id,
      date: new Date().toISOString(), amount, splits, notes,
    };
    setExtraPayments(prev => [p, ...prev]);
    setOpen(false);
    toast.success('تم تسجيل التحصيل');
  };

  const publicUrl = `${window.location.origin}/invoice/${invoice.publicId}`;
  const qrPublicVisible = apiOn && apiInvoice ? apiInvoice.qr_public_visible !== false : true;

  const updateQrVisibility = async (visible: boolean) => {
    if (!apiOn) {
      toast.error('تعديل ظهور QR يتطلب الاتصال بالخادم');
      return;
    }
    try {
      await api.patch(`/api/invoices/${invoice.id}/qr-visibility`, { qr_public_visible: visible });
      await qc.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      toast.success(visible ? 'سيظهر QR في الفاتورة والطباعة' : 'تم إخفاء QR من الفاتورة والطباعة');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر تحديث ظهور QR');
    }
  };

  const sendEmail = async () => {
    if (apiOn) {
      try {
        await api.post(`/api/invoices/${invoice.id}/send-email`, {});
        toast.success('تم إرسال الفاتورة بالبريد');
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر الإرسال');
      }
      return;
    }
    toast.error('إرسال البريد يتطلب الاتصال بالخادم', {
      action: { label: 'إعداد SMTP', onClick: () => navigate('/app/settings?tab=smtp') },
    });
  };

  const waNumber = (clientWhatsapp || clientPhone).replace(/[^\d]/g, '');
  const openWhatsApp = () => {
    if (!waNumber) {
      toast.error('لا يوجد رقم واتساب لهذا العميل');
      return;
    }
    const text = encodeURIComponent(`فاتورة ${invoice.number}: ${publicUrl}`);
    window.open(`https://web.whatsapp.com/send?phone=${waNumber}&text=${text}`, '_blank', 'noopener');
  };

  const sendDraft = async () => {
    if (!apiOn) { toast.error('الإرسال يتطلب الاتصال بالخادم'); return; }
    try {
      await api.post(`/api/invoices/${invoice.id}/send`, {});
      await qc.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('تم إرسال الفاتورة');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر إرسال الفاتورة');
    }
  };

  const cancelInvoice = async () => {
    if (!apiOn) { toast.error('الإلغاء يتطلب الاتصال بالخادم'); return; }
    try {
      await api.post(`/api/invoices/${invoice.id}/cancel`, {});
      await qc.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('تم إلغاء الفاتورة');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر إلغاء الفاتورة');
    }
  };

  const rawStatus = apiOn && apiInvoice ? apiInvoice.status : invoice.status;
  const internalAttachment = apiOn && apiInvoice?.internal_attachment_type ? {
    type: apiInvoice.internal_attachment_type,
    text: apiInvoice.internal_attachment_text ?? '',
    fileName: apiInvoice.internal_attachment_filename ?? 'ملحق داخلي',
    url: apiInvoice.internal_attachment_url ?? null,
  } : null;

  const isDraft = rawStatus === 'draft';
  const isCancelled = rawStatus === 'cancelled';
  const canCancel = rawStatus === 'sent';

  return (
    <div>
      <PageHeader
        title={`فاتورة ${invoice.number}`}
        description={clientName}
        actions={
          <div className="flex gap-2 flex-wrap no-print">
            {isDraft && (
              <Button onClick={sendDraft}>
                <Send className="h-4 w-4 ml-1" /> إرسال الفاتورة
              </Button>
            )}
            {!isDraft && !isCancelled && (
              <Button variant="outline" onClick={() => navigate(`/app/credit-notes/new?invoice=${invoice.id}`)}>
                <RotateCcw className="h-4 w-4 ml-1" /> إشعار دائن
              </Button>
            )}
            {!isDraft && !isCancelled && remaining > 0 && (
              <Button variant="outline" onClick={() => navigate(`/app/accounting/bad-debts?invoice=${invoice.id}`)}>
                <XCircle className="h-4 w-4 ml-1" /> إعدام دين
              </Button>
            )}
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <XCircle className="h-4 w-4 ml-1" /> إلغاء الفاتورة
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد إلغاء الفاتورة</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم إلغاء الفاتورة واسترداد المخزون والأرصدة. هذا الإجراء لا يمكن التراجع عنه.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>رجوع</AlertDialogCancel>
                    <AlertDialogAction onClick={cancelInvoice} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      تأكيد الإلغاء
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('تم نسخ رابط المشاركة'); }}>
              <Copy className="h-4 w-4 ml-1" /> نسخ الرابط العام
            </Button>
            <Button variant="outline" asChild><Link to={`/invoice/${invoice.publicId}`} target="_blank"><Share2 className="h-4 w-4 ml-1" /> عرض عام</Link></Button>
            <Button onClick={printElementOnly}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
            {!isDraft && !isCancelled && (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button disabled={remaining <= 0}><Plus className="h-4 w-4 me-1" /> تسجيل تحصيل</Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
                  <SheetHeader><SheetTitle>تسجيل تحصيل جديد</SheetTitle></SheetHeader>
                  <div className="mt-6"><PaymentForm remaining={remaining} onSubmit={recordPayment} onCancel={() => setOpen(false)} /></div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <Card data-print-area className="lg:col-span-2 p-6 border-border/60 shadow-soft print-area">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
            <div>
              <div className="text-xs text-muted-foreground">العميل</div>
              <div className="font-semibold text-lg">{clientName}</div>
              {clientPhone && <div className="text-sm text-muted-foreground">{clientPhone}</div>}
            </div>
            <div className="text-end">
              <StatusBadge status={apiOn && apiInvoice ? rawStatus : status} label={invoiceStatusLabel(apiOn && apiInvoice ? rawStatus : status)} size="md" />
              <div className="text-xs text-muted-foreground mt-2">تاريخ الإصدار: {formatDate(invoice.issueDate)}</div>
              <div className="text-xs text-muted-foreground">تاريخ الاستحقاق: {formatDate(invoice.dueDate)}</div>
            </div>
          </div>

          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="text-start text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold">الوصف</th>
                <th className="py-2 font-semibold w-20">الكمية</th>
                <th className="py-2 font-semibold w-28">سعر الوحدة</th>
                <th className="py-2 font-semibold w-28">الخصم</th>
                <th className="py-2 font-semibold w-28 text-end">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {viewItems.map(it => (
                <tr key={it.id} className="border-b border-border/60">
                  <td className="py-3">{it.name}</td>
                  <td className="py-3">{it.quantity}</td>
                  <td className="py-3">{formatCurrency(it.unitPrice)}</td>
                  <td className="py-3">{it.discount > 0 ? formatCurrency(it.discount) : '—'}</td>
                  <td className="py-3 text-end">{formatCurrency(it.netTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="hidden print:block mt-6">
            <InvoiceSummary subtotal={invoice.subtotal} tax={invoice.tax} discount={invoice.discount} total={invoice.total} paid={paid} remaining={remaining} />
          </div>

          <PrintableQr invoiceId={invoice.id} value={publicUrl} invoiceNumber={invoice.number} visible={qrPublicVisible} />

          <div className="flex flex-wrap gap-2 mt-5 no-print">
            <Button variant="outline" size="sm" onClick={sendEmail}><Mail className="h-4 w-4 ml-1" /> إرسال عبر البريد الإلكتروني</Button>
            <Button
              size="sm"
              onClick={openWhatsApp}
              disabled={!waNumber && !apiOn}
              className="bg-[#25D366] hover:bg-[#1ebe57] text-white border-transparent"
            >
              <MessageCircle className="h-4 w-4 ml-1" /> واتساب
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          <InvoiceSummary subtotal={invoice.subtotal} tax={invoice.tax} discount={invoice.discount} total={invoice.total} paid={paid} remaining={remaining} />

          <InvoiceQR
            invoiceId={invoice.id}
            value={publicUrl}
            invoiceNumber={invoice.number}
            publicVisible={qrPublicVisible}
            onPublicVisibleChange={updateQrVisibility}
          />

          {internalAttachment && (
            <Card className="p-5 border-border/60 no-print">
              <h3 className="font-semibold mb-3 inline-flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                ملحق داخلي
              </h3>
              {internalAttachment.type === 'text' ? (
                <div className="rounded-lg bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  <FileText className="h-4 w-4 inline-block ml-1 text-muted-foreground" />
                  {internalAttachment.text}
                </div>
              ) : (
                <div className="space-y-3">
                  {internalAttachment.url && (
                    <img
                      src={resolveAssetUrl(internalAttachment.url)}
                      alt={internalAttachment.fileName}
                      className="max-h-56 w-full rounded-md border border-border object-contain bg-muted/30"
                    />
                  )}
                  <Button variant="outline" size="sm" asChild disabled={!internalAttachment.url}>
                    <a href={resolveAssetUrl(internalAttachment.url) ?? '#'} target="_blank" rel="noreferrer">
                      <ImageIcon className="h-4 w-4 ml-1" /> فتح الصورة
                    </a>
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">هذا الملحق داخلي ولا يظهر للعميل أو في الطباعة.</p>
            </Card>
          )}

          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-3">سجل المدفوعات</h3>
            {viewPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مدفوعات بعد.</p>
            ) : (
              <div className="space-y-2">
                {viewPayments.map(p => (
                  <div key={p.id} className="p-3 rounded-lg bg-muted/40 text-sm">
                    <div className="flex justify-between">
                      <span className="font-semibold">{formatCurrency(p.amount)}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.splits.map((s, i) => (
                        <span key={i}>
                          {paymentMethodLabel(s.method)} ({accounts.find(a => a.id === s.accountId)?.name ?? '—'}): {formatCurrency(s.amount)}
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
