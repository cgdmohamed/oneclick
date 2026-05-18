import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { subscriptions as mockSubs, companies as mockCompanies, plans as mockPlans } from '@/data/mock';
import type { Subscription } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface SubRow {
  id: string; company_id: string; plan_id: string;
  status: string; started_at: string; expires_at: string | null;
  amount: string | number;
  company_name?: string; plan_name?: string;
  paid_total?: string | number;
}
interface WalletRow {
  id: string; name: string; type: 'cash' | 'bank' | 'wallet'; is_active: boolean;
}
interface PlanRow {
  id: string; code: string; name: string;
  price_monthly: string | number; price_yearly: string | number;
  is_active: boolean;
}

interface UISubscription {
  id: string; companyId: string; planId: string;
  companyName: string; planName: string;
  startDate: string; endDate: string;
  amount: number; status: 'active' | 'expired' | 'suspended' | 'trialing';
  paid: boolean;
}

const Subscriptions = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();

  const subsQuery = useQuery({
    enabled: apiOn,
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const r = await api.get<{ data: SubRow[] }>('/api/subscriptions');
      return r.data;
    },
  });
  const walletsQuery = useQuery({
    enabled: apiOn,
    queryKey: ['platform-wallets'],
    queryFn: async () => {
      const r = await api.get<{ data: WalletRow[] }>('/api/platform/wallets');
      return r.data.filter((w) => w.is_active);
    },
  });
  const plansQuery = useQuery({
    enabled: apiOn,
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const r = await api.get<{ data: PlanRow[] }>('/api/plans/all');
      return r.data.filter((p) => p.is_active);
    },
  });

  const data: UISubscription[] = useMemo(() => {
    if (apiOn) {
      return (subsQuery.data ?? []).map((r) => ({
        id: r.id,
        companyId: r.company_id,
        planId: r.plan_id,
        companyName: r.company_name ?? '—',
        planName: r.plan_name ?? '—',
        startDate: r.started_at,
        endDate: r.expires_at ?? r.started_at,
        amount: Number(r.amount ?? 0),
        status: (['active', 'expired', 'suspended', 'trialing'].includes(r.status)
          ? r.status
          : 'active') as UISubscription['status'],
        paid: Number(r.paid_total ?? 0) >= Number(r.amount ?? 0) && Number(r.amount ?? 0) > 0,
      }));
    }
    return mockSubs.map((s: Subscription) => ({
      id: s.id,
      companyId: s.companyId,
      planId: s.planId,
      companyName: mockCompanies.find((c) => c.id === s.companyId)?.name ?? '—',
      planName: mockPlans.find((p) => p.id === s.planId)?.name ?? '—',
      startDate: s.startDate,
      endDate: s.endDate,
      amount: s.amount,
      status: (s.status === 'expired' ? 'expired' : s.status === 'suspended' ? 'suspended' : 'active'),
      paid: s.paid,
    }));
  }, [apiOn, subsQuery.data]);

  /* ---- Record payment dialog ---- */
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<UISubscription | null>(null);
  const [walletId, setWalletId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<'cash' | 'bank' | 'wallet'>('cash');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (target) {
      setAmount(target.amount);
      setReference('');
      setMethod('cash');
      const wallets = walletsQuery.data ?? [];
      setWalletId(wallets[0]?.id ?? '');
    }
  }, [target, walletsQuery.data]);

  const startRecord = (s: UISubscription) => { setTarget(s); setOpen(true); };

  const submit = async () => {
    if (!target) return;
    if (amount <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    if (apiOn) {
      if (!walletId) return toast.error('اختر محفظة التحصيل');
      try {
        await api.post('/api/platform/subscription-payments', {
          subscription_id: target.id,
          wallet_id: walletId,
          amount,
          method,
          reference: reference || null,
        });
        toast.success('تم تسجيل الدفعة');
        qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
        qc.invalidateQueries({ queryKey: ['admin-subscription-payments'] });
        qc.invalidateQueries({ queryKey: ['platform-wallets'] });
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر تسجيل الدفعة');
        return;
      }
    } else {
      toast.success('تم تسجيل الدفعة (وضع المعاينة)');
    }
    setOpen(false);
  };

  /* ---- Change Plan dialog ---- */
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<UISubscription | null>(null);
  const [newPlanId, setNewPlanId] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly' | 'trial'>('monthly');
  const [newAmount, setNewAmount] = useState<number>(0);

  const openChangePlan = (s: UISubscription) => {
    setChangePlanTarget(s);
    setNewPlanId(s.planId);
    setCycle('monthly');
    setNewAmount(s.amount);
    setChangePlanOpen(true);
  };

  useEffect(() => {
    if (changePlanOpen && newPlanId && plansQuery.data) {
      const plan = plansQuery.data.find(p => p.id === newPlanId);
      if (plan) {
        setNewAmount(cycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly));
      }
    }
  }, [newPlanId, cycle, changePlanOpen, plansQuery.data]);

  const changePlanMut = useMutation({
    mutationFn: async () => {
      if (!changePlanTarget) return;
      if (!newPlanId) throw new Error('اختر الباقة الجديدة');
      if (apiOn) {
        return api.patch(`/api/subscriptions/${changePlanTarget.id}/plan`, {
          plan_id: newPlanId,
          cycle,
          amount: newAmount,
        });
      }
    },
    onSuccess: () => {
      toast.success('تم تغيير الباقة بنجاح');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      setChangePlanOpen(false);
      setChangePlanTarget(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر تغيير الباقة'),
  });

  const columns: Column<UISubscription>[] = [
    { key: 'company', header: 'الشركة', cell: (r) => <span className="font-medium">{r.companyName}</span> },
    { key: 'plan',    header: 'الباقة', cell: (r) => r.planName },
    { key: 'start',   header: 'البداية', cell: (r) => formatDateShort(r.startDate) },
    { key: 'end',     header: 'النهاية', cell: (r) => formatDateShort(r.endDate) },
    { key: 'amount',  header: 'القيمة',  cell: (r) => formatCurrency(r.amount) },
    { key: 'status',  header: 'الحالة',  cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions', header: '', cell: (r) => (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={r.paid} onClick={() => startRecord(r)}>
            {r.paid ? 'مدفوع' : 'تسجيل دفعة'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openChangePlan(r)}>
            تغيير الباقة
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="الاشتراكات" description="ربط الشركات بالباقات وتسجيل المدفوعات اليدوية" />
      <DataTable data={data} columns={columns} searchKeys={['companyName', 'planName']} />

      {/* Record payment dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تسجيل دفعة اشتراك</DialogTitle></DialogHeader>
          {target && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/40 p-3 text-sm flex justify-between">
                <span className="text-muted-foreground">{target.companyName} — {target.planName}</span>
                <span className="font-semibold">{formatCurrency(target.amount)}</span>
              </div>
              <div>
                <Label>محفظة التحصيل</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر محفظة" /></SelectTrigger>
                  <SelectContent>
                    {(walletsQuery.data ?? []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                    {(walletsQuery.data ?? []).length === 0 && (
                      <SelectItem value="none" disabled>لا توجد محافظ — أنشئها من صفحة محافظ التحصيل</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>طريقة الدفع</Label>
                  <Select value={method} onValueChange={(v: 'cash' | 'bank' | 'wallet') => setMethod(v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدي</SelectItem>
                      <SelectItem value="bank">تحويل بنكي</SelectItem>
                      <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المبلغ</Label>
                  <Input type="number" className="mt-1.5" value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <Label>مرجع / ملاحظة</Label>
                <Input className="mt-1.5" value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="رقم العملية، اسم البنك..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={apiOn && (walletsQuery.data ?? []).length === 0}>تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan dialog */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>تغيير باقة الاشتراك</DialogTitle></DialogHeader>
          {changePlanTarget && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">الشركة: </span>
                <span className="font-semibold">{changePlanTarget.companyName}</span>
                <span className="text-muted-foreground mr-3">الباقة الحالية: </span>
                <span className="font-semibold">{changePlanTarget.planName}</span>
              </div>
              <div>
                <Label>الباقة الجديدة</Label>
                <Select value={newPlanId} onValueChange={setNewPlanId}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الباقة" /></SelectTrigger>
                  <SelectContent>
                    {(plansQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                    {(plansQuery.data ?? []).length === 0 && (
                      <SelectItem value="none" disabled>لا توجد باقات مفعّلة</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>دورة الفوترة</Label>
                <Select value={cycle} onValueChange={(v: 'monthly' | 'yearly' | 'trial') => setCycle(v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري (30 يوم)</SelectItem>
                    <SelectItem value="yearly">سنوي (365 يوم)</SelectItem>
                    <SelectItem value="trial">تجريبي (14 يوم)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>قيمة الاشتراك</Label>
                <Input type="number" className="mt-1.5" value={newAmount}
                  onChange={(e) => setNewAmount(Number(e.target.value))} min={0} />
              </div>
              <p className="text-xs text-muted-foreground">
                سيتم إلغاء الاشتراك الحالي وإنشاء اشتراك جديد بالباقة المختارة فوراً.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => changePlanMut.mutate()}
              disabled={changePlanMut.isPending || !newPlanId}
            >
              تأكيد التغيير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Subscriptions;
