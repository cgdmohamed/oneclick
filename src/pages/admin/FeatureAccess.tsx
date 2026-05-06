import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { plans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const features = [
  'إدارة الفواتير', 'إدارة العملاء', 'إدارة المنتجات', 'إدارة المخزون',
  'الحسابات البنكية', 'المحافظ الإلكترونية', 'التقارير المتقدمة', 'تنبيهات SMS',
  'إدارة الصلاحيات', 'API integration',
];

const FeatureAccess = () => {
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>(() => {
    const m: any = {};
    plans.forEach(p => { m[p.id] = {}; features.forEach((f, i) => { m[p.id][f] = i < (p.id === 'plan-basic' ? 4 : p.id === 'plan-pro' ? 7 : 10); }); });
    return m;
  });

  return (
    <div>
      <PageHeader title="الصلاحيات حسب الباقة" description="فعّل أو عطّل الميزات لكل باقة"
        actions={<Button onClick={() => toast.success('تم حفظ الصلاحيات')}>حفظ التغييرات</Button>} />
      <Card className="p-0 overflow-x-auto border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-right text-xs">
              <th className="p-3 font-semibold">الميزة</th>
              {plans.map(p => <th key={p.id} className="p-3 font-semibold text-center">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {features.map(f => (
              <tr key={f} className="border-t border-border/60">
                <td className="p-3 font-medium">{f}</td>
                {plans.map(p => (
                  <td key={p.id} className="p-3 text-center">
                    <Switch checked={matrix[p.id][f]} onCheckedChange={(v) => setMatrix(m => ({ ...m, [p.id]: { ...m[p.id], [f]: v } }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default FeatureAccess;
