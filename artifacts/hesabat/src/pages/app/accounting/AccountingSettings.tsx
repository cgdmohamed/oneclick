import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { AlertTriangle, CheckCircle2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import type { ChartAccount } from './types';

const fields = [
  ['accounts_receivable_account_id', 'Accounts Receivable', 'حساب العملاء / الذمم المدينة'],
  ['accounts_payable_account_id', 'Accounts Payable', 'حساب الموردين / الذمم الدائنة'],
  ['sales_revenue_account_id', 'Sales Revenue', 'إيرادات المبيعات'],
  ['sales_vat_account_id', 'Sales VAT / VAT Payable', 'ضريبة المخرجات / ضريبة مستحقة'],
  ['purchase_vat_account_id', 'Purchase VAT / VAT Input', 'ضريبة المدخلات'],
  ['inventory_account_id', 'Inventory', 'المخزون'],
  ['cogs_account_id', 'Cost of Goods Sold', 'تكلفة البضاعة المباعة'],
  ['cash_account_id', 'Cash', 'الصندوق'],
  ['bank_account_id', 'Bank', 'البنك'],
  ['wallet_account_id', 'Wallet', 'المحفظة'],
  ['general_expenses_account_id', 'General Expenses', 'مصروفات عامة'],
  ['retained_earnings_account_id', 'Retained Earnings / Opening Balance Equity', 'الأرباح المبقاة / حقوق افتتاحية'],
  ['inventory_adjustment_account_id', 'Inventory Adjustment', 'تسويات المخزون'],
] as const;

type SettingsRow = Record<(typeof fields)[number][0], string | null> & { company_id: string };

const AccountingSettings = () => {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [],
  });
  const { data: settings } = useQuery({
    queryKey: ['accounting-settings'],
    queryFn: async () => (await api.get<{ data: SettingsRow }>('/api/accounting/settings')).data,
  });
  const [local, setLocal] = useState<Partial<SettingsRow>>({});
  const values = { ...(settings ?? {}), ...local } as Partial<SettingsRow>;
  const missing = useMemo(() => fields.filter(([key]) => !values[key]), [values]);

  const initialize = async () => {
    await api.post('/api/accounting/initialize');
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['accounting-settings'] }),
      qc.invalidateQueries({ queryKey: ['chart-accounts'] }),
    ]);
    toast.success('تم تجهيز الإعدادات الافتراضية');
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/accounting/settings', local);
      await qc.invalidateQueries({ queryKey: ['accounting-settings'] });
      setLocal({});
      toast.success('تم حفظ إعدادات المحاسبة');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="إعدادات المحاسبة"
        description="ربط الحسابات الافتراضية التي تستخدمها عمليات الترحيل"
        actions={<Button variant="outline" onClick={initialize}><Settings className="h-4 w-4 ml-1" /> تجهيز الافتراضيات</Button>}
      />
      {missing.length ? (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>إعدادات المحاسبة غير مكتملة</AlertTitle>
          <AlertDescription>يجب اختيار كل الحسابات الافتراضية قبل الاعتماد على الترحيل التلقائي.</AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-success/40 bg-success/10">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>إعدادات المحاسبة مكتملة</AlertTitle>
          <AlertDescription>يمكن للفواتير والتحصيلات والمصروفات والمشتريات إنشاء قيود يومية.</AlertDescription>
        </Alert>
      )}
      <Card className="p-4 border-border/60">
        <div className="grid lg:grid-cols-2 gap-4">
          {fields.map(([key, english, arabic]) => (
            <div key={key}>
              <Label>{arabic}</Label>
              <div className="text-xs text-muted-foreground mb-1">{english}</div>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={values[key] ?? ''}
                onChange={(e) => setLocal((p) => ({ ...p, [key]: e.target.value || null }))}
              >
                <option value="">اختر حساباً</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <Button onClick={save} disabled={saving || Object.keys(local).length === 0}>{saving ? 'جار الحفظ...' : 'حفظ الإعدادات'}</Button>
        </div>
      </Card>
    </div>
  );
};

export default AccountingSettings;
