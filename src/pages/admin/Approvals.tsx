import { useMemo, useState } from 'react';
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
import { Check, X, RotateCcw, Trash2, Mail, Phone, Building2, Hourglass, ShieldCheck, ShieldX, Search } from 'lucide-react';
import { usePendingSignups, type PendingSignup, type SignupStatus } from '@/hooks/usePendingSignups';
import { plans as mockPlans } from '@/data/mock';
import { formatCurrency, formatDate } from '@/lib/format';
import { logActivity } from '@/lib/activityLog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const statusMeta: Record<SignupStatus, { label: string; tone: string; icon: typeof Hourglass }> = {
  pending: { label: 'بانتظار المراجعة', tone: 'bg-warning/15 text-warning', icon: Hourglass },
  approved: { label: 'مُعتمد', tone: 'bg-success/15 text-success', icon: ShieldCheck },
  declined: { label: 'مرفوض', tone: 'bg-destructive/15 text-destructive', icon: ShieldX },
};

const ApproveDialog = ({
  open, onOpenChange, signup, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signup: PendingSignup | null;
  onConfirm: (planId: string, cycle: 'monthly' | 'yearly' | 'trial', trialDays: number) => void;
}) => {
  const [planId, setPlanId] = useState(mockPlans.find(p => p.popular)?.id ?? mockPlans[0]?.id ?? '');
  const [cycle, setCycle] = useState<'monthly' | 'yearly' | 'trial'>('monthly');
  const [trialDays, setTrialDays] = useState(14);

  const plan = mockPlans.find(p => p.id === planId);
  const amount = cycle === 'trial' ? 0 : cycle === 'yearly' ? (plan?.yearlyPrice ?? 0) : (plan?.monthlyPrice ?? 0);

  if (!signup) return null;

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
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mockPlans.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatCurrency(p.monthlyPrice)} / شهر
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => onConfirm(planId, cycle, trialDays)} disabled={!planId}>
            <Check className="h-4 w-4 ml-1" /> اعتماد وتفعيل
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
  onConfirm: (reason: string) => void;
}) => {
  const [reason, setReason] = useState('');
  if (!signup) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReason(''); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفض {signup.companyName}</DialogTitle>
          <DialogDescription>سبب الرفض سيُسجَّل في سجل التدقيق ويُرسل (لاحقاً) للعميل.</DialogDescription>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason.trim() || 'بدون سبب محدد')}>
            <X className="h-4 w-4 ml-1" /> رفض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SignupCard = ({
  signup, onApprove, onDecline, onReset, onRemove,
}: {
  signup: PendingSignup;
  onApprove: (s: PendingSignup) => void;
  onDecline: (s: PendingSignup) => void;
  onReset: (s: PendingSignup) => void;
  onRemove: (s: PendingSignup) => void;
}) => {
  const meta = statusMeta[signup.status];
  const Icon = meta.icon;
  const planName = mockPlans.find(p => p.id === signup.planId)?.name;

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
        <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {signup.email}</div>
        {signup.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {signup.phone}</div>}
        <div className="text-xs text-muted-foreground">طلب بتاريخ {formatDate(signup.requestedAt)}</div>
      </div>

      {signup.status === 'approved' && planName && (
        <div className="rounded-lg bg-success/5 border border-success/20 p-2.5 text-xs mb-3">
          مُعتمد على باقة <b>{planName}</b> ({signup.cycle === 'yearly' ? 'سنوي' : signup.cycle === 'trial' ? `تجربة ${signup.trialDays} يوماً` : 'شهري'})
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
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onReset(signup)}>
              <RotateCcw className="h-4 w-4 ml-1" /> إعادة للمراجعة
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onRemove(signup)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
};

const Approvals = () => {
  const { signups, approve, decline, reset, remove } = usePendingSignups();
  const [tab, setTab] = useState<SignupStatus | 'all'>('pending');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<PendingSignup | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);

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

  const handleApproveConfirm = (planId: string, cycle: 'monthly' | 'yearly' | 'trial', trialDays: number) => {
    if (!target) return;
    approve(target.id, { planId, cycle, trialDays });
    const planName = mockPlans.find(p => p.id === planId)?.name ?? planId;
    logActivity({
      module: 'user', action: 'grant',
      description: `اعتماد تسجيل ${target.companyName} على باقة «${planName}» (${cycle === 'yearly' ? 'سنوي' : cycle === 'trial' ? `تجربة ${trialDays} يوماً` : 'شهري'})`,
      userName: 'مالك المنصة', userEmail: 'owner@oneclick.sa',
    });
    toast.success(`تم اعتماد ${target.companyName}`);
    setApproveOpen(false);
    setTarget(null);
  };

  const handleDeclineConfirm = (reason: string) => {
    if (!target) return;
    decline(target.id, { reason });
    logActivity({
      module: 'user', action: 'revoke',
      description: `رفض تسجيل ${target.companyName} — السبب: ${reason}`,
      userName: 'مالك المنصة', userEmail: 'owner@oneclick.sa',
    });
    toast.success('تم رفض الطلب');
    setDeclineOpen(false);
    setTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="طلبات تسجيل الشركات"
        description="راجع طلبات الانضمام الجديدة، اعتمد العميل وعيّن له الباقة، أو ارفض الطلب مع توضيح السبب"
      />

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
          {filtered.length === 0 ? (
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
                  onApprove={(x) => { setTarget(x); setApproveOpen(true); }}
                  onDecline={(x) => { setTarget(x); setDeclineOpen(true); }}
                  onReset={(x) => { reset(x.id); toast.success('أُعيد الطلب للمراجعة'); }}
                  onRemove={(x) => { remove(x.id); toast.success('تم حذف الطلب'); }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ApproveDialog open={approveOpen} onOpenChange={(v) => { setApproveOpen(v); if (!v) setTarget(null); }} signup={target} onConfirm={handleApproveConfirm} />
      <DeclineDialog open={declineOpen} onOpenChange={(v) => { setDeclineOpen(v); if (!v) setTarget(null); }} signup={target} onConfirm={handleDeclineConfirm} />
    </div>
  );
};

export default Approvals;
