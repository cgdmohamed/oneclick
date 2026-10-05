import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/format';
import { ArrowRight, FileText, Wallet } from 'lucide-react';
import type { PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment, PurchaseReturn } from './types';

const PurchaseInvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useQuery({
    enabled: Boolean(id),
    queryKey: ['purchase-invoice', id],
    queryFn: async () => (await api.get<{ data: PurchaseInvoice }>(`/api/purchases/invoices/${id}`)).data,
  });
  if (!data) return null;
  const columns: Column<PurchaseInvoiceItem>[] = [
    { key: 'description', header: 'البند', cell: (r) => <span className="font-medium">{r.description}</span> },
    { key: 'qty', header: 'الكمية', cell: (r) => Number(r.quantity).toLocaleString('ar-SA') },
    { key: 'cost', header: 'تكلفة الوحدة', cell: (r) => formatCurrency(Number(r.unit_cost)) },
    { key: 'vat', header: 'الضريبة', cell: (r) => `${Number(r.vat_rate)}%` },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.line_total)), className: 'text-end' },
  ];

  // Same pattern as the sales invoice detail (InvoiceDetails.tsx), which
  // already shows its invoice's `payments` — this was missing here: the
  // aggregate paid/remaining was shown, but not which specific payments or
  // purchase returns produced it.
  const paymentCols: Column<SupplierPayment>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.paid_at)}</span> },
    { key: 'amount', header: 'المبلغ', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
    { key: 'method', header: 'الطريقة', cell: (r) => paymentMethodLabel(r.method) },
    { key: 'account', header: 'الحساب', cell: (r) => r.account_name ?? '—' },
    { key: 'reference', header: 'المرجع', cell: (r) => r.reference ?? <span className="text-muted-foreground">—</span> },
  ];

  const returnCols: Column<PurchaseReturn>[] = [
    { key: 'return_number', header: 'رقم المرتجع', cell: (r) => <span className="font-medium">{r.return_number}</span> },
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.return_date)}</span> },
    { key: 'total', header: 'الإجمالي', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.total))}</span> },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge variant={r.status === 'posted' ? 'default' : 'secondary'}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-5">
      <Link to="/app/purchases/invoices" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة لفواتير الشراء</Link>
      <PageHeader
        title={`فاتورة شراء ${data.number}`}
        description={`${data.supplier_name ?? ''} · ${formatDateShort(data.invoice_date)}`}
        actions={<div className="flex gap-2 flex-wrap">
          <button className="text-sm text-primary" onClick={() => navigate('/app/purchases/returns/new')}>إنشاء مرتجع</button>
          {data.journal_entry_id && <Link className="text-sm text-primary" to={`/app/accounting/journals/${data.journal_entry_id}`}>عرض القيد</Link>}
        </div>}
      />
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard title="الإجمالي" value={formatCurrency(Number(data.total))} icon={FileText} accent="primary" />
        <StatCard title="المدفوع" value={formatCurrency(Number(data.paid))} icon={Wallet} accent="success" />
        <StatCard title="المتبقي" value={formatCurrency(Number(data.remaining))} icon={Wallet} accent="warning" />
        <Card className="p-4"><div className="text-sm text-muted-foreground">الحالة</div><Badge className="mt-2">{data.status}</Badge></Card>
      </div>
      {data.notes && <Card className="p-4 text-sm">{data.notes}</Card>}
      <DataTable data={data.items ?? []} columns={columns} pageSize={0} />

      <div>
        <h3 className="font-semibold mb-2">الدفعات المسجّلة على هذه الفاتورة</h3>
        {(data.payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد دفعات مسجّلة على هذه الفاتورة بعد.</p>
        ) : (
          <DataTable data={data.payments ?? []} columns={paymentCols} pageSize={0} />
        )}
      </div>

      <div>
        <h3 className="font-semibold mb-2">مرتجعات الشراء لهذه الفاتورة</h3>
        {(data.purchase_returns ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مرتجعات مرحّلة لهذه الفاتورة.</p>
        ) : (
          <DataTable data={data.purchase_returns ?? []} columns={returnCols} pageSize={0} />
        )}
      </div>
    </div>
  );
};

export default PurchaseInvoiceDetails;
