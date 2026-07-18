import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { ArrowRight, FileText, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseReturn, PurchaseReturnItem } from './types';

const PurchaseReturnDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    enabled: Boolean(id),
    queryKey: ['purchase-return', id],
    queryFn: async () => (await api.get<{ data: PurchaseReturn }>(`/api/purchases/returns/${id}`)).data,
  });
  if (!data) return null;
  const post = async () => {
    try {
      await api.post(`/api/purchases/returns/${data.id}/post`, {});
      await qc.invalidateQueries({ queryKey: ['purchase-return', id] });
      await qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      toast.success('تم ترحيل المرتجع');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر ترحيل المرتجع');
    }
  };
  const cancel = async () => {
    try {
      await api.post(`/api/purchases/returns/${data.id}/cancel`, {});
      await qc.invalidateQueries({ queryKey: ['purchase-return', id] });
      await qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      toast.success('تم إلغاء المرتجع');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر إلغاء المرتجع');
    }
  };
  const columns: Column<PurchaseReturnItem>[] = [
    { key: 'product', header: 'المنتج', cell: (r) => <span className="font-medium">{r.product_name ?? r.product_id}</span> },
    { key: 'qty', header: 'الكمية', cell: (r) => Number(r.quantity).toLocaleString('ar-SA') },
    { key: 'cost', header: 'تكلفة الوحدة', cell: (r) => formatCurrency(Number(r.unit_cost)) },
    { key: 'vat', header: 'الضريبة', cell: (r) => `${Number(r.vat_rate)}%` },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.line_total)), className: 'text-end' },
  ];
  return (
    <div className="space-y-5">
      <Link to="/app/purchases/returns" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للمرتجعات</Link>
      <PageHeader
        title={`مرتجع شراء ${data.return_number}`}
        description={`${data.supplier_name ?? ''} · ${formatDateShort(data.return_date)}`}
        actions={<div className="flex gap-2 flex-wrap">
          {data.status === 'draft' && <Button onClick={post}><RotateCcw className="h-4 w-4 ml-1" /> ترحيل المرتجع</Button>}
          {data.status === 'posted' && <Button variant="outline" onClick={cancel}>إلغاء / عكس</Button>}
          {data.journal_entry_id && <Button variant="outline" onClick={() => navigate(`/app/accounting/journals/${data.journal_entry_id}`)}>عرض القيد</Button>}
        </div>}
      />
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard title="الإجمالي" value={formatCurrency(Number(data.total))} icon={FileText} accent="primary" />
        <StatCard title="قبل الضريبة" value={formatCurrency(Number(data.subtotal))} icon={Wallet} accent="info" />
        <StatCard title="ضريبة مرتجعة" value={formatCurrency(Number(data.vat_amount))} icon={Wallet} accent="warning" />
        <Card className="p-4"><div className="text-sm text-muted-foreground">الحالة</div><Badge className="mt-2">{data.status}</Badge></Card>
      </div>
      {data.original_purchase_invoice_number && (
        <Card className="p-4 text-sm">فاتورة الشراء الأصلية: <span className="font-semibold">{data.original_purchase_invoice_number}</span></Card>
      )}
      {data.notes && <Card className="p-4 text-sm">{data.notes}</Card>}
      <DataTable data={data.items ?? []} columns={columns} pageSize={0} />
    </div>
  );
};

export default PurchaseReturnDetails;
