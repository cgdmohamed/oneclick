import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DataTable, Column } from '@/components/common/DataTable';
import { PlanCard } from '@/components/common/PlanCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarClock, CreditCard, Crown, Download, Receipt, Sparkles, AlertTriangle, Users } from 'lucide-react';
import { plans as mockPlans, subscriptions as mockSubs, payments as mockPayments, users as mockUsers } from '@/data/mock';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';
import type { Plan } from '@/types';
import { toast } from 'sonner';

interface SubRow {
  id: string;
  plan_id: string;
  plan_name?: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
  start_date: string;
  end_date: string;
  amount: string | number;
}
interface SubPaymentRow {
  id: string; amount: string | number; method: string;
  paid_at: string; reference: string | null; notes: string | null;
  plan_name: string;
}
interface PlanRow {
  id: string; code: string; name: string;
  price_monthly: string | number; price_yearly: string | number;
  max_users: number; max_invoices_monthly: number;
  features: Record<string, unknown>;
}

const fromPlanRow = (r: PlanRow): Plan => ({
  id: r.id, name: r.name,
  monthlyPrice: Number(r.price_monthly),
  yearlyPrice: Number(r.price_yearly),
  limits: {
    users: r.max_users, invoices: r.max_invoices_monthly,
    products: Number((r.features as { products?: number })?.products ?? 0),
    reports: Number((r.features as { reports?: number })?.reports ?? 0),
    notifications: Number((r.features as { notifications?: number })?.notifications ?? 0),
  },
  features: Array.isArray((r.features as { items?: string[] })?.items)
    ? (r.features as { items: string[] }).items : [],
  popular: Boolean((r.features as { popular?: boolean })?.popular),
});

/** Mock subscription for the demo company (co-1). */
const mockMineSub = (): SubRow => {
  const s = mockSubs.find((x) => x.companyId === 'co-1') ?? mockSubs[0];
  const planName = mockPlans.find((p) => p.id === s.planId)?.name ?? '';
  return {
    id: s.id, plan_id: s.planId, plan_name: planName,
    status: s.status === 'expired' ? 'expired' : s.status === 'suspended' ? 'past_due' : 'active',
    start_date: s.startDate, end_date: s.endDate, amount: s.amount,
  };
};

/** Mock seat usage for the demo company (co-1). */
const mockSeatUsage = () => {
  const sub = mockMineSub();
  const plan = mockPlans.find((p) => p.id === sub.plan_id);
  const limit = plan?.limits?.users ?? 0;
  const used = mockUsers.filter((u) => u.companyId === 'co-1').length;
  return { used, limit };
};

/** Mock subscription invoices (3 months back). */
const mockMinePayments = (): SubPaymentRow[] => {
  const sub = mockMineSub();
  const planName = sub.plan_name ?? '';
  const monthlyAmount = mockPlans.find((p) => p.id === sub.plan_id)?.monthlyPrice ?? Number(sub.amount);
  const now = Date.now();
  const day = 86400000;
  return [0, 1, 2].map((i) => ({
    id: `sp-${i + 1}`,
    amount: monthlyAmount,
    method: i === 0 ? 'bank' : i === 1 ? 'wallet' : 'cash',
    paid_at: new Date(now - i * 30 * day).toISOString(),
    reference: i === 0 ? 'TRX-99821' : i === 1 ? 'STC-77410' : null,
    notes: null,
    plan_name: planName,
  }));
};

const statusMeta = (s: SubRow['status']) => {
  switch (s) {
    case 'active':    return { label: 'نشط',   tone: 'active' as const };
    case 'trialing':  return { label: 'تجريبي', tone: 'pending' as const };
    case 'past_due':  return { label: 'متأخر السداد', tone: 'overdue' as const };
    case 'cancelled': return { label: 'مُلغى', tone: 'inactive' as const };
    case 'expired':   return { label: 'منتهي', tone: 'overdue' as const };
  }
};

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000));

