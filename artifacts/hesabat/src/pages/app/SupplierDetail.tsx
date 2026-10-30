import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Truck, Phone, Mail, MapPin, Package, Wallet, FileText, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort, paymentMethodLabel, invoiceStatusLabel } from '@/lib/format';

interface LedgerStatementLine {
  entry_date: string;
  memo: string | null;
  description: string | null;
  reference: string | null;
  debit: string;
  credit: string;
  running_balance: string;
}

interface SupplierInfo {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  price: string | number;
  quantity: number;
  unit: string;
}

interface PayoutRow {
  id: string;
  amount: string | number;
  method: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  account_name: string;
  category_name: string | null;
  source: 'payout' | 'supplier_payment';
  purchase_invoice_number: string | null;
}

interface PurchaseInvoiceRow {
  id: string;
  number: string;
  invoice_date: string;
  total: string | number;
  paid: string | number;
  remaining: string | number;
  status: string;
}

interface PurchaseReturnRow {
  id: string;
  return_number: string;
  return_date: string;
  subtotal: string | number;
  vat_amount: string | number;
  total: string | number;
  status: string;
  purchase_invoice_number: string | null;
}

interface StatementData {
  supplier: SupplierInfo;
  products: ProductRow[];
  invoices: PurchaseInvoiceRow[];
  purchase_returns: PurchaseReturnRow[];
  payouts: PayoutRow[];
  payments: PayoutRow[];
  total_purchases: string;
  total_payouts: string;
  outstanding_balance: string;
  last_payout: string | null;
}

