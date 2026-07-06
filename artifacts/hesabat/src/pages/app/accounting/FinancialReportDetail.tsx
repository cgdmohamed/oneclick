import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { ArrowRight, Printer } from 'lucide-react';

const titleMap: Record<string, string> = {
  'general-ledger': 'General Ledger',
  'trial-balance': 'Trial Balance',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet / Financial Position',
  'customer-ledger': 'Customer Ledger',
  'supplier-ledger': 'Supplier Ledger',
  vat: 'VAT Report',
  inventory: 'Inventory Valuation',
};

const endpointFor = (type: string) => type === 'inventory' ? '/api/reports/inventory' : `/api/reports/${type}`;

const FinancialReportDetail = () => {
  const { type = 'trial-balance' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.from && !['balance-sheet', 'inventory'].includes(type)) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    return params.toString();
  }, [applied, type]);
  const { data } = useQuery({
    queryKey: ['financial-report', type, query],
    queryFn: async () => api.get<{ data: any[] | Record<string, unknown>; summary?: Record<string, string | number> }>(`${endpointFor(type)}${query ? `?${query}` : ''}`),
  });
  const rows = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
  const summary = data?.summary ?? (type === 'vat' && !Array.isArray(data?.data) ? data?.data as Record<string, string | number> : {});
  const cols = useMemo<Column<any>[]>(() => {
    if (type === 'general-ledger') return [
      { key: 'date', header: 'التاريخ', cell: (r) => formatDateShort(r.entry_date) },
      { key: 'number', header: 'القيد', cell: (r) => r.number },
      { key: 'account', header: 'الحساب', cell: (r) => `${r.account_code} - ${r.account_name}` },
      { key: 'memo', header: 'البيان', cell: (r) => r.memo ?? r.description ?? '—' },
      { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
      { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
    ];
    if (type === 'trial-balance') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'الحساب', cell: (r) => r.name },
      { key: 'debit', header: 'مدين', cell: (r) => formatCurrency(Number(r.debit)), className: 'text-end' },
      { key: 'credit', header: 'دائن', cell: (r) => formatCurrency(Number(r.credit)), className: 'text-end' },
      { key: 'balance', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.balance)), className: 'text-end' },
    ];
    if (type === 'income-statement') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'الحساب', cell: (r) => r.name },
      { key: 'type', header: 'النوع', cell: (r) => r.type },
      { key: 'amount', header: 'المبلغ', cell: (r) => formatCurrency(Math.abs(Number(r.amount))), className: 'text-end' },
    ];
    if (type === 'balance-sheet') return [
      { key: 'code', header: 'الكود', cell: (r) => r.code },
      { key: 'name', header: 'الحساب', cell: (r) => r.name },
      { key: 'type', header: 'النوع', cell: (r) => r.type },
      { key: 'balance', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.type === 'asset' ? r.debit_balance : r.credit_balance)), className: 'text-end' },
    ];
    if (type === 'customer-ledger' || type === 'supplier-ledger') return [
      { key: 'name', header: type === 'customer-ledger' ? 'العميل' : 'المورد', cell: (r) => r.name },
      { key: 'activity', header: type === 'customer-ledger' ? 'الفواتير' : 'المشتريات', cell: (r) => formatCurrency(Number(r.invoiced ?? r.purchased)), className: 'text-end' },
      { key: 'paid', header: 'المدفوع', cell: (r) => formatCurrency(Number(r.paid)), className: 'text-end' },
      { key: 'outstanding', header: 'الرصيد', cell: (r) => formatCurrency(Number(r.outstanding)), className: 'text-end' },
    ];
    if (type === 'inventory') return [
      { key: 'name', header: 'المنتج', cell: (r) => r.name },
      { key: 'qty', header: 'الكمية', cell: (r) => `${r.quantity} ${r.unit}` },
      { key: 'cost', header: 'التكلفة', cell: (r) => formatCurrency(Number(r.cost)), className: 'text-end' },
      { key: 'value', header: 'قيمة المخزون', cell: (r) => formatCurrency(Number(r.stock_value)), className: 'text-end' },
    ];
    return [
      { key: 'key', header: 'البند', cell: (r) => r.id },
      { key: 'value', header: 'القيمة', cell: (r) => JSON.stringify(r) },
    ];
  }, [type]);
  const tableRows = type === 'vat' ? [] : rows.map((row, idx) => ({ id: row.id ?? `${type}-${idx}`, ...row }));
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للتقارير المالية</Link>
      <PageHeader title={titleMap[type] ?? 'Financial Report'} actions={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>} />
      {!['inventory', 'customer-ledger', 'supplier-ledger', 'vat'].includes(type) && (
        <Card className="p-4 border-border/60">
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button onClick={() => setApplied({ from, to })}>تطبيق</Button>
            <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setApplied({ from: '', to: '' }); }}>مسح</Button>
          </div>
        </Card>
      )}
      {Object.keys(summary).length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(summary).map(([key, value]) => <Card key={key} className="p-4"><div className="text-xs text-muted-foreground">{key}</div><div className="text-xl font-bold mt-1">{typeof value === 'number' || !Number.isNaN(Number(value)) ? formatCurrency(Number(value)) : String(value)}</div></Card>)}
        </div>
      )}
      {type === 'vat' ? null : <DataTable data={tableRows} columns={cols} pageSize={25} emptyTitle="لا توجد بيانات" />}
    </div>
  );
};

export default FinancialReportDetail;
