import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { companies as mockCompanies, plans as mockPlans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Pencil, PowerOff } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { companyStatusLabel, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

interface CompanyRow {
  id: string; name: string; email: string | null; phone: string | null;
  is_active: boolean; review_status: string | null; created_at: string;
  owner_name: string | null; plan_name: string | null; sub_status: string | null;
}

interface CompanyDetail {
  id: string; name: string; email: string | null; review_status: string | null;
  review_notes: string | null; plan_id: string | null; plan_name: string | null;
  sub_status: string | null; sub_amount: string | null; billing_cycle: string | null;
}

interface PlanRow {
  id: string; name: string; price_monthly: string; price_yearly: string;
  is_active: boolean;
}

interface UICompany {
  id: string; name: string; email: string; ownerName: string;
  planName: string; createdAt: string; status: 'active' | 'suspended' | 'expired';
  reviewStatus: string | null;
}

function reviewStatusLabel(s: string | null): string {
  switch (s) {
    case 'approved': return 'مقبولة';
    case 'pending':  return 'بانتظار المراجعة';
    case 'declined': return 'مرفوضة';
    default: return s ?? '—';
  }
}

const REVIEW_STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 border-green-200',
  pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  declined: 'bg-red-100 text-red-800 border-red-200',
};

const ReviewBadge = ({ status }: { status: string | null }) => {
  const cls = REVIEW_STATUS_COLORS[status ?? ''] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {reviewStatusLabel(status)}
    </span>
  );
};

/* ---- Edit Company Modal ---- */
interface EditModalProps {
  company: UICompany;
  onClose: () => void;
  onSaved: (updated: Partial<UICompany>) => void;
}

