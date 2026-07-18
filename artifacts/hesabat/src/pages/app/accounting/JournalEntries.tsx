import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatDateShort } from '@/lib/format';
import { Plus } from 'lucide-react';
import { journalStatusLabel, sourceLabel, type JournalEntry } from './types';

const JournalEntries = () => {
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const { data = [] } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: async () => (await api.get<{ data: JournalEntry[] }>('/api/accounting/journal-entries?page_size=300')).data ?? [],
  });
  const filtered = data.filter((je) => {
    if (from && je.entry_date < from) return false;
    if (to && je.entry_date > to) return false;
    if (status && je.status !== status) return false;
    if (source && je.source_type !== source) return false;
    return true;
  });
  const columns: Column<JournalEntry>[] = [
    { key: 'number', header: 'رقم القيد', cell: (r) => <Link className="text-primary font-medium" to={`/app/accounting/journals/${r.id}`}>{r.number}</Link> },
    { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.entry_date) },
    { key: 'status', header: 'الحالة', cell: (r) => <Badge variant={r.status === 'posted' ? 'default' : r.status === 'reversed' ? 'secondary' : 'outline'}>{journalStatusLabel(r.status)}</Badge> },
    { key: 'source', header: 'المصدر', cell: (r) => sourceLabel(r.source_type) },
    { key: 'memo', header: 'البيان', cell: (r) => r.memo ?? '—' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="قيود اليومية" description="إدارة القيود اليدوية والقيود الناتجة عن المستندات" actions={<Button onClick={() => navigate('/app/accounting/journals/new')}><Plus className="h-4 w-4 ml-1" /> قيد يدوي</Button>} />
      <Card className="p-4 border-border/60">
        <div className="grid sm:grid-cols-5 gap-3">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option><option value="draft">مسودة</option><option value="posted">مرحل</option><option value="reversed">معكوس</option>
          </select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">كل المصادر</option><option value="invoice">فاتورة بيع</option><option value="payment">تحصيل</option><option value="payout">مصروف</option><option value="purchase_invoice">فاتورة شراء</option><option value="supplier_payment">دفعة مورد</option><option value="stock_movement">حركة مخزون</option><option value="year_end_closing">إقفال نهاية السنة</option>
          </select>
          <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setStatus(''); setSource(''); }}>مسح</Button>
        </div>
      </Card>
      <DataTable data={filtered} columns={columns} searchKeys={['number', 'memo']} emptyTitle="لا توجد قيود يومية" onRowClick={(r) => navigate(`/app/accounting/journals/${r.id}`)} />
    </div>
  );
};

export default JournalEntries;
