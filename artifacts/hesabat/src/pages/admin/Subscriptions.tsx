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
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

  const columns: Column<UISubscription>[] = [
    { key: 'company', header: 'الشركة', cell: (r) => <span className="font-medium">{r.companyName}</span> },
    { key: 'plan',    header: 'الباقة', cell: (r) => r.planName },
    { key: 'start',   header: 'البداية', cell: (r) => formatDateShort(r.startDate) },
    { key: 'end',     header: 'النهاية', cell: (r) => formatDateShort(r.endDate) },
    { key: 'amount',  header: 'القيمة',  cell: (r) => formatCurrency(r.amount) },
    { key: 'status',  header: 'الحالة',  cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions', header: '', cell: (r) => (
        <Button variant="outline" size="sm" disabled={r.paid} onClick={() => startRecord(r)}>
          {r.paid ? 'مدفوع' : 'تسجيل دفعة يدوية'}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="الاشتراكات" description="ربط الشركات بالباقات وتسجيل المدفوعات اليدوية" />
      <DataTable data={data} columns={columns} searchKeys={['companyName', 'planName']} />

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
    </div>
  );
};

export default Subscriptions;
