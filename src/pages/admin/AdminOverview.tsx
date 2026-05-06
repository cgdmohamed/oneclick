import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Building2, CheckCircle2, XCircle, Wallet, AlertTriangle } from 'lucide-react';
import { companies, subscriptions } from '@/data/mock';
import { formatCurrency, formatDateShort, companyStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';

const AdminOverview = () => {
  const active = subscriptions.filter(s => s.status === 'active').length;
  const expired = subscriptions.filter(s => s.status === 'expired').length;
  const totalCollected = subscriptions.filter(s => s.paid).reduce((s, x) => s + x.amount, 0);
  const overdue = companies.filter(c => c.status === 'expired').length;

  return (
    <div>
      <PageHeader title="لوحة المشرف العام" description="نظرة شاملة على منصة حسابات" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="عدد الشركات" value={companies.length} icon={Building2} accent="primary" />
        <StatCard title="اشتراكات نشطة" value={active} icon={CheckCircle2} accent="success" />
        <StatCard title="اشتراكات منتهية" value={expired} icon={XCircle} accent="destructive" />
        <StatCard title="إجمالي التحصيلات" value={formatCurrency(totalCollected)} icon={Wallet} accent="info" />
        <StatCard title="شركات متأخرة" value={overdue} icon={AlertTriangle} accent="warning" />
      </div>

      <Card className="p-5 mt-6 border-border/60 shadow-soft">
        <h3 className="font-semibold mb-4">آخر الشركات المسجلة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold">الشركة</th>
                <th className="py-2 font-semibold">المسؤول</th>
                <th className="py-2 font-semibold">البريد</th>
                <th className="py-2 font-semibold">تاريخ التسجيل</th>
                <th className="py-2 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {companies.slice(0, 6).map(c => (
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