const Subscription = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const [yearly, setYearly] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);

  const subQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: async () => {
      if (!apiOn) return mockMineSub();
      const res = await api.get<{ data: SubRow | null }>('/api/subscriptions/me');
      return res.data ?? null;
    },
  });
  const seatUsageQ = useQuery({
    queryKey: ['my-seat-usage'],
    queryFn: async () => {
      if (!apiOn) return mockSeatUsage();
      const res = await api.get<{ data: { used: number; limit: number } }>('/api/subscriptions/me/seat-usage');
      return res.data;
    },
    refetchInterval: 30_000,
  });
  const paymentsQ = useQuery({
    queryKey: ['my-subscription-payments'],
    queryFn: async () => {
      if (!apiOn) return mockMinePayments();
      const res = await api.get<{ data: SubPaymentRow[] }>('/api/subscriptions/me/payments');
      return res.data ?? [];
    },
  });
  const plansQ = useQuery({
    queryKey: ['plans-public'],
    queryFn: async () => {
      if (!apiOn) return mockPlans;
      const res = await api.get<{ data: PlanRow[] }>('/api/plans');
      return res.data.map(fromPlanRow);
    },
  });

  const sub = subQ.data ?? null;
  const plans = plansQ.data ?? [];
  const payments = paymentsQ.data ?? [];
  const seatUsage = seatUsageQ.data ?? null;

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === sub?.plan_id) ?? plans[0],
    [plans, sub],
  );

  const remainingDays = sub ? daysBetween(sub.end_date, new Date().toISOString()) : 0;
  const totalDays = sub ? Math.max(1, daysBetween(sub.end_date, sub.start_date)) : 30;
  const usagePct = Math.max(0, Math.min(100, Math.round(((totalDays - remainingDays) / totalDays) * 100)));
  const lastPayment = payments[0];

  const requestChange = useMutation({
    mutationFn: async (plan: Plan) => {
      if (!apiOn) throw new Error('no-api');
      await api.post('/api/subscriptions/me/request-change', { plan_id: plan.id });
      return plan;
    },
    onSuccess: (plan) => {
      toast.success(`تم إرسال طلب الترقية إلى الباقة "${plan.name}"`);
      setConfirmPlan(null);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => {
      if ((e as Error).message === 'no-api') {
        toast.error('هذا الإجراء يتطلب الاتصال بالخادم');
      } else {
        toast.error('تعذّر إرسال الطلب');
      }
    },
  });

  const downloadInvoice = (p: SubPaymentRow) => {
    const lines = [
      'فاتورة اشتراك - منصة ون كليك',
      '------------------------------------',
      `رقم العملية: ${p.id}`,
      `الباقة: ${p.plan_name}`,
      `التاريخ: ${formatDateShort(p.paid_at)}`,
      `المبلغ: ${formatCurrency(Number(p.amount))}`,
      `طريقة الدفع: ${paymentMethodLabel(p.method)}`,
      p.reference ? `المرجع: ${p.reference}` : '',
      p.notes ? `ملاحظات: ${p.notes}` : '',
    ].filter(Boolean).join('\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `subscription-invoice-${p.id}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const columns: Column<SubPaymentRow>[] = [
    { key: 'paid_at', header: 'التاريخ', cell: (r) => <span className="text-sm">{formatDateShort(r.paid_at)}</span> },
    { key: 'plan_name', header: 'الباقة', cell: (r) => <span className="font-medium">{r.plan_name}</span> },
    { key: 'amount', header: 'المبلغ', cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
    { key: 'method', header: 'طريقة الدفع', cell: (r) => <StatusBadge status="active" label={paymentMethodLabel(r.method)} /> },
    { key: 'reference', header: 'المرجع', cell: (r) => <span dir="ltr" className="text-sm text-muted-foreground">{r.reference || '—'}</span> },
    { key: 'actions', header: '', cell: (r) => (
      <Button variant="ghost" size="sm" onClick={() => downloadInvoice(r)}>
        <Download className="h-4 w-4 ml-1" /> تنزيل
      </Button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="الاشتراك والفوترة"
        description="تابع باقتك الحالية، فواتيرك الشهرية، وقم بترقية الخطة عند الحاجة."
      />

      {apiOn && !subQ.isLoading && !sub && (
        <Card className="p-10 mb-6 text-center border-dashed space-y-2">
          <Crown className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="font-semibold text-lg">لا توجد اشتراكات بعد</p>
          <p className="text-sm text-muted-foreground">لم يتم تفعيل أي باقة لحسابك حتى الآن. تواصل مع الإدارة لتفعيل اشتراكك.</p>
        </Card>
      )}

      {sub && (
        <Card className="p-6 mb-6 border-border/60 relative overflow-hidden">
          <div className="absolute inset-0 gradient-subtle opacity-60 pointer-events-none" />
          <div className="relative grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Crown className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs text-muted-foreground">باقتك الحالية</div>
                  <div className="text-xl font-bold">{currentPlan?.name ?? sub.plan_name}</div>
                </div>
                <div className="mr-auto">
                  <StatusBadge status={statusMeta(sub.status).tone} label={statusMeta(sub.status).label} />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <div className="rounded-lg bg-card border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">تاريخ البداية</div>
                  <div className="font-semibold mt-1">{formatDateShort(sub.start_date)}</div>
                </div>
                <div className="rounded-lg bg-card border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">تاريخ التجديد</div>
                  <div className="font-semibold mt-1">{formatDateShort(sub.end_date)}</div>
                </div>
                <div className="rounded-lg bg-card border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">قيمة الاشتراك</div>
                  <div className="font-semibold mt-1">{formatCurrency(Number(sub.amount))}</div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>المدة المتبقية</span>
                    <span>{remainingDays} يوم متبقي</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  {remainingDays <= 7 && sub.status === 'active' && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      <span>اشتراكك على وشك الانتهاء — يُرجى التجديد قبل {formatDateShort(sub.end_date)}.</span>
                    </div>
                  )}
                </div>

                {seatUsage && seatUsage.limit > 0 && (() => {
                  const seatPct = Math.min(100, Math.round((seatUsage.used / seatUsage.limit) * 100));
                  const isWarning = seatPct >= 80;
                  const isFull = seatUsage.used >= seatUsage.limit;
                  return (
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          المقاعد المستخدمة
                        </span>
                        <span className={isWarning ? 'font-semibold text-warning' : ''}>
                          {seatUsage.used} / {seatUsage.limit}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full transition-all ${isFull ? 'bg-destructive' : isWarning ? 'bg-warning' : 'bg-primary'}`}
                          style={{ width: `${seatPct}%` }}
                        />
                      </div>
                      {isWarning && (
                        <div className={`mt-2 flex items-center gap-2 text-xs ${isFull ? 'text-destructive' : 'text-warning'}`}>
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>
                            {isFull
                              ? 'وصلت إلى الحد الأقصى من المقاعد — لا يمكن إضافة مستخدمين جدد. يُرجى الترقية إلى باقة أعلى.'
                              : `اقتربت من الحد الأقصى للمقاعد (${seatUsage.used} من ${seatUsage.limit}). فكّر في الترقية قريباً.`
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="space-y-3">
              <StatCard
                title="آخر فاتورة"
                value={lastPayment ? formatCurrency(Number(lastPayment.amount)) : '—'}
                icon={Receipt}
                hint={lastPayment ? formatDateShort(lastPayment.paid_at) : 'لا يوجد سجل بعد'}
              />
              <StatCard
                title="الفواتير المدفوعة"
                value={String(payments.length)}
                icon={CreditCard}
                hint="منذ بداية الاشتراك"
                accent="success"
              />
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="invoices" className="mt-2">
        <TabsList>
          <TabsTrigger value="invoices">
            <CalendarClock className="h-4 w-4 ml-1" /> فواتير الاشتراك
          </TabsTrigger>
          <TabsTrigger value="plans">
            <Sparkles className="h-4 w-4 ml-1" /> إدارة الباقة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          {payments.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">
              لا توجد فواتير اشتراك بعد.
            </Card>
          ) : (
            <DataTable data={payments} columns={columns} searchKeys={['plan_name', 'reference']} />
          )}
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <div className="flex items-center justify-end gap-3 mb-4 text-sm">
            <span className={!yearly ? 'font-semibold' : 'text-muted-foreground'}>شهرياً</span>
            <Switch checked={yearly} onCheckedChange={setYearly} />
            <span className={yearly ? 'font-semibold' : 'text-muted-foreground'}>سنوياً <span className="text-success text-xs">(وفّر شهرين)</span></span>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((p) => {
              const isCurrent = p.id === sub?.plan_id;
              return (
                <PlanCard
                  key={p.id}
                  plan={p}
                  yearly={yearly}
                  cta={isCurrent ? 'باقتك الحالية' : 'طلب الترقية'}
                  onSelect={isCurrent ? undefined : () => setConfirmPlan(p)}
                />
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmPlan} onOpenChange={(o) => !o && setConfirmPlan(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد طلب تغيير الباقة</DialogTitle></DialogHeader>
          {confirmPlan && (
            <div className="space-y-3 text-sm">
              <p>سيتم إرسال طلب للترقية إلى الباقة <span className="font-semibold">{confirmPlan.name}</span> بقيمة <span className="font-semibold">{formatCurrency(yearly ? confirmPlan.yearlyPrice : confirmPlan.monthlyPrice)}</span> {yearly ? 'سنوياً' : 'شهرياً'}.</p>
              <p className="text-muted-foreground">سيقوم فريق الإدارة بمراجعة الطلب وتفعيل الباقة الجديدة بعد تأكيد الدفع.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPlan(null)}>إلغاء</Button>
            <Button
              onClick={() => confirmPlan && requestChange.mutate(confirmPlan)}
              disabled={requestChange.isPending}
            >
              {requestChange.isPending ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Subscription;