const EditCompanyModal = ({ company, onClose, onSaved }: EditModalProps) => {
  const detailQ = useQuery({
    queryKey: ['admin-company-detail', company.id],
    queryFn: async () =>
      (await api.get<{ data: CompanyDetail }>(`/api/platform/companies/${company.id}`)).data,
  });

  const plansQ = useQuery({
    queryKey: ['admin-plans-all'],
    queryFn: async () =>
      (await api.get<{ data: PlanRow[] }>('/api/plans/all')).data,
  });

  const detail = detailQ.data;
  const plans = plansQ.data ?? [];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly' | 'trial'>('monthly');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!detail) return;
    setName(detail.name);
    setEmail(detail.email ?? '');
    setReviewStatus(detail.review_status ?? 'pending');
    setPlanId(detail.plan_id ?? '');
    setCycle((detail.billing_cycle as 'monthly' | 'yearly' | 'trial' | null) ?? 'monthly');
    setAmount(detail.sub_amount ? String(parseFloat(detail.sub_amount)) : '0');
  }, [detail]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];

      const detailsChanged =
        name.trim() !== detail.name || email.trim() !== (detail.email ?? '');
      if (detailsChanged) {
        tasks.push(
          api.patch(`/api/platform/companies/${company.id}/details`, {
            name: name.trim(),
            email: email.trim() || null,
          }),
        );
      }

      const reviewChanged = reviewStatus !== (detail.review_status ?? 'pending');
      if (reviewChanged) {
        tasks.push(
          api.patch(`/api/platform/companies/${company.id}/review`, {
            review_status: reviewStatus,
          }),
        );
      }

      const originalCycle = (detail.billing_cycle as 'monthly' | 'yearly' | 'trial' | null) ?? 'monthly';
      const originalAmount = detail.sub_amount ? String(parseFloat(detail.sub_amount)) : '0';
      const subChanged =
        (planId && planId !== (detail.plan_id ?? '')) ||
        cycle !== originalCycle ||
        amount !== originalAmount;
      if (subChanged && planId) {
        tasks.push(
          api.patch(`/api/platform/subscriptions/${company.id}/plan`, {
            plan_id: planId,
            cycle,
            amount: parseFloat(amount) || 0,
          }),
        );
      }

      if (!tasks.length) {
        toast.message('لا توجد تغييرات للحفظ');
        setSaving(false);
        return;
      }

      await Promise.all(tasks);
      toast.success('تم حفظ التغييرات');

      const updatedPlanName = plans.find((p) => p.id === planId)?.name ?? company.planName;
      const updatedStatus: UICompany['status'] = reviewChanged
        ? (reviewStatus === 'approved' ? 'active' : 'suspended')
        : company.status;
      onSaved({
        name: detailsChanged ? name.trim() : company.name,
        email: detailsChanged ? (email.trim() || '') : company.email,
        reviewStatus: reviewChanged ? reviewStatus : company.reviewStatus,
        planName: subChanged ? updatedPlanName : company.planName,
        status: updatedStatus,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const loading = detailQ.isLoading || plansQ.isLoading;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل الشركة</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Basic Info */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">المعلومات الأساسية</p>
              <div className="space-y-1">
                <Label htmlFor="co-name">اسم الشركة</Label>
                <Input
                  id="co-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم الشركة"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="co-email">البريد الإلكتروني</Label>
                <Input
                  id="co-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  dir="ltr"
                />
              </div>
            </div>

            <Separator />

            {/* Subscription */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">الاشتراك</p>
              <div className="space-y-1">
                <Label>الباقة</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الباقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>دورة الفوترة</Label>
                <Select value={cycle} onValueChange={(v) => setCycle(v as typeof cycle)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري (30 يوم)</SelectItem>
                    <SelectItem value="yearly">سنوي (365 يوم)</SelectItem>
                    <SelectItem value="trial">تجريبي (14 يوم)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="co-amount">مبلغ الاشتراك</Label>
                <Input
                  id="co-amount"
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  dir="ltr"
                />
              </div>
            </div>

            <Separator />

            {/* Review Status */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">حالة المراجعة</p>
              <RadioGroup
                value={reviewStatus}
                onValueChange={setReviewStatus}
                className="flex flex-col gap-2"
              >
                {[
                  { value: 'approved', label: 'مقبولة', cls: 'text-green-700' },
                  { value: 'pending',  label: 'بانتظار المراجعة', cls: 'text-yellow-700' },
                  { value: 'declined', label: 'مرفوضة', cls: 'text-red-700' },
                ].map(({ value, label, cls }) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`rs-${value}`} />
                    <Label htmlFor={`rs-${value}`} className={`cursor-pointer ${cls}`}>{label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ التغييرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---- Main Companies Page ---- */
const Companies = () => {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<UICompany | null>(null);

  const q = useQuery({
    enabled: apiOn,
    queryKey: ['admin-companies'],
    queryFn: async () => (await api.get<{ data: CompanyRow[] }>('/api/platform/companies')).data,
  });

  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<UICompany>>>({});

  const data: UICompany[] = useMemo(() => {
    const base = apiOn
      ? (q.data ?? []).map((r) => ({
          id: r.id, name: r.name,
          email: r.email ?? '', ownerName: r.owner_name ?? '—',
          planName: r.plan_name ?? '—', createdAt: r.created_at,
          status: !r.is_active
            ? 'suspended' as const
            : (r.sub_status === 'expired' ? 'expired' as const : 'active' as const),
          reviewStatus: r.review_status,
        }))
      : mockCompanies.map((c) => ({
          id: c.id, name: c.name, email: c.email, ownerName: c.ownerName,
          planName: mockPlans.find((p) => p.id === c.planId)?.name ?? '—',
          createdAt: c.createdAt, status: c.status as UICompany['status'],
          reviewStatus: 'approved',
        }));
    return base.map((r) => ({ ...r, ...(localOverrides[r.id] ?? {}) }));
  }, [apiOn, q.data, localOverrides]);

  const toggleMut = useMutation({
    mutationFn: async (c: UICompany) =>
      api.patch(`/api/platform/companies/${c.id}`, { is_active: c.status === 'suspended' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('تم تحديث الحالة');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'تعذّر التحديث'),
  });

  const handleSaved = (id: string, updates: Partial<UICompany>) => {
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), ...updates },
    }));
    qc.invalidateQueries({ queryKey: ['admin-companies'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const columns: Column<UICompany>[] = [
    { key: 'name', header: 'الشركة', cell: r => <span className="font-medium">{r.name}</span> },
    { key: 'owner', header: 'المسؤول', cell: r => r.ownerName },
    { key: 'email', header: 'البريد', cell: r => <span className="text-muted-foreground text-sm">{r.email}</span> },
    { key: 'plan', header: 'الباقة', cell: r => r.planName },
    { key: 'created', header: 'التسجيل', cell: r => formatDateShort(r.createdAt) },
    { key: 'review_status', header: 'حالة المراجعة', cell: r => <ReviewBadge status={r.reviewStatus} /> },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={companyStatusLabel(r.status)} /> },
    { key: 'actions', header: '', cell: r => (
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          title="تعديل"
          onClick={() => apiOn ? setEditTarget(r) : toast.message('فعّل API')}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => apiOn ? toggleMut.mutate(r) : toast.message('فعّل API')}>
          <PowerOff className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="الشركات" description="إدارة الشركات المسجلة على المنصة" />
      <DataTable data={data} columns={columns} searchKeys={['name','email','ownerName']} />

      {editTarget && (
        <EditCompanyModal
          company={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updates) => handleSaved(editTarget.id, updates)}
        />
      )}
    </div>
  );
};

export default Companies;
