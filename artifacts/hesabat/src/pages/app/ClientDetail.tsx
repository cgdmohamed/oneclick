import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DataTable, Column } from '@/components/common/DataTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SentAlertsCenter } from '@/components/common/SentAlertsCenter';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ArrowRight, Phone, Mail, MapPin, FileBadge2, FileText, CreditCard,
  Wallet, Activity, Plus, AlertTriangle, TrendingUp, Calendar, User as UserIcon,
} from 'lucide-react';
import { useClients, useInvoices } from '@/hooks/entities';
import { payments as mockPayments, accounts as mockAccounts } from '@/data/mock';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency, formatDateShort, invoiceStatusLabel, paymentMethodLabel } from '@/lib/format';
import type { Invoice, PaymentMethod } from '@/types';

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
  const navigate = useNavigate();
  const { list: clients } = useClients();
  const { list: invoices } = useInvoices();
  const apiOn = isApiConfigured();

  const client = clients.find((c) => c.id === id);
  const fc = (n: number) => formatCurrency(n, client?.currencySymbol);

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

  /* ----- Aggregates ----- */
  const totals = useMemo(() => {
    const billed = clientInvoices.reduce((s, i) => s + i.total, 0);
    const paid = clientInvoices.reduce((s, i) => s + i.paid, 0);
    const remaining = clientInvoices.reduce((s, i) => s + i.remaining, 0);
    const overdue = clientInvoices.filter((i) => i.status === 'overdue');
    const overdueAmount = overdue.reduce((s, i) => s + i.remaining, 0);
    const lastInvoice = [...clientInvoices].sort(
      (a, b) => +new Date(b.issueDate) - +new Date(a.issueDate),
    )[0];
    const lastPayment = clientPayments[0];
    return { billed, paid, remaining, overdueAmount, overdueCount: overdue.length, lastInvoice, lastPayment };
  }, [clientInvoices, clientPayments]);

  /* ----- AR Aging buckets ----- */
  const aging = useMemo(() => {
    const now = Date.now();
    const buckets: Record<string, { count: number; amount: number }> = {
      'لم يحن': { count: 0, amount: 0 },
      '1–30 يوم': { count: 0, amount: 0 },
      '31–60 يوم': { count: 0, amount: 0 },
      '61–90 يوم': { count: 0, amount: 0 },
      'أكثر من 90 يوم': { count: 0, amount: 0 },
    };
    clientInvoices.filter((i) => i.remaining > 0).forEach((inv) => {
      const days = Math.floor((now - +new Date(inv.dueDate)) / 86400000);
      const b = ageBucket(days);
      buckets[b].count += 1;
      buckets[b].amount += inv.remaining;
    });
    return buckets;
  }, [clientInvoices]);

  /* ----- Activity timeline ----- */
  const timeline = useMemo(() => {
    type Item = { id: string; date: string; kind: 'invoice' | 'payment' | 'created'; title: string; detail: string };
    const items: Item[] = [];
    clientInvoices.forEach((inv) =>
      items.push({
        id: `inv-${inv.id}`,
        date: inv.issueDate,
        kind: 'invoice',
        title: `فاتورة ${inv.number}`,
        detail: `${invoiceStatusLabel(inv.status)} — ${fc(inv.total)}`,
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
      <Link to={`/app/invoices/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link>
    )},
    { key: 'issue', header: 'التاريخ', cell: (r) => <span className="text-sm">{formatDateShort(r.issueDate)}</span> },
    { key: 'due', header: 'الاستحقاق', cell: (r) => <span className="text-sm text-muted-foreground">{formatDateShort(r.dueDate)}</span> },
    { key: 'total', header: 'الإجمالي', cell: (r) => <span className="font-semibold">{fc(r.total)}</span> },
    { key: 'paid', header: 'المدفوع', cell: (r) => <span className="text-success">{fc(r.paid)}</span> },
    { key: 'remaining', header: 'المتبقي', cell: (r) => (
      <span className={r.remaining > 0 ? 'text-warning font-medium' : 'text-muted-foreground'}>
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
                {client.currencySymbol && (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> العملة: {client.currencySymbol}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> عميل منذ {formatDateShort(client.createdAt)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/app/clients')}>
              <UserIcon className="h-4 w-4 ml-1" /> تعديل البيانات
            </Button>
            <Button onClick={() => navigate(`/app/invoices/new?client=${client.id}`)}>
              <Plus className="h-4 w-4 ml-1" /> فاتورة جديدة
            </Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="إجمالي المبيعات" value={fc(totals.billed)} icon={TrendingUp} hint={`${clientInvoices.length} فاتورة`} />
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="invoices">الفواتير ({clientInvoices.length})</TabsTrigger>
          <TabsTrigger value="payments">المدفوعات ({clientPayments.length})</TabsTrigger>
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
          {clientInvoices.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">
              لا توجد فواتير لهذا العميل بعد.
            </Card>
          ) : (
            <DataTable data={clientInvoices} columns={invoiceCols} searchKeys={['number']} />
          )}
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments" className="mt-4">
          {clientPayments.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">
              لا توجد مدفوعات مسجلة لهذا العميل.
            </Card>
          ) : (
            <DataTable data={clientPayments} columns={paymentCols} searchKeys={['invoiceNumber']} />
          )}
        </TabsContent>

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
                       item.kind === 'invoice' ? 'bg-primary' : 'bg-muted-foreground')
                    } />
                    <div className="text-xs text-muted-foreground">{formatDateShort(item.date)}</div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.detail}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientDetail;
