import { useParams, useNavigate, Link } from 'react-router-dom';
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
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';

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
}

interface StatementData {
  supplier: SupplierInfo;
  products: ProductRow[];
  payouts: PayoutRow[];
  total_payouts: string;
  last_payout: string | null;
}

const SupplierDetail = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supplier-statement', id],
    queryFn: async () => {
      const res = await api.get<{ data: StatementData }>(`/api/suppliers/${id}/statement`);
      return res.data;
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

  const { supplier, products, payouts, total_payouts, last_payout } = data;

  const productCols: Column<ProductRow>[] = [
    { key: 'name', header: 'المنتج', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'sku', header: 'SKU', cell: (r) => r.sku ?? <span className="text-muted-foreground">—</span> },
    { key: 'price', header: 'السعر', cell: (r) => formatCurrency(Number(r.price)) },
    { key: 'qty', header: 'الكمية', cell: (r) => <span className="font-semibold">{r.quantity} {r.unit}</span> },
  ];

  const payoutCols: Column<PayoutRow>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.paid_at)}</span> },
    { key: 'amount', header: 'المبلغ', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
    { key: 'method', header: 'الطريقة', cell: (r) => paymentMethodLabel(r.method) },
    { key: 'account', header: 'الحساب', cell: (r) => r.account_name },
    { key: 'category', header: 'التصنيف', cell: (r) => r.category_name ?? <span className="text-muted-foreground">—</span> },
    { key: 'ref', header: 'المرجع', cell: (r) => r.reference ?? <span className="text-muted-foreground">—</span> },
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
        <StatCard title="إجمالي المصروفات" value={formatCurrency(Number(total_payouts))} icon={Wallet} accent="destructive" />
        <StatCard title="عدد المنتجات" value={products.length} icon={Package} accent="primary" />
        <StatCard title="عدد المدفوعات" value={payouts.length} icon={ReceiptText} accent="info" />
        <StatCard title="آخر دفعة" value={last_payout ? formatDateShort(last_payout) : '—'} icon={FileText} accent="warning" />
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
          <Tabs defaultValue="products" dir="rtl">
            <TabsList>
              <TabsTrigger value="products">المنتجات ({products.length})</TabsTrigger>
              <TabsTrigger value="payouts">المدفوعات ({payouts.length})</TabsTrigger>
              <TabsTrigger value="statement">كشف الحساب</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="mt-4">
              <DataTable data={products} columns={productCols} />
            </TabsContent>

            <TabsContent value="payouts" className="mt-4">
              <DataTable data={payoutCols && payouts} columns={payoutCols} />
            </TabsContent>

            <TabsContent value="statement" className="mt-4">
              <Card className="p-5 border-border/60 shadow-soft space-y-4">
                <h3 className="font-semibold">ملخص حساب المورد</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border/60">
                    <span className="text-sm text-muted-foreground">إجمالي المدفوعات للمورد</span>
                    <span className="font-semibold">{formatCurrency(Number(total_payouts))}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/60">
                    <span className="text-sm text-muted-foreground">عدد المنتجات المرتبطة</span>
                    <span className="font-semibold">{products.length}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/60">
                    <span className="text-sm text-muted-foreground">عدد دفعات المصروفات</span>
                    <span className="font-semibold">{payouts.length}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">آخر دفعة</span>
                    <span className="font-semibold">{last_payout ? formatDateShort(last_payout) : '—'}</span>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default SupplierDetail;
