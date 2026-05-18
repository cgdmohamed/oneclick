import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Check, X, RotateCcw, Trash2, Mail, Phone, Building2, Hourglass, ShieldCheck, ShieldX, Search, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { usePendingSignups, type PendingSignup, type SignupStatus } from '@/hooks/usePendingSignups';
import { api, isApiConfigured } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  is_active: boolean;
}

const statusMeta: Record<SignupStatus, { label: string; tone: string; icon: typeof Hourglass }> = {
  pending: { label: 'بانتظار المراجعة', tone: 'bg-warning/15 text-warning', icon: Hourglass },
  approved: { label: 'مُعتمد', tone: 'bg-success/15 text-success', icon: ShieldCheck },
  declined: { label: 'مرفوض', tone: 'bg-destructive/15 text-destructive', icon: ShieldX },
};

const ApproveDialog = ({
  open, onOpenChange, signup, plans, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signup: PendingSignup | null;
  plans: Plan[];
  onConfirm: (planId: string, cycle: 'monthly' | 'yearly' | 'trial', trialDays: number, amount: number) => Promise<void>;
}) => {
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly' | 'trial'>('monthly');
  const [trialDays, setTrialDays] = useState(14);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && plans.length) {
      setPlanId(plans[0].id);
    }
  }, [open, plans]);

  const plan = plans.find(p => p.id === planId);
  const amount = cycle === 'trial' ? 0
    : cycle === 'yearly' ? (plan?.price_yearly ?? 0)
    : (plan?.price_monthly ?? 0);

  if (!signup) return null;

  const handleConfirm = async () => {
    if (!planId) return;
    setBusy(true);
    try { await onConfirm(planId, cycle, trialDays, amount); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>اعتماد {signup.companyName}</DialogTitle>
          <DialogDescription>اختر الباقة ودورة الفوترة لتفعيل الحساب.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>الباقة</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الباقة..." /></SelectTrigger>
              <SelectContent>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatCurrency(p.price_monthly)} / شهر
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>دورة الفوترة</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {(['monthly', 'yearly', 'trial'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={cn(
                    'rounded-lg border p-3 text-sm text-center transition-colors',
                    cycle === c ? 'border-primary bg-primary/5 font-semibold' : 'border-border hover:bg-muted',
                  )}
                >
                  {c === 'monthly' ? 'شهري' : c === 'yearly' ? 'سنوي' : 'تجريبي'}
                </button>
              ))}
            </div>
          </div>
          {cycle === 'trial' && (
            <div>
              <Label>مدة التجربة (أيام)</Label>
              <Input type="number" min={1} max={90} value={trialDays} onChange={e => setTrialDays(+e.target.value || 14)} className="mt-1.5" />
            </div>
          )}
          <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">قيمة الاشتراك</span>
            <span className="font-bold">{cycle === 'trial' ? `تجربة ${trialDays} يوماً` : formatCurrency(amount)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>إلغاء</Button>
          <Button onClick={handleConfirm} disabled={!planId || busy}>
            {busy ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Check className="h-4 w-4 ml-1" />}
            اعتماد وتفعيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeclineDialog = ({
  open, onOpenChange, signup, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signup: PendingSignup | null;
  onConfirm: (reason: string) => Promise<void>;
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!signup) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(reason.trim() || 'بدون سبب محدد'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReason(''); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفض {signup.companyName}</DialogTitle>
          <DialogDescription>سبب الرفض سيُسجَّل في سجل التدقيق.</DialogDescription>
        </DialogHeader>
        <div>
          <Label>سبب الرفض</Label>
          <Textarea
            className="mt-1.5"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="مثال: بيانات غير مكتملة أو مكررة..."
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {['بيانات غير مكتملة', 'بريد غير صالح', 'حساب مكرر', 'مشتبه به'].map(r => (
              <Button key={r} type="button" size="sm" variant="outline" onClick={() => setReason(r)}>{r}</Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>إلغاء</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <X className="h-4 w-4 ml-1" />}
            رفض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SignupCard = ({
  signup, plans, onApprove, onDecline, onReset, onRemove,
}: {
  signup: PendingSignup;
  plans: Plan[];
  onApprove: (s: PendingSignup) => void;
  onDecline: (s: PendingSignup) => void;
  onReset: (s: PendingSignup) => void;
  onRemove: (s: PendingSignup) => void;
}) => {
  const meta = statusMeta[signup.status];
  const Icon = meta.icon;
  const planName = signup.planName ?? plans.find(p => p.id === signup.planId)?.name;

  return (
    <Card dir="rtl" className="p-4 border-border/60 shadow-soft text-start">
      <div className="flex items-start gap-3 mb-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            <Building2 className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold truncate">{signup.companyName}</div>
            <Badge variant="secondary" className={cn('border-0', meta.tone)}>
              <Icon className="h-3 w-3 ml-1" /> {meta.label}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5 truncate">المسؤول: {signup.ownerName}</div>
        </div>
      </div>

      <div className="space-y-1 text-sm mb-3">
        <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{signup.email}</span>
          {signup.emailVerifiedAt ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success bg-success/10 rounded-full px-1.5 py-0.5">
              <CheckCircle2 className="h-3 w-3" /> موثّق
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-warning bg-warning/10 rounded-full px-1.5 py-0.5">
              <AlertTriangle className="h-3 w-3" /> غير موثّق
            </span>
          )}
        </div>
        {signup.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {signup.phone}</div>}
        <div className="text-xs text-muted-foreground">طلب بتاريخ {formatDate(signup.requestedAt)}</div>
      </div>

      {signup.status === 'approved' && planName && (
        <div className="rounded-lg bg-success/5 border border-success/20 p-2.5 text-xs mb-3">
          مُعتمد على باقة <b>{planName}</b>
          {signup.reviewedAt && <span className="text-muted-foreground"> • {formatDate(signup.reviewedAt)}</span>}
        </div>
      )}
      {signup.status === 'declined' && (
        <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-2.5 text-xs mb-3">
          <b>سبب الرفض:</b> {signup.reason}
          {signup.reviewedAt && <span className="text-muted-foreground block mt-1">{formatDate(signup.reviewedAt)}</span>}
        </div>
      )}

      <div className="flex gap-2">
        {signup.status === 'pending' ? (
          <>
            <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => onApprove(signup)}>
              <Check className="h-4 w-4 ml-1" /> اعتماد
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => onDecline(signup)}>
              <X className="h-4 w-4 ml-1" /> رفض
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" title="حذف الطلب نهائياً" onClick={() => onRemove(signup)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onReset(signup)}>
            <RotateCcw className="h-4 w-4 ml-1" /> إعادة للمراجعة
          </Button>
        )}
      </div>
    </Card>
  );
};

const Approvals = () => {
  const { signups, loading, approve, decline, reset, remove } = usePendingSignups();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [hasPlans, setHasPlans] = useState<boolean | null>(null);
  const [tab, setTab] = useState<SignupStatus | 'all'>('pending');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<PendingSignup | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PendingSignup | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!isApiConfigured()) return;
    api.get<{ hasPlans: boolean }>('/api/platform/plans/health')
      .then(r => setHasPlans(r.hasPlans))
      .catch(() => setHasPlans(null));
    api.get<{ data: Plan[] }>('/api/plans/all')
      .then(r => setPlans(r.data.filter(p => p.is_active)))
      .catch(() => {
        api.get<{ data: Plan[] }>('/api/plans')
          .then(r => setPlans(r.data))
          .catch(() => {});
      });
  }, []);

  const stats = useMemo(() => ({
    pending: signups.filter(s => s.status === 'pending').length,
    approved: signups.filter(s => s.status === 'approved').length,
    declined: signups.filter(s => s.status === 'declined').length,
    total: signups.length,
  }), [signups]);

  const filtered = useMemo(() => {
    return signups.filter(s => {
      if (tab !== 'all' && s.status !== tab) return false;
      if (!q) return true;
      const n = q.toLowerCase();
      return s.companyName.toLowerCase().includes(n) || s.ownerName.toLowerCase().includes(n) || s.email.toLowerCase().includes(n);
    });
  }, [signups, tab, q]);

  const handleApproveConfirm = async (planId: string, cycle: 'monthly' | 'yearly' | 'trial', trialDays: number, amount: number) => {
    if (!target) return;
    try {
      await approve(target.id, { planId, cycle, trialDays, amount });
      toast.success(`تم اعتماد ${target.companyName}`);
      setApproveOpen(false);
      setTarget(null);
    } catch (e) {
      toast.error((e as Error).message ?? 'فشل الاعتماد');
    }
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (!target) return;
    try {
      await decline(target.id, { reason });
      toast.success('تم رفض الطلب');
      setDeclineOpen(false);
      setTarget(null);
    } catch (e) {
      toast.error((e as Error).message ?? 'فشل الرفض');
    }
  };

  return (
    <div>
      <PageHeader
        title="طلبات تسجيل الشركات"
        description="راجع طلبات الانضمام الجديدة، اعتمد العميل وعيّن له الباقة، أو ارفض الطلب مع توضيح السبب"
      />

      {hasPlans === false && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm" dir="rtl">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-warning">لم يتم إضافة أي باقات بعد — الاعتمادات ستفشل</p>
            <p className="text-muted-foreground mt-0.5">
              لا يمكن اعتماد الشركات بدون باقات مُضافة. أضف باقة واحدة على الأقل من{' '}
              <a href="/admin/plans" className="underline text-foreground hover:text-primary">صفحة الباقات</a>{' '}
              قبل اعتماد أي طلب.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="بانتظار المراجعة" value={stats.pending} icon={Hourglass} accent="warning" />
        <StatCard title="مُعتمد" value={stats.approved} icon={ShieldCheck} accent="success" />
        <StatCard title="مرفوض" value={stats.declined} icon={ShieldX} accent="destructive" />
        <StatCard title="إجمالي الطلبات" value={stats.total} icon={Building2} accent="primary" />
      </div>

      <Tabs dir="rtl" value={tab} onValueChange={(v) => setTab(v as SignupStatus | 'all')}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <TabsList>
            <TabsTrigger value="pending">
              قيد المراجعة{stats.pending > 0 && <Badge variant="secondary" className="mr-1.5 bg-warning/20 text-warning">{stats.pending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approved">المعتمدة</TabsTrigger>
            <TabsTrigger value="declined">المرفوضة</TabsTrigger>
            <TabsTrigger value="all">الكل</TabsTrigger>
          </TabsList>
          <div className="relative w-72 max-w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم/البريد/الشركة..." className="pr-9" />
          </div>
        </div>

        <TabsContent value={tab}>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Hourglass className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">لا توجد طلبات في هذا التبويب.</p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(s => (
                <SignupCard
                  key={s.id}
                  signup={s}
                  plans={plans}
                  onApprove={(x) => { setTarget(x); setApproveOpen(true); }}
                  onDecline={(x) => { setTarget(x); setDeclineOpen(true); }}
                  onReset={async (x) => {
                    try { await reset(x.id); toast.success('أُعيد الطلب للمراجعة'); }
                    catch (e) { toast.error((e as Error).message); }
                  }}
                  onRemove={(x) => { setRemoveTarget(x); setRemoveOpen(true); }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ApproveDialog
        open={approveOpen}
        onOpenChange={(v) => { setApproveOpen(v); if (!v) setTarget(null); }}
        signup={target}
        plans={plans}
        onConfirm={handleApproveConfirm}
      />
      <DeclineDialog
        open={declineOpen}
        onOpenChange={(v) => { setDeclineOpen(v); if (!v) setTarget(null); }}
        signup={target}
        onConfirm={handleDeclineConfirm}
      />

      <AlertDialog open={removeOpen} onOpenChange={(v) => { setRemoveOpen(v); if (!v) setRemoveTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف طلب التسجيل</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف طلب شركة <b>{removeTarget?.companyName}</b> نهائياً؟
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!removeTarget) return;
                setRemoving(true);
                try {
                  await remove(removeTarget.id);
                  toast.success('تم حذف الطلب');
                  setRemoveOpen(false);
                  setRemoveTarget(null);
                } catch (e) {
                  toast.error((e as Error).message ?? 'فشل الحذف');
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Approvals;
