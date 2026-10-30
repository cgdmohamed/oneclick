import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DataTable, Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SentAlertsCenter } from '@/components/common/SentAlertsCenter';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ArrowRight, Phone, Mail, MapPin, FileBadge2, FileText, CreditCard,
  Wallet, Activity, Plus, AlertTriangle, TrendingUp, Calendar, User as UserIcon, Printer, X,
} from 'lucide-react';
import { useClients, useInvoices } from '@/hooks/entities';
import { payments as mockPayments, accounts as mockAccounts } from '@/data/mock';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency, formatDateShort, invoiceStatusLabel, paymentMethodLabel } from '@/lib/format';
import { printElementOnly } from '@/lib/print';
import type { Invoice, PaymentMethod } from '@/types';

interface UnifiedStatementLine {
  date: string;
  type: 'sales_invoice' | 'collection' | 'credit_note' | 'debit_note' | 'purchase_invoice' | 'payout' | 'supplier_payment';
  reference: string;
  amount: number;
  delta: number;
  running_balance: number;
}
interface UnifiedStatement {
  client: { id: string; name: string };
  linked_supplier: { id: string; name: string | null } | null;
  net_balance: number;
  lines: UnifiedStatementLine[];
}
interface LedgerStatementLine {
  entry_date: string;
  memo: string | null;
  description: string | null;
  reference: string | null;
  debit: string;
  credit: string;
  running_balance: string;
}
const unifiedLineLabel: Record<UnifiedStatementLine['type'], string> = {
  sales_invoice: 'فاتورة بيع',
  collection: 'تحصيل',
  credit_note: 'إشعار دائن',
  debit_note: 'إشعار مدين',
  purchase_invoice: 'فاتورة شراء',
  payout: 'دفعة لمورد',
  supplier_payment: 'دفعة فاتورة شراء',
};

interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  accountName: string;
}

const statusTone = (s: Invoice['status']) =>
  s === 'paid' ? 'active' :
  s === 'partial' ? 'pending' :
  s === 'overdue' ? 'overdue' : 'inactive';

const ageBucket = (days: number): string => {
  if (days <= 0) return 'لم يحن';
  if (days <= 30) return '1–30 يوم';
  if (days <= 60) return '31–60 يوم';
  if (days <= 90) return '61–90 يوم';
  return 'أكثر من 90 يوم';
};