const SupplierDetail = () => {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supplier-statement', id],
    queryFn: async () => {
      const res = await api.get<{ data: StatementData }>(`/api/suppliers/${id}/statement`);
      return res.data;
    },
    enabled: Boolean(id),
  });

  // Line-by-line debit/credit statement sourced directly from the general
  // ledger (journal_entry_lines) — every posted line against this
  // supplier's AP account, with a running balance. The "statement" tab
  // above is just a 4-row document-total summary; this is the actual GL
  // ledger view.
  const ledgerQuery = useQuery({
    queryKey: ['supplier-ledger-statement', id],
    queryFn: async () => {
      const res = await api.get<{ data: LedgerStatementLine[]; summary: { closing_balance: string } }>(
        `/api/reports/supplier-ledger-detail?supplier_id=${encodeURIComponent(id)}`,
      );
      return res;
    },
    enabled: Boolean(id),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>;
  if (isError || !data) return (
    <div>
      <PageHeader title="المورد غير موجود" description="ربما تم حذفه أو أن الرابط غير صحيح." />
      <Button variant="outline" onClick={() => navigate('/app/suppliers')}><ArrowRight className="h-4 w-4 ml-1" /> العودة</Button>
    </div>
  );

  const { supplier, products, invoices, purchase_returns, payments, total_purchases, total_payouts, outstanding_balance, last_payout } = data;

  const productCols: Column<ProductRow>[] = [
    { key: 'name', header: 'المنتج', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'sku', header: 'SKU', cell: (r) => r.sku ?? <span className="text-muted-foreground">—</span> },
    { key: 'price', header: 'السعر', cell: (r) => formatCurrency(Number(r.price)) },
    { key: 'qty', header: 'الكمية', cell: (r) => <span className="font-semibold">{r.quantity} {r.unit}</span> },
  ];

  const invoiceCols: Column<PurchaseInvoiceRow>[] = [
    { key: 'number', header: 'رقم الفاتورة', cell: (r) => <span className="font-medium">{r.number}</span> },
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.invoice_date)}</span> },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.total)) },
    { key: 'paid', header: 'المدفوع', cell: (r) => formatCurrency(Number(r.paid)) },
    { key: 'remaining', header: 'المتبقي', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.remaining))}</span> },
    { key: 'status', header: 'الحالة', cell: (r) => invoiceStatusLabel(r.status) },
  ];

  const returnCols: Column<PurchaseReturnRow>[] = [
    { key: 'return_number', header: 'رقم المرتجع', cell: (r) => <span className="font-medium">{r.return_number}</span> },
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.return_date)}</span> },
    { key: 'invoice', header: 'فاتورة الشراء الأصلية', cell: (r) => r.purchase_invoice_number ?? <span className="text-muted-foreground">—</span> },
    { key: 'total', header: 'الإجمالي', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.total))}</span> },
  ];

  const payoutCols: Column<PayoutRow>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.paid_at)}</span> },
    { key: 'amount', header: 'المبلغ', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
    { key: 'source', header: 'النوع', cell: (r) => (
      <Badge variant="outline">{r.source === 'supplier_payment' ? 'دفعة فاتورة شراء' : 'مصروف/مدفوعات عامة'}</Badge>
    ) },
    { key: 'method', header: 'الطريقة', cell: (r) => paymentMethodLabel(r.method) },
    { key: 'account', header: 'الحساب', cell: (r) => r.account_name },
    { key: 'ref_or_category', header: 'المرجع/التصنيف', cell: (r) => (
      r.purchase_invoice_number
        ? <span>فاتورة {r.purchase_invoice_number}</span>
        : (r.category_name ?? r.reference ?? <span className="text-muted-foreground">—</span>)
    ) },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link to="/app/suppliers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
          <ArrowRight className="h-4 w-4" /> الموردون
        </Link>
        <PageHeader
          title={supplier.name}
          description={supplier.is_active ? 'مورد نشط' : 'مورد غير نشط'}
          actions={
            <Badge variant={supplier.is_active ? 'default' : 'secondary'}>
              {supplier.is_active ? 'نشط' : 'غير نشط'}
            </Badge>
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="المتبقي للمورد" value={formatCurrency(Number(outstanding_balance))} icon={Wallet} accent={Number(outstanding_balance) > 0 ? 'destructive' : 'primary'} />
        <StatCard title="إجمالي المشتريات" value={formatCurrency(Number(total_purchases))} icon={FileText} accent="info" />
        <StatCard title="إجمالي المدفوعات" value={formatCurrency(Number(total_payouts))} icon={ReceiptText} accent="primary" />
        <StatCard title="آخر دفعة" value={last_payout ? formatDateShort(last_payout) : '—'} icon={Package} accent="warning" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-5 border-border/60 shadow-soft space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> بيانات المورد</h3>
          {supplier.phone && <p className="text-sm flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{supplier.phone}</p>}
          {supplier.email && <p className="text-sm flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{supplier.email}</p>}
          {supplier.address && <p className="text-sm flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{supplier.address}</p>}
          {supplier.tax_number && <p className="text-sm text-muted-foreground">الرقم الضريبي: {supplier.tax_number}</p>}
          {supplier.notes && <p className="text-sm text-muted-foreground border-t border-border pt-2">{supplier.notes}</p>}
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue={searchParams.get('tab') === 'ledger' ? 'ledger' : 'statement'} dir="rtl">
            <TabsList>
              <TabsTrigger value="statement">ملخص الحساب</TabsTrigger>
              <TabsTrigger value="ledger">كشف الحساب (دفتر الأستاذ)</TabsTrigger>
              <TabsTrigger value="invoices">فواتير الشراء ({invoices.length})</TabsTrigger>
              <TabsTrigger value="returns">مرتجعات الشراء ({purchase_returns.length})</TabsTrigger>
              <TabsTrigger value="payouts">المدفوعات ({payments.length})</TabsTrigger>
              <TabsTrigger value="products">المنتجات ({products.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="statement" className="mt-4">
              <Card className="p-5 border-border/60 shadow-soft space-y-4">
                <h3 className="font-semibold">ملخص حساب المورد</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border/60">
                    <span className="text-sm text-muted-foreground">إجمالي فواتير الشراء</span>
                    <span className="font-semibold">{formatCurrency(Number(total_purchases))}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/60">
                    <span className="text-sm text-muted-foreground">إجمالي المدفوعات للمورد</span>
                    <span className="font-semibold">{formatCurrency(Number(total_payouts))}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/60">
                    <span className="text-sm text-muted-foreground">المتبقي المستحق للمورد</span>
                    <span className="font-semibold">{formatCurrency(Number(outstanding_balance))}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">آخر دفعة</span>
                    <span className="font-semibold">{last_payout ? formatDateShort(last_payout) : '—'}</span>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="ledger" className="mt-4 space-y-3">
              <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  كشف حساب مباشر من دفتر الأستاذ — كل قيد مرحّل يخص حساب المورد بالمدين والدائن والرصيد التراكمي.
                </p>
                {ledgerQuery.data?.summary && (
                  <div className="text-end">
                    <p className="text-xs text-muted-foreground mb-0.5">الرصيد الحالي</p>
                    <p className="text-lg font-bold">{formatCurrency(Number(ledgerQuery.data.summary.closing_balance))}</p>
                  </div>
                )}
              </Card>
              {ledgerQuery.isLoading ? (
                <Card className="p-10 text-center text-muted-foreground border-dashed">جارٍ التحميل…</Card>
              ) : !ledgerQuery.data?.data.length ? (
                <Card className="p-10 text-center text-muted-foreground border-dashed">لا توجد قيود مرحّلة بعد.</Card>
              ) : (
                <Card className="border-border/60 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="text-start p-3 font-medium">التاريخ</th>
                        <th className="text-start p-3 font-medium">البيان</th>
                        <th className="text-start p-3 font-medium">المرجع</th>
                        <th className="text-end p-3 font-medium">مدين</th>
                        <th className="text-end p-3 font-medium">دائن</th>
                        <th className="text-end p-3 font-medium">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerQuery.data.data.map((l, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="p-3">{formatDateShort(l.entry_date)}</td>
                          <td className="p-3">{l.description || l.memo || '—'}</td>
                          <td className="p-3">{l.reference || '—'}</td>
                          <td className="p-3 text-end">{Number(l.debit) > 0 ? formatCurrency(Number(l.debit)) : '—'}</td>
                          <td className="p-3 text-end">{Number(l.credit) > 0 ? formatCurrency(Number(l.credit)) : '—'}</td>
                          <td className="p-3 text-end font-medium">{formatCurrency(Number(l.running_balance))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="invoices" className="mt-4">
              <DataTable data={invoices} columns={invoiceCols} />
            </TabsContent>

            <TabsContent value="returns" className="mt-4">
              <DataTable data={purchase_returns} columns={returnCols} />
            </TabsContent>

            <TabsContent value="payouts" className="mt-4">
              <DataTable data={payments} columns={payoutCols} />
            </TabsContent>

            <TabsContent value="products" className="mt-4">
              <DataTable data={products} columns={productCols} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default SupplierDetail;
