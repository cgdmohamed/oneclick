import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { ArrowRight, FileText, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { CreditNote, CreditNoteItem } from './types';

const conditionLabel = (value: string) => ({
  resellable: 'صالح للبيع',
  damaged: 'تالف',
  inspection: 'تحت الفحص',
  scrap: 'خردة',
}[value] ?? value);

const CreditNoteDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: note } = useQuery({
    enabled: !!id,
    queryKey: ['credit-note', id],
    queryFn: async () => (await api.get<{ data: CreditNote }>(`/api/credit-notes/${id}`)).data,
  });

  const post = async () => {
    if (!note) return;
    try {
      await api.post(`/api/credit-notes/${note.id}/post`, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['credit-note', note.id] }),
        qc.invalidateQueries({ queryKey: ['credit-notes'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['stock-movements'] }),
      ]);
      toast.success('تم ترحيل الإشعار الدائن');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر ترحيل الإشعار');
    }
  };

  const cancel = async () => {
    if (!note) return;
    try {
      await api.post(`/api/credit-notes/${note.id}/cancel`, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['credit-note', note.id] }),
        qc.invalidateQueries({ queryKey: ['credit-notes'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['stock-movements'] }),
      ]);
      toast.success('تم إلغاء الإشعار الدائن');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر إلغاء الإشعار');
    }
  };

  if (!note) return <div className="p-6 text-muted-foreground">جار التحميل...</div>;

  const columns: Column<CreditNoteItem>[] = [
    { key: 'product', header: 'المنتج', cell: (r) => r.product_name ?? r.description },
    { key: 'description', header: 'الوصف', cell: (r) => r.description },
    { key: 'quantity', header: 'الكمية', cell: (r) => Number(r.quantity), className: 'text-end' },
    { key: 'price', header: 'سعر الوحدة', cell: (r) => formatCurrency(Number(r.unit_price)), className: 'text-end' },
    { key: 'vat', header: 'الضريبة', cell: (r) => `${Number(r.vat_rate)}%`, className: 'text-end' },
    { key: 'condition', header: 'حالة المرتجع', cell: (r) => conditionLabel(r.return_condition ?? 'resellable') },
    { key: 'stock', header: 'إرجاع للمخزون', cell: (r) => r.return_to_stock ? 'نعم' : 'لا' },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.line_total)), className: 'text-end' },
  ];

  return (
    <div className="space-y-5">
      <Link to="/app/credit-notes" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للإشعارات الدائنة</Link>
      <PageHeader
        title={`إشعار دائن ${note.credit_note_number}`}
        description={note.customer_name ?? ''}
        actions={
          <div className="flex flex-wrap gap-2">
            {note.status === 'draft' && <Button onClick={post}>ترحيل الإشعار</Button>}
            {note.status === 'posted' && <Button variant="destructive" onClick={cancel}><RotateCcw className="h-4 w-4 ml-1" /> إلغاء / عكس</Button>}
            {note.journal_entry_id && <Button variant="outline" onClick={() => navigate(`/app/accounting/journals/${note.journal_entry_id}`)}><FileText className="h-4 w-4 ml-1" /> عرض القيد</Button>}
          </div>
        }
      />
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard title="الحالة" value={note.status} icon={RotateCcw} accent="info" />
        <StatCard title="التاريخ" value={formatDateShort(note.credit_note_date)} icon={FileText} accent="primary" />
        <StatCard title="ضريبة المخرجات المعكوسة" value={formatCurrency(Number(note.vat_amount))} icon={Wallet} accent="warning" />
        <StatCard title="الإجمالي" value={formatCurrency(Number(note.total))} icon={Wallet} accent="success" />
      </div>
      <Card className="p-4 border-border/60">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground">العميل:</span> {note.customer_name ?? '—'}</div>
          <div><span className="text-muted-foreground">الفاتورة الأصلية:</span> {note.original_invoice_number ?? '—'}</div>
          <div><span className="text-muted-foreground">القيد:</span> {note.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${note.journal_entry_id}`}>عرض القيد</Link> : '—'}</div>
        </div>
        {note.notes && <p className="text-sm text-muted-foreground mt-3">{note.notes}</p>}
      </Card>
      <DataTable data={note.items ?? []} columns={columns} searchKeys={['description', 'product_name']} emptyTitle="لا توجد بنود" />
    </div>
  );
};

export default CreditNoteDetails;
