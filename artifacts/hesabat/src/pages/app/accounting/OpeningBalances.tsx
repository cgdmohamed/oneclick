import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Building2, FileText, Package, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { JournalEntry } from './types';

const sum = <T,>(rows: T[], getter: (row: T) => number) => rows.reduce((total, row) => total + getter(row), 0);

const OpeningBalances = () => {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generated, setGenerated] = useState<JournalEntry | null>(null);
  const [running, setRunning] = useState(false);

  const customers = useQuery({
    queryKey: ['customer-ledger-summary'],
    queryFn: async () => (await api.get<{ data: Array<{ outstanding: string | number }> }>('/api/reports/customer-ledger')).data ?? [],
  });
  const suppliers = useQuery({
    queryKey: ['supplier-ledger-summary'],
    queryFn: async () => (await api.get<{ data: Array<{ outstanding: string | number }> }>('/api/reports/supplier-ledger')).data ?? [],
  });
  const accounts = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: async () => (await api.get<{ data: Array<{ balance: string | number }> }>('/api/reports/accounts-summary')).data ?? [],
  });
  const inventory = useQuery({
    queryKey: ['inventory-valuation-summary'],
    queryFn: async () => (await api.get<{ summary?: { total_value?: string | number } }>('/api/reports/inventory')).summary,
  });

  const customerOutstanding = sum(customers.data ?? [], (r) => Number(r.outstanding));
  const supplierOutstanding = sum(suppliers.data ?? [], (r) => Number(r.outstanding));
  const financialBalances = sum(accounts.data ?? [], (r) => Number(r.balance));
  const inventoryValue = Number(inventory.data?.total_value ?? 0);

  const runMigration = async () => {
    setRunning(true);
    try {
      const res = await api.post<{ data: JournalEntry }>('/api/accounting/migration/opening-balances', {
        entry_date: entryDate,
        mark_legacy: true,
      });
      setGenerated(res.data);
      toast.success('تم إنشاء قيد الأرصدة الافتتاحية');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر إنشاء الأرصدة الافتتاحية');
    } finally {
      setRunning(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="الأرصدة الافتتاحية" description="مراجعة بيانات النظام الحالية وإنشاء قيد افتتاحي بعد التأكيد" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="أرصدة العملاء" value={formatCurrency(customerOutstanding)} icon={Users} accent="info" />
        <StatCard title="أرصدة الموردين" value={formatCurrency(supplierOutstanding)} icon={Building2} accent="warning" />
        <StatCard title="الحسابات المالية" value={formatCurrency(financialBalances)} icon={FileText} accent="success" />
        <StatCard title="قيمة المخزون" value={formatCurrency(inventoryValue)} icon={Package} accent="primary" />
      </div>
      <Card className="p-4 border-border/60 space-y-4">
        <div className="max-w-xs">
          <Label>تاريخ قيد الافتتاح</Label>
          <Input className="mt-1.5" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          سيقوم النظام بإنشاء قيد افتتاحي واحد للشركة بناءً على أرصدة الحسابات المالية، الذمم المدينة، الذمم الدائنة، وقيمة المخزون الحالية. لن يتم تنفيذ أي ترحيل قبل التأكيد.
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={running}>{running ? 'جار التنفيذ...' : 'إنشاء قيد الأرصدة الافتتاحية'}</Button>
      </Card>
      {generated && (
        <Card className="p-4 border-success/40 bg-success/5">
          <div className="font-semibold">تم إنشاء القيد</div>
          <Link className="text-primary text-sm" to={`/app/accounting/journals/${generated.id}`}>{generated.number}</Link>
        </Card>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إنشاء الأرصدة الافتتاحية</AlertDialogTitle>
            <AlertDialogDescription>سيتم إنشاء قيد يومية وترميز المعاملات غير المرحلة كبيانات قديمة. راجع الملخص قبل المتابعة.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={runMigration}>تأكيد وإنشاء القيد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OpeningBalances;
