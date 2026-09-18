import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowRight } from 'lucide-react';
import { formatDate, invoiceStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PrintableQr } from '@/components/common/PrintableQr';
import { EmptyState } from '@/components/common/EmptyState';
import { API_URL } from '@/lib/api';
import { printElementOnly } from '@/lib/print';
import { InvoiceDocument, type InvoiceDocumentConfig } from '@/components/common/InvoiceDocument';
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
  company_phone: string | null;
  company_address: string | null;
  company_logo: string | null;
  company_stamp: string | null;
  currency: string | null;
  currency_symbol: string | null;
  qr_public_visible?: boolean | null;
  invoice_template: InvoiceDocumentConfig['template'] | null;
  invoice_accent_color: string | null;
  invoice_terms: string | null;
  invoice_footer: string | null;
  items: Array<{ id: string; name: string; quantity: number; unit_price: number | string; discount?: number | string; line_total?: number | string }>;
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
    const load = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/public/invoices/${publicId}`, { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setNotFound(true); return; }
        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
          setNotFound(false);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    void load();
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
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
            <Button onClick={printElementOnly} variant="outline" size="sm">
              <Printer className="h-4 w-4 ml-2" /> طباعة
            </Button>
          </div>
        </div>

        <div data-print-area className="print-area space-y-4">
          <InvoiceDocument
            company={{
              name: data.company_name,
              phone: data.company_phone ?? undefined,
              taxNumber: data.company_tax,
              address: data.company_address,
            }}
            cfg={{
              template: data.invoice_template ?? 'modern',
              accentColor: data.invoice_accent_color ?? '#4F46E5',
              showLogo: true,
              showTaxNumber: true,
              terms: data.invoice_terms,
              footer: data.invoice_footer,
              logoUrl: data.company_logo,
              stampUrl: data.company_stamp,
            }}
            client={{ name: data.client_name, email: data.client_email, taxNumber: data.client_tax }}
            invoiceNumber={data.number}
            issueDate={formatDate(data.issue_date)}
            dueDate={formatDate(data.due_date ?? data.issue_date)}
            statusBadge={<StatusBadge status={mapStatus(data.status)} label={invoiceStatusLabel(mapStatus(data.status))} />}
            items={data.items.map((it) => ({
              id: it.id,
              name: it.name,
              quantity: it.quantity,
              unitPrice: num(it.unit_price),
              discount: num(it.discount ?? 0),
              total: Math.max(0, it.quantity * num(it.unit_price) - num(it.discount ?? 0)),
            }))}
            totals={{ subtotal: num(data.subtotal), tax: num(data.vat_amount), total: num(data.total), paid: num(data.paid), remaining: num(data.remaining) }}
          />

          <PrintableQr
            invoiceId={data.id}
            value={`${window.location.origin}/invoice/${publicId}`}
            invoiceNumber={data.number}
            visible={data.qr_public_visible !== false}
          />
        </div>
      </div>
    </div>
  );
};

export default PublicInvoice;
