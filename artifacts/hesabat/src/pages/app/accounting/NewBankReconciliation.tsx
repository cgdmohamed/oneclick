import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { BankReconciliation } from './types';

interface Account { id: string; name: string; type: 'cash' | 'bank' | 'wallet'; bank_name?: string | null; balance: string | number }

const NewBankReconciliation = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ account_id: '', statement_date: new Date().toISOString().slice(0, 10), opening_balance: '', closing_balance: '', notes: '' });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<{ data: Account[] }>('/api/accounts?page_size=300')).data ?? [],
  });
  const submit = async () => {
    try {
      const res = await api.post<{ data: BankReconciliation }>('/api/bank-reconciliations', {
        account_id: form.account_id,
        statement_date: form.statement_date,
        opening_balance: form.opening_balance === '' ? null : Number(form.opening_balance),
        closing_balance: Number(form.closing_balance || 0),
        notes: form.notes || null,
      });
      toast.success('تم إنشاء تسوية البنك');
      navigate(`/app/accounting/bank-reconciliations/${res.data.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر إنشاء التسوية');
    }
  };
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/bank-reconciliations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة لتسويات البنك</Link>
      <PageHeader title="تسوية بنك جديدة" description="اختر حساباً بنكياً وأدخل رصيد كشف البنك بالجنيه المصري" />
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>الحساب البنكي</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))}><option value="">اختر حساباً بنكياً</option>{(accounts.data ?? []).filter((a) => a.type === 'bank').map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` - ${a.bank_name}` : ''}</option>)}</select></div>
          <div><Label>تاريخ كشف البنك</Label><Input className="mt-1.5" type="date" value={form.statement_date} onChange={(e) => setForm((p) => ({ ...p, statement_date: e.target.value }))} /></div>
          <div><Label>الرصيد الافتتاحي اختياري</Label><Input className="mt-1.5" type="number" value={form.opening_balance} onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))} /></div>
          <div><Label>رصيد الإقفال في كشف البنك</Label><Input className="mt-1.5" type="number" value={form.closing_balance} onChange={(e) => setForm((p) => ({ ...p, closing_balance: e.target.value }))} /></div>
          <div className="md:col-span-2"><Label>ملاحظات</Label><Textarea className="mt-1.5" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end mt-5"><Button onClick={submit}>إنشاء التسوية</Button></div>
      </Card>
    </div>
  );
};

export default NewBankReconciliation;