const ClientDetail = () => {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { list: clients } = useClients();
  const { list: invoices } = useInvoices();
  const apiOn = isApiConfigured();

  const client = clients.find((c) => c.id === id);
  const fc = (n: number) => formatCurrency(n);

  const clientInvoices = useMemo(
    () => invoices.filter((inv) => inv.clientId === id),
    [invoices, id],
  );

  const paymentsQuery = useQuery({
    enabled: apiOn && Boolean(id),
    queryKey: ['payments-client', id],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        id: string; invoice_id: string; account_id: string;
        amount: string | number; method: string; paid_at: string;
        invoice_number?: string; account_name?: string;
      }> }>(`/api/payments?client_id=${encodeURIComponent(id)}`);
      return res.data.map<PaymentRecord>((p) => ({
        id: p.id,
        invoiceId: p.invoice_id,
        invoiceNumber: p.invoice_number ?? '—',
        date: p.paid_at,
        amount: Number(p.amount),
        method: (p.method ?? 'cash') as PaymentMethod,
        accountName: p.account_name ?? '—',
      }));
    },
  });

  // Mock fallback: build per-client payment ledger from mock data
  const mockClientPayments: PaymentRecord[] = useMemo(() => {
    const invIds = new Set(clientInvoices.map((i) => i.id));
    return mockPayments
      .filter((p) => invIds.has(p.invoiceId))
      .flatMap((p) =>
        p.splits.map((s, i) => ({
          id: `${p.id}-${i}`,
          invoiceId: p.invoiceId,
          invoiceNumber: clientInvoices.find((inv) => inv.id === p.invoiceId)?.number ?? '—',
          date: p.date,
          amount: s.amount,
          method: s.method,
          accountName: mockAccounts.find((a) => a.id === s.accountId)?.name ?? '—',
        })),
      )
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [clientInvoices]);

  const clientPayments: PaymentRecord[] = useMemo(() => {
    if (apiOn) {
      return (paymentsQuery.data ?? []).sort((a, b) => +new Date(b.date) - +new Date(a.date));
    }
    return mockClientPayments;
  }, [apiOn, paymentsQuery.data, mockClientPayments]);

  const unifiedStatementQuery = useQuery({
    enabled: apiOn && Boolean(id) && Boolean(client?.linkedSupplierId),
    queryKey: ['client-unified-statement', id],
    queryFn: async () => {
      const res = await api.get<{ data: UnifiedStatement }>(`/api/clients/${id}/unified-statement`);
      return res.data;
    },
  });

  // Line-by-line debit/credit statement, sourced directly from the general
  // ledger (journal_entry_lines) — every posted line that touches this
  // client's AR account, with a running balance. Distinct from the
  // "unified" statement above (which only exists for a client linked to a
  // supplier record) and from the invoices/payments tabs below (which list
  // business documents, not ledger entries).
  const ledgerStatementQuery = useQuery({
    enabled: apiOn && Boolean(id),
    queryKey: ['client-ledger-statement', id],
    queryFn: async () => {
      const res = await api.get<{ data: LedgerStatementLine[]; summary: { closing_balance: string } }>(
        `/api/reports/customer-ledger-detail?customer_id=${encodeURIComponent(id!)}`,
      );
      return res;
    },
  });

  // Standalone credit/debit notes (no original_invoice_id) post directly
  // against AR with no row in `invoices` at all — without fetching them
  // separately, this page's headline "remaining" total would silently
  // ignore their real effect on what the client owes.
  const creditNotesQuery = useQuery({
    enabled: apiOn && Boolean(id),
    queryKey: ['client-credit-notes', id],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; total: string | number; status: string; original_invoice_id: string | null }> }>(
        `/api/credit-notes?customer_id=${encodeURIComponent(id)}&page_size=200`,
      );
      return res.data;
    },
  });
  const debitNotesQuery = useQuery({
    enabled: apiOn && Boolean(id),
    queryKey: ['client-debit-notes', id],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; total: string | number; status: string; original_invoice_id: string | null }> }>(
        `/api/debit-notes?customer_id=${encodeURIComponent(id)}&page_size=200`,
      );
      return res.data;
    },
  });

  // Only STANDALONE posted notes (no linked invoice) affect this total —
  // invoice-linked ones are already netted into invoice.remaining via
  // recomputeInvoiceBalance(), so including them here too would double-count.
  const standaloneNotesDelta = useMemo(() => {
    const credits = (creditNotesQuery.data ?? [])
      .filter((cn) => cn.status === 'posted' && !cn.original_invoice_id)
      .reduce((s, cn) => s + Number(cn.total), 0);
    const debits = (debitNotesQuery.data ?? [])
      .filter((dn) => dn.status === 'posted' && !dn.original_invoice_id)
      .reduce((s, dn) => s + Number(dn.total), 0);
    // Credit notes reduce what the client owes, debit notes increase it.
    return debits - credits;
  }, [creditNotesQuery.data, debitNotesQuery.data]);

  /* ----- Aggregates (cancelled invoices excluded from financial totals) ----- */
  const totals = useMemo(() => {
    const activeInvoices = clientInvoices.filter((i) => i.status !== 'cancelled');
    const billed = activeInvoices.reduce((s, i) => s + i.total, 0);
    const paid = activeInvoices.reduce((s, i) => s + i.paid, 0);
    // Standalone credit/debit notes (no linked invoice) have no row in
    // clientInvoices at all, so their real effect on AR must be added here
    // explicitly — otherwise the headline "remaining" total silently ignores
    // them even though they genuinely changed what the client owes.
    const remaining = activeInvoices.reduce((s, i) => s + i.remaining, 0) + standaloneNotesDelta;
    const overdue = activeInvoices.filter((i) => i.status === 'overdue');
    const overdueAmount = overdue.reduce((s, i) => s + i.remaining, 0);
    const lastInvoice = [...clientInvoices].sort(
      (a, b) => +new Date(b.issueDate) - +new Date(a.issueDate),
    )[0];
    const lastPayment = clientPayments[0];
    return { billed, paid, remaining, overdueAmount, overdueCount: overdue.length, lastInvoice, lastPayment, activeCount: activeInvoices.length };
  }, [clientInvoices, clientPayments, standaloneNotesDelta]);

  /* ----- AR Aging buckets (cancelled invoices excluded) ----- */
  const aging = useMemo(() => {
    const now = Date.now();
    const buckets: Record<string, { count: number; amount: number }> = {
      'لم يحن': { count: 0, amount: 0 },
      '1–30 يوم': { count: 0, amount: 0 },
      '31–60 يوم': { count: 0, amount: 0 },
      '61–90 يوم': { count: 0, amount: 0 },
      'أكثر من 90 يوم': { count: 0, amount: 0 },
    };
    clientInvoices.filter((i) => i.remaining > 0 && i.status !== 'cancelled').forEach((inv) => {
      const days = Math.floor((now - +new Date(inv.dueDate)) / 86400000);
      const b = ageBucket(days);
      buckets[b].count += 1;
      buckets[b].amount += inv.remaining;
    });
    return buckets;
  }, [clientInvoices]);

  /* ----- Date filter (for tables only; KPIs use full data) ----- */
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [applied,  setApplied]  = useState({ from: '', to: '' });

  const filteredInvoices = useMemo(
    () => clientInvoices.filter((i) => {
      if (applied.from && i.issueDate < applied.from) return false;
      if (applied.to   && i.issueDate > applied.to)   return false;
      return true;
    }),
    [clientInvoices, applied],
  );

  const filteredPayments = useMemo(
    () => clientPayments.filter((p) => {
      if (applied.from && p.date < applied.from) return false;
      if (applied.to   && p.date > applied.to)   return false;
      return true;
    }),
    [clientPayments, applied],
  );

  /* ----- Activity timeline ----- */
  const timeline = useMemo(() => {
    type Item = { id: string; date: string; kind: 'invoice' | 'payment' | 'created'; title: string; detail: string; cancelled?: boolean };
    const items: Item[] = [];
    clientInvoices.forEach((inv) =>
      items.push({
        id: `inv-${inv.id}`,
        date: inv.issueDate,
        kind: 'invoice',
        title: `فاتورة ${inv.number}`,
        detail: `${invoiceStatusLabel(inv.status)} — ${fc(inv.total)}`,
        cancelled: inv.status === 'cancelled',
      }),
    );
    clientPayments.forEach((p) =>
      items.push({
        id: `pay-${p.id}`,
        date: p.date,
        kind: 'payment',
        title: `دفعة على ${p.invoiceNumber}`,
        detail: `${fc(p.amount)} — ${paymentMethodLabel(p.method)} (${p.accountName})`,
      }),
    );
    if (client) {
      items.push({
        id: `c-${client.id}`,
        date: client.createdAt,
        kind: 'created',
        title: 'تمت إضافة العميل',
        detail: client.name,
      });
    }
    return items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [client, clientInvoices, clientPayments]);

  if (!client) {
    return (
      <div>
        <PageHeader title="العميل غير موجود" description="ربما تم حذفه أو أن الرابط غير صحيح." />
        <Button variant="outline" onClick={() => navigate('/app/clients')}>
          <ArrowRight className="h-4 w-4 ml-1" /> العودة لقائمة العملاء
        </Button>
      </div>
    );
  }

  /* ----- Columns ----- */
  const invoiceCols: Column<Invoice & { clientName?: string }>[] = [
    { key: 'number', header: 'الرقم', cell: (r) => (
      <Link
        to={`/app/invoices/${r.id}`}
        className={`font-medium text-primary hover:underline${r.status === 'cancelled' ? ' line-through opacity-60' : ''}`}
      >
        {r.number}
      </Link>
    )},
    { key: 'issue', header: 'التاريخ', cell: (r) => (
      <span className={`text-sm${r.status === 'cancelled' ? ' line-through opacity-60' : ''}`}>{formatDateShort(r.issueDate)}</span>
    )},
    { key: 'due', header: 'الاستحقاق', cell: (r) => (
      <span className={`text-sm text-muted-foreground${r.status === 'cancelled' ? ' line-through opacity-60' : ''}`}>{formatDateShort(r.dueDate)}</span>
    )},
    { key: 'total', header: 'الإجمالي', cell: (r) => (
      <span className={`font-semibold${r.status === 'cancelled' ? ' line-through opacity-60' : ''}`}>{fc(r.total)}</span>
    )},
    { key: 'paid', header: 'المدفوع', cell: (r) => (
      <span className={`text-success${r.status === 'cancelled' ? ' opacity-60' : ''}`}>{fc(r.paid)}</span>
    )},
    { key: 'remaining', header: 'المتبقي', cell: (r) => (
      <span className={r.status === 'cancelled' ? 'text-muted-foreground opacity-60 line-through' : r.remaining > 0 ? 'text-warning font-medium' : 'text-muted-foreground'}>
        {fc(r.remaining)}
      </span>
    )},
    { key: 'status', header: 'الحالة', cell: (r) => <StatusBadge status={statusTone(r.status)} label={invoiceStatusLabel(r.status)} /> },
  ];

  const paymentCols: Column<PaymentRecord>[] = [
    { key: 'date', header: 'التاريخ', cell: (r) => <span className="text-sm">{formatDateShort(r.date)}</span> },
    { key: 'invoice', header: 'الفاتورة', cell: (r) => (
      <Link to={`/app/invoices/${r.invoiceId}`} className="text-primary hover:underline">{r.invoiceNumber}</Link>
    )},
    { key: 'amount', header: 'المبلغ', cell: (r) => <span className="font-semibold">{fc(r.amount)}</span> },
    { key: 'method', header: 'طريقة الدفع', cell: (r) => <StatusBadge status="active" label={paymentMethodLabel(r.method)} /> },
    { key: 'account', header: 'الحساب', cell: (r) => <span className="text-sm">{r.accountName}</span> },
  ];

  return (
    <div>
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <button onClick={() => navigate('/app/clients')} className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="h-4 w-4" /> العملاء
        </button>
        <span>/</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      <div data-print-area className="print-area">
      {/* Hero card */}
      <Card className="p-6 mb-6 border-border/60 relative overflow-hidden">
        <div className="absolute inset-0 gradient-subtle opacity-50 pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row gap-6 lg:items-center justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {client.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold">{client.name}</h2>
                {totals.overdueCount > 0 ? (
                  <Badge variant="destructive">عميل متأخر</Badge>
                ) : totals.remaining > 0 ? (
                  <Badge className="bg-warning/15 text-warning hover:bg-warning/15">رصيد مفتوح</Badge>
                ) : (
                  <Badge className="bg-success/15 text-success hover:bg-success/15">حساب مسوّى</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                {client.phone && (
                  <a href={`tel:${client.phone}`} dir="ltr" className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Phone className="h-3.5 w-3.5" /> {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Mail className="h-3.5 w-3.5" /> {client.email}
                  </a>
                )}
                {client.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {client.address}
                  </span>
                )}
                {client.taxNumber && (
                  <span className="inline-flex items-center gap-1.5">
                    <FileBadge2 className="h-3.5 w-3.5" /> ضريبي: {client.taxNumber}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> عميل منذ {formatDateShort(client.createdAt)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap no-print">
            <Button variant="outline" onClick={printElementOnly}>
              <Printer className="h-4 w-4 ml-1" /> طباعة
            </Button>
            <Button variant="outline" onClick={() => navigate('/app/clients')}>
              <UserIcon className="h-4 w-4 ml-1" /> تعديل البيانات
            </Button>
            <Button onClick={() => navigate(`/app/invoices?new=1&client=${client.id}`)}>
              <Plus className="h-4 w-4 ml-1" /> فاتورة جديدة
            </Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="إجمالي المبيعات" value={fc(totals.billed)} icon={TrendingUp} hint={`${totals.activeCount} فاتورة`} />
        <StatCard title="إجمالي المدفوع" value={fc(totals.paid)} icon={CreditCard} accent="success" />
        <StatCard title="الرصيد المتبقي" value={fc(totals.remaining)} icon={Wallet} accent={totals.remaining > 0 ? 'warning' : 'primary'} />
        <StatCard
          title="مبالغ متأخرة"
          value={fc(totals.overdueAmount)}
          icon={AlertTriangle}
          accent="destructive"
          hint={totals.overdueCount > 0 ? `${totals.overdueCount} فاتورة متأخرة` : 'لا يوجد'}
        />
      </div>

      <Tabs defaultValue={searchParams.get('tab') === 'ledger' ? 'ledger' : 'overview'}>
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="ledger">كشف الحساب</TabsTrigger>
          <TabsTrigger value="invoices">الفواتير ({clientInvoices.length})</TabsTrigger>
          <TabsTrigger value="payments">المدفوعات ({clientPayments.length})</TabsTrigger>
          {client?.linkedSupplierId && <TabsTrigger value="unified">كشف حساب موحد</TabsTrigger>}
          <TabsTrigger value="alerts">التنبيهات</TabsTrigger>
          <TabsTrigger value="activity">سجل النشاط</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 grid lg:grid-cols-3 gap-4">
          <Card className="p-5 border-border/60 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="h-4 w-4 text-primary" />
              <div className="font-semibold">تقادم الذمم المدينة</div>
            </div>
            <div className="space-y-3">
              {Object.entries(aging).map(([bucket, { count, amount }]) => {
                const pct = totals.remaining > 0 ? Math.round((amount / totals.remaining) * 100) : 0;
                return (
                  <div key={bucket}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{bucket}</span>
                      <span className="font-medium">{fc(amount)} <span className="text-xs text-muted-foreground">({count})</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={
                          bucket === 'لم يحن' ? 'h-full bg-success' :
                          bucket === '1–30 يوم' ? 'h-full bg-primary' :
                          bucket === '31–60 يوم' ? 'h-full bg-warning' :
                          'h-full bg-destructive'
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 border-border/60">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-primary" />
              <div className="font-semibold">آخر النشاطات</div>
            </div>
            <div className="space-y-3 text-sm">
              {totals.lastInvoice && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">آخر فاتورة: {totals.lastInvoice.number}</div>
                    <div className="text-xs text-muted-foreground">{formatDateShort(totals.lastInvoice.issueDate)} — {fc(totals.lastInvoice.total)}</div>
                  </div>
                </div>
              )}
              {totals.lastPayment && (
                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 text-success mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">آخر دفعة على {totals.lastPayment.invoiceNumber}</div>
                    <div className="text-xs text-muted-foreground">{formatDateShort(totals.lastPayment.date)} — {fc(totals.lastPayment.amount)}</div>
                  </div>
                </div>
              )}
              {!totals.lastInvoice && !totals.lastPayment && (
                <div className="text-muted-foreground text-sm">لا توجد نشاطات بعد.</div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-4">
          <Card className="p-3 mb-3 border-border/60">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">فلترة بالتاريخ:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-8 w-38 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="text-muted-foreground text-sm">—</span>
                <Input type="date" className="h-8 w-38 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <Button size="sm" className="h-8" onClick={() => setApplied({ from: dateFrom, to: dateTo })}>تطبيق</Button>
              {(applied.from || applied.to) && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setDateFrom(''); setDateTo(''); setApplied({ from: '', to: '' }); }}>
                  <X className="h-3.5 w-3.5 ml-1" /> مسح
                </Button>
              )}
            </div>
          </Card>
          {clientInvoices.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">
              لا توجد فواتير لهذا العميل بعد.
            </Card>
          ) : (
            <DataTable data={filteredInvoices} columns={invoiceCols} searchKeys={['number']} />
          )}
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments" className="mt-4">
          <Card className="p-3 mb-3 border-border/60">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">فلترة بالتاريخ:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-8 w-38 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="text-muted-foreground text-sm">—</span>
                <Input type="date" className="h-8 w-38 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <Button size="sm" className="h-8" onClick={() => setApplied({ from: dateFrom, to: dateTo })}>تطبيق</Button>
              {(applied.from || applied.to) && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setDateFrom(''); setDateTo(''); setApplied({ from: '', to: '' }); }}>
                  <X className="h-3.5 w-3.5 ml-1" /> مسح
                </Button>
              )}
            </div>
          </Card>
          {clientPayments.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">
              لا توجد مدفوعات مسجلة لهذا العميل.
            </Card>
          ) : (
            <DataTable data={filteredPayments} columns={paymentCols} searchKeys={['invoiceNumber']} />
          )}
        </TabsContent>

        <TabsContent value="ledger" className="mt-4 space-y-3">
            <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                كشف حساب مباشر من دفتر الأستاذ — كل قيد مرحّل يخص حساب العميل «{client?.name}» بالمدين والدائن والرصيد التراكمي.
              </p>
              {ledgerStatementQuery.data?.summary && (
                <div className="text-end">
                  <p className="text-xs text-muted-foreground mb-0.5">الرصيد الحالي</p>
                  <p className="text-lg font-bold">{fc(Number(ledgerStatementQuery.data.summary.closing_balance))}</p>
                </div>
              )}
            </Card>
            {ledgerStatementQuery.isLoading ? (
              <Card className="p-10 text-center text-muted-foreground border-dashed">جارٍ التحميل…</Card>
            ) : !ledgerStatementQuery.data?.data.length ? (
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
                    {ledgerStatementQuery.data.data.map((l, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="p-3">{formatDateShort(l.entry_date)}</td>
                        <td className="p-3">{l.description || l.memo || '—'}</td>
                        <td className="p-3">{l.reference || '—'}</td>
                        <td className="p-3 text-end">{Number(l.debit) > 0 ? fc(Number(l.debit)) : '—'}</td>
                        <td className="p-3 text-end">{Number(l.credit) > 0 ? fc(Number(l.credit)) : '—'}</td>
                        <td className="p-3 text-end font-medium">{fc(Number(l.running_balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
        </TabsContent>

        {/* Unified statement (client linked to a supplier record — same party) */}
        {client.linkedSupplierId && (
          <TabsContent value="unified" className="mt-4 space-y-3">
            <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  كشف موحد يجمع معاملات العميل «{client.name}» مع حركاته كمورد
                  {unifiedStatementQuery.data?.linked_supplier?.name ? ` («${unifiedStatementQuery.data.linked_supplier.name}»)` : ''}.
                </p>
              </div>
              {unifiedStatementQuery.data && (
                <div className="text-end">
                  <p className="text-xs text-muted-foreground mb-0.5">صافي الرصيد</p>
                  <p className={`text-lg font-bold ${unifiedStatementQuery.data.net_balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {fc(Math.abs(unifiedStatementQuery.data.net_balance))}
                    <span className="text-xs font-normal text-muted-foreground ms-1">
                      {unifiedStatementQuery.data.net_balance >= 0 ? '(له علينا)' : '(علينا له)'}
                    </span>
                  </p>
                </div>
              )}
            </Card>
            {unifiedStatementQuery.isLoading ? (
              <Card className="p-10 text-center text-muted-foreground border-dashed">جارٍ التحميل…</Card>
            ) : !unifiedStatementQuery.data?.lines.length ? (
              <Card className="p-10 text-center text-muted-foreground border-dashed">لا توجد معاملات بعد.</Card>
            ) : (
              <Card className="border-border/60 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-start p-3 font-medium">التاريخ</th>
                      <th className="text-start p-3 font-medium">النوع</th>
                      <th className="text-start p-3 font-medium">المرجع</th>
                      <th className="text-end p-3 font-medium">القيمة</th>
                      <th className="text-end p-3 font-medium">الرصيد التراكمي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unifiedStatementQuery.data.lines.map((l, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="p-3">{formatDateShort(l.date)}</td>
                        <td className="p-3">
                          <Badge variant="outline">{unifiedLineLabel[l.type]}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{l.reference || '—'}</td>
                        <td className={`p-3 text-end ${l.delta >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{fc(l.amount)}</td>
                        <td className={`p-3 text-end font-medium ${l.running_balance >= 0 ? 'text-success' : 'text-destructive'}`}>{fc(l.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </TabsContent>
        )}

        {/* Sent alerts */}
        <TabsContent value="alerts" className="mt-4">
          <Card className="p-5 border-border/60">
            <SentAlertsCenter
              recipientKind="client"
              recipientId={client.id}
              title="تنبيهات هذا العميل"
              description="جميع التنبيهات التلقائية المُرسَلة لهذا العميل مع حالة القراءة."
              emptyDescription="لم يُرسل أي تنبيه لهذا العميل بعد."
              compact
            />
          </Card>
        </TabsContent>

        {/* Activity timeline */}
        <TabsContent value="activity" className="mt-4">
          <Card className="p-6 border-border/60">
            {timeline.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">لا يوجد نشاط بعد.</div>
            ) : (
              <ol className="relative border-r-2 border-border/60 mr-3 space-y-5">
                {timeline.map((item) => (
                  <li key={item.id} className="pr-6 relative">
                    <span className={
                      'absolute -right-[9px] top-1 h-4 w-4 rounded-full ring-4 ring-background flex items-center justify-center ' +
                      (item.kind === 'payment' ? 'bg-success' :
                       item.cancelled ? 'bg-muted-foreground' :
                       item.kind === 'invoice' ? 'bg-primary' : 'bg-muted-foreground')
                    } />
                    <div className="text-xs text-muted-foreground">{formatDateShort(item.date)}</div>
                    <div className={`font-medium${item.cancelled ? ' line-through opacity-60' : ''}`}>{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.detail}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default ClientDetail;
