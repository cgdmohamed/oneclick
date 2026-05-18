import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Building2, CheckCircle2, XCircle, Wallet, AlertTriangle, X, MailX } from 'lucide-react';
import { companies as mockCompanies, subscriptions as mockSubs } from '@/data/mock';
import { formatCurrency, formatDateShort, companyStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { api, isApiConfigured } from '@/lib/api';

interface StatsResp {
  companies: { total: number; active: number; suspended: number };
  subscriptions: { active: number; expired: number; trialing: number };
  revenue_total: number;
}
interface CompanyRow {
  id: string; name: string; email: string | null;
  is_active: boolean; created_at: string;
  owner_name: string | null;
}

const AdminOverview = () => {
  const apiOn = isApiConfigured();
  const [smtpDismissed, setSmtpDismissed] = useState(false);

  const stats = useQuery({
    enabled: apiOn,
    queryKey: ['admin-stats'],
    queryFn: async () => (await api.get<{ data: StatsResp }>('/api/platform/stats')).data,
  });
  const companies = useQuery({
    enabled: apiOn,
    queryKey: ['admin-companies'],
    queryFn: async () => (await api.get<{ data: CompanyRow[] }>('/api/platform/companies')).data,
  });
  const smtpStatus = useQuery({
    enabled: apiOn,
    queryKey: ['admin-smtp-status'],
    queryFn: async () => (await api.get<{ configured: boolean }>('/api/platform/settings/smtp-status')),
    staleTime: 5 * 60 * 1000,
  });

  const total = apiOn ? (stats.data?.companies.total ?? 0) : mockCompanies.length;
  const active = apiOn ? (stats.data?.subscriptions.active ?? 0) : mockSubs.filter(s => s.status === 'active').length;
  const expired = apiOn ? (stats.data?.subscriptions.expired ?? 0) : mockSubs.filter(s => s.status === 'expired').length;
  const collected = apiOn ? (stats.data?.revenue_total ?? 0) : mockSubs.filter(s => s.paid).reduce((s, x) => s + x.amount, 0);
  const suspended = apiOn ? (stats.data?.companies.suspended ?? 0) : mockCompanies.filter(c => c.status === 'expired').length;

  const smtpNotConfigured = apiOn && smtpStatus.data?.configured === false && !smtpDismissed;

  const recent = apiOn
    ? (companies.data ?? []).slice(0, 6).map((c) => ({
        id: c.id, name: c.name, ownerName: c.owner_name ?? '—',
        email: c.email ?? '', createdAt: c.created_at,
        status: c.is_active ? 'active' as const : 'suspended' as const,
      }))
    : mockCompanies.slice(0, 6).map((c) => ({
        id: c.id, name: c.name, ownerName: c.ownerName, email: c.email,
        createdAt: c.createdAt, status: c.status,
      }));

  return (
    <div>
      <PageHeader title="لوحة المشرف العام" description="نظرة شاملة على منصة ون كليك" />

      {smtpNotConfigured && (
        <div className="flex items-start gap-3 mb-5 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900" dir="rtl">
          <MailX className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
          <div className="flex-1">
            <span className="font-semibold">إرسال البريد الإلكتروني معطّل</span>
            {' — '}
            لم يتم تهيئة خادم SMTP. لن تُرسل رسائل إعادة تعيين كلمة المرور والإشعارات البريدية حتى يتم ضبط الإعدادات.
          </div>
          <button
            onClick={() => setSmtpDismissed(true)}
            className="shrink-0 rounded p-1 hover:bg-yellow-100 transition-colors"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="عدد الشركات" value={total} icon={Building2} accent="primary" />
        <StatCard title="اشتراكات نشطة" value={active} icon={CheckCircle2} accent="success" />
        <StatCard title="اشتراكات منتهية" value={expired} icon={XCircle} accent="destructive" />
        <StatCard title="إجمالي التحصيلات" value={formatCurrency(collected)} icon={Wallet} accent="info" />
        <StatCard title="شركات موقوفة" value={suspended} icon={AlertTriangle} accent="warning" />
      </div>

      <Card className="p-5 mt-6 border-border/60 shadow-soft">
        <h3 className="font-semibold mb-4">آخر الشركات المسجلة</h3>
        <div className="overflow-x-auto">
          <table dir="rtl" className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold">الشركة</th>
                <th className="py-2 font-semibold">المسؤول</th>
                <th className="py-2 font-semibold">البريد</th>
                <th className="py-2 font-semibold">تاريخ التسجيل</th>
                <th className="py-2 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(c => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3">{c.ownerName}</td>
                  <td className="py-3 text-muted-foreground">{c.email}</td>
                  <td className="py-3 text-muted-foreground">{formatDateShort(c.createdAt)}</td>
                  <td className="py-3"><StatusBadge status={c.status} label={companyStatusLabel(c.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminOverview;
