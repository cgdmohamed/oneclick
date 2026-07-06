import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { ArrowRight, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { journalStatusLabel, sourceLabel, type JournalEntry, type JournalLine } from './types';

type EntryDetails = JournalEntry & { lines: JournalLine[] };

const JournalEntryDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    enabled: Boolean(id),
    queryKey: ['journal-entry', id],
    queryFn: async () => (await api.get<{ data: EntryDetails }>(`/api/accounting/journal-entries/${id}`)).data,
  });
  const lines = data?.lines ?? [];
  const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
  const post = async () => {
    if (!id) return;
    await api.post(`/api/accounting/journal-entries/${id}/post`);
    await qc.invalidateQueries({ queryKey: ['journal-entry', id] });
    await qc.invalidateQueries({ queryKey: ['journal-entries'] });
    toast.success('تم ترحيل القيد');
  };
  const reverse = async () => {
    if (!id) return;
    const res = await api.post<{ data: JournalEntry }>(`/api/accounting/journal-entries/${id}/reverse`);
    await qc.invalidateQueries({ queryKey: ['journal-entries'] });
    toast.success('تم إنشاء قيد عكسي');
    navigate(`/app/accounting/journals/${res.data.id}`);
  };
  const columns: Column<JournalLine>[] = [
    { key: 'account', header: 'الحساب', cell: (r) => <div><div className="font-medium">{r.account_code} - {r.account_name}</div><div className="text-xs text-muted-foreground">{r.description ?? ''}</div></div> },
    { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
    { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
  ];
  if (!data) return null;
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/journals" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للقيود</Link>
      <PageHeader
        title={`قيد ${data.number}`}
        description={`${formatDateShort(data.entry_date)} · ${sourceLabel(data.source_type)}`}
        actions={<div className="flex gap-2">{data.status === 'draft' && <Button onClick={post}><Send className="h-4 w-4 ml-1" /> ترحيل</Button>}{data.status === 'posted' && <Button variant="outline" onClick={reverse}><RotateCcw className="h-4 w-4 ml-1" /> عكس القيد</Button>}</div>}
      />
      <div className="grid sm:grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-sm text-muted-foreground">الحالة</div><Badge className="mt-2">{journalStatusLabel(data.status)}</Badge></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">إجمالي المدين</div><div className="text-xl font-bold">{formatCurrency(debit)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">إجمالي الدائن</div><div className="text-xl font-bold">{formatCurrency(credit)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">الفرق</div><div className="text-xl font-bold">{formatCurrency(debit - credit)}</div></Card>
      </div>
      {data.memo && <Card className="p-4 text-sm">{data.memo}</Card>}
      {data.source_id && <Card className="p-4 text-sm text-muted-foreground">المستند المرتبط: {sourceLabel(data.source_type)} · <span className="font-mono">{data.source_id}</span></Card>}
      <DataTable data={lines} columns={columns} pageSize={0} />
    </div>
  );
};

export default JournalEntryDetails;
