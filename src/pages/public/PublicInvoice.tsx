import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { invoices as mockInvoices, clients as mockClients, companies as mockCompanies } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calculator, Printer, ArrowRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PrintableQr } from '@/components/common/PrintableQr';
import { isQrPublicVisible } from '@/hooks/useInvoiceQr';
import { EmptyState } from '@/components/common/EmptyState';
import { API_URL, isApiConfigured } from '@/lib/api';
import type { InvoiceStatus } from '@/types';

interface PublicInvoiceData {
  id: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number | string;
  vat_amount: number | string;
  discount: number | string;
  total: number | string;
  paid: number | string;
  remaining: number | string;
  status: string;
  client_name: string;
  client_email: string | null;
  client_tax: string | null;
  company_name: string;
  company_tax: string | null;
  company_address: string | null;
  company_logo: string | null;
  company_stamp: string | null;
  currency: string | null;
  items: Array<{ id: string; name: string; quantity: number; unit_price: number | string }>;
}

const mapStatus = (s: string): InvoiceStatus =>
  s === 'paid' || s === 'partial' || s === 'overdue' ? s : 'unpaid';

const PublicInvoice = () => {
  const { publicId } = useParams();
  const [data, setData] = useState<PublicInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isApiConfigured()) {
      // Mock fallback
      const inv = mockInvoices.find((i) => i.publicId === publicId) ?? mockInvoices[0];
      const client = mockClients.find((c) => c.id === inv?.clientId);
      const company = mockCompanies.find((c) => c.id === inv?.companyId);
      if (!inv) { setNotFound(true); setLoading(false); return; }
      setData({
        id: inv.id, number: inv.number, issue_date: inv.issueDate, due_date: inv.dueDate,
        subtotal: inv.subtotal, vat_amount: inv.tax, discount: inv.discount, total: inv.total,
        paid: inv.paid, remaining: inv.remaining, status: inv.status,
        client_name: client?.name ?? '', client_email: client?.email ?? null,
        client_tax: client?.taxNumber ?? null,
        company_name: company?.name ?? '', company_tax: company?.taxNumber ?? null,
        company_address: company?.address ?? null, company_logo: null, company_stamp: null,
        currency: 'SAR',
        items: inv.items.map((it) => ({ id: it.id, name: it.name, quantity: it.quantity, unit_price: it.unitPrice })),
      });
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/invoices/${publicId}`);
        if (!res.ok) { if (!cancelled) setNotFound(true); return; }
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicId]);

  if (loading) return <div className="container py-12 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (notFound || !data) return <EmptyState title="الفاتورة غير موجودة" />;

  const num = (v: number | string) => Number(v ?? 0);

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:p-0">
      <div className="container max-w-3xl">
        <div className="flex items-center justify-between mb-6 no-print gap-2 flex-wrap">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" /> العودة للرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <Button onClick={() => window.print()} variant="outline" size="sm">
              <Printer className="h-4 w-4 ml-2" /> طباعة
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!isApiConfigured()) {
                  window.print();
                  return;
                }
                try {
                  const res = await fetch(`${API_URL}/api/public/invoices/${publicId}/pdf`);
                  if (!res.ok) throw new Error('failed');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `invoice-${data.number}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch {
                  toast.error('تعذّر تنزيل ملف PDF');
                }
              }}
            >
              <Download className="h-4 w-4 ml-2" /> تنزيل PDF
            </Button>
          </div>
        </div>

        <Card className="p-8 md:p-10 shadow-soft border-border/60 print:shadow-none print:border-0">
          <div className="flex items-start justify-between gap-4 pb-6 border-b border-border">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {data.company_logo ? (
                  <img src={data.company_logo} alt={data.company_name} className="h-10 w-10 rounded-xl object-contain" />
                ) : (
                  <span className="h-10 w-10 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
                    <Calculator className="h-5 w-5" />
                  </span>
                )}
                <span className="font-bold text-lg">{data.company_name}</span>
              </div>
              {data.company_address && <p className="text-sm text-muted-foreground">{data.company_address}</p>}
              {data.company_tax && <p className="text-sm text-muted-foreground">الرقم الضريبي: {data.company_tax}</p>}
            </div>
            <div className="text-end">
              <div className="text-xs text-muted-foreground">فاتورة ضريبية</div>
              <div className="font-bold text-lg">{data.number}</div>
              <div className="mt-2"><StatusBadge status={mapStatus(data.status)} label={invoiceStatusLabel(mapStatus(data.status))} /></div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 py-6 border-b border-border text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">فاتورة إلى</div>
              <div className="font-semibold">{data.client_name}</div>
              {data.client_email && <div className="text-muted-foreground">{data.client_email}</div>}
              {data.client_tax && <div className="text-muted-foreground">الرقم الضريبي: {data.client_tax}</div>}
            </div>
            <div className="sm:text-end">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">تاريخ الإصدار</div><div>{formatDate(data.issue_date)}</div></div>
                <div><div className="text-xs text-muted-foreground">تاريخ الاستحقاق</div><div>{formatDate(data.due_date ?? data.issue_date)}</div></div>
              </div>
            </div>
          </div>

          <div className="py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 font-semibold">الوصف</th>
                  <th className="py-2 font-semibold w-20">الكمية</th>
                  <th className="py-2 font-semibold w-28">سعر الوحدة</th>
                  <th className="py-2 font-semibold w-28 text-end">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b border-border/60">
                    <td className="py-3">{it.name}</td>
                    <td className="py-3">{it.quantity}</td>
                    <td className="py-3">{formatCurrency(num(it.unit_price))}</td>
                    <td className="py-3 text-end">{formatCurrency(it.quantity * num(it.unit_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <Row label="المجموع الفرعي" value={formatCurrency(num(data.subtotal))} />
              <Row label="الضريبة" value={formatCurrency(num(data.vat_amount))} />
              <div className="border-t border-border pt-2"><Row label="الإجمالي" value={formatCurrency(num(data.total))} bold /></div>
              <Row label="المدفوع" value={formatCurrency(num(data.paid))} cls="text-success" />
              <Row label="المتبقي" value={formatCurrency(num(data.remaining))} cls="text-destructive" bold />
            </div>
          </div>

          {isQrPublicVisible(data.id) && (
            <PrintableQr
              invoiceId={data.id}
              value={`${window.location.origin}/invoice/${publicId}`}
              invoiceNumber={data.number}
            />
          )}

          {data.company_stamp && (
            <div className="mt-8 flex justify-end">
              <img src={data.company_stamp} alt="ختم الشركة" className="h-24 opacity-80" />
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-border text-center text-xs text-muted-foreground">
            شكراً لتعاملكم معنا — تم إنشاء هذه الفاتورة عبر منصة ون كليك
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
