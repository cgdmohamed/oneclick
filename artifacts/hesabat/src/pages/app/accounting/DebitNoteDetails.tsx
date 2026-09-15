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
import { ArrowRight, ArrowUpFromLine, FileText, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { DebitNote, DebitNoteItem } from './types';

const DebitNoteDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: note } = useQuery({
    enabled: !!id,
    queryKey: ['debit-note', id],
    queryFn: async () => (await api.get<{ data: DebitNote }>(`/api/debit-notes/${id}`)).data,
  });

  const post = async () => {
    if (!note) return;
    try {
      await api.post(`/api/debit-notes/${note.id}/post`, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['debit-note', note.id] }),
        qc.invalidateQueries({ queryKey: ['debit-notes'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
      toast.success('تم ترحيل الإشعار المدين');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر ترحيل الإشعار');
    }
  };

  const cancel = async () => {
    if (!note) return;
    try {
      await api.post(`/api/debit-notes/${note.id}/cancel`, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['debit-note', note.id] }),
        qc.invalidateQueries({ queryKey: ['debit-notes'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
      toast.success('تم إلغاء الإشعار المدين');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر إلغاء الإشعار');
    }
  };

  if (!note) return <div className="p-6 text-muted-foreground">جار التحميل...</div>;

  const columns: Column<DebitNoteItem>[] = [
    { key: 'product', header: 'المنتج', cell: (r) => r.product_name ?? r.description },
    { key: 'description', header: 'الوصف', cell: (r) => r.description },
    { key: 'quantity', header: 'الكمية', cell: (r) => Number(r.quantity), className: 'text-end' },
    { key: 'price', header: 'سعر الوحدة', cell: (r) => formatCurrency(Number(r.unit_price)), className: 'text-end' },
    { key: 'vat', header: 'الضريبة', cell: (r) => `${Number(r.vat_rate)}%`, className: 'text-end' },
    { key: 'total', header: 'الإجمالي', cell: (r) => formatCurrency(Number(r.line_total)), className: 'text-end' },
  ];

  return (
    <div className="space-y-5">
      <Link to="/app/debit-notes" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للإشعارات المدينة</Link>
      <PageHeader
        title={`إشعار مدين ${note.debit_note_number}`}
        description={note.customer_name ?? ''}
        actions={
          <div className="flex flex-wrap gap-2">
            {note.status === 'draft' && <Button onClick={post}>ترحيل الإشعار</Button>}
            {note.status === 'posted' && <Button variant="destructive" onClick={cancel}><ArrowUpFromLine className="h-4 w-4 ml-1" /> إلغاء / عكس</Button>}
            {note.journal_entry_id && <Button variant="outline" onClick={() => navigate(`/app/accounting/journals/${note.journal_entry_id}`)}><FileText className="h-4 w-4 ml-1" /> عرض القيد</Button>}
          </div>
        }
      />
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard title="الحالة" value={note.status} icon={ArrowUpFromLine} accent="info" />
        <StatCard title="التاريخ" value={formatDateShort(note.debit_note_date)} icon={FileText} accent="primary" />
        <StatCard title="ضريبة إضافية" value={formatCurrency(Number(note.vat_amount))} icon={Wallet} accent="warning" />
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

export default DebitNoteDetails;
