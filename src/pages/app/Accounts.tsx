import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wallet, Building2, CreditCard, Pencil } from 'lucide-react';
import { accounts as initial } from '@/data/mock';
import type { FinancialAccount } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { accountTypeLabel, formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';

const empty: FinancialAccount = { id: '', companyId: 'co-1', name: '', type: 'cash', balance: 0, status: 'active' };
const iconFor = (t: string) => t === 'bank' ? Building2 : t === 'wallet' ? CreditCard : Wallet;

const Accounts = () => {
  const [list, setList] = useState<FinancialAccount[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount>(empty);

  const save = () => {
    if (!editing.name) return toast.error('أدخل اسم الحساب');
    setList(prev => {
      const exists = prev.find(x => x.id === editing.id);
      return exists ? prev.map(x => x.id === editing.id ? editing : x) : [editing, ...prev];
    });
    setOpen(false);
    toast.success('تم الحفظ');
  };

  return (
    <div>
      <PageHeader title="الحسابات المالية" description="خزائنك وحساباتك البنكية ومحافظك"
        actions={<Button onClick={() => { setEditing({ ...empty, id: `ac-${Date.now()}` }); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> حساب جديد</Button>} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(a => {
          const Icon = iconFor(a.type);
          return (
            <Card key={a.id} className="p-5 border-border/60 shadow-soft">
              <div className="flex items-start justify-between">
                <div className="flex gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{accountTypeLabel(a.type)}</div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setEditing(a); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">الرصيد الحالي</div>
                  <div className="text-2xl font-bold">{formatCurrency(a.balance)}</div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>حساب مالي</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>الاسم</Label><Input className="mt-1.5" value={editing.name} onChange={e => setEditing(s => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>النوع</Label>
              <Select value={editing.type} onValueChange={(v: any) => setEditing(s => ({ ...s, type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">خزنة</SelectItem>
                  <SelectItem value="bank">حساب بنكي</SelectItem>
                  <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>الرصيد</Label><Input type="number" className="mt-1.5" value={editing.balance} onChange={e => setEditing(s => ({ ...s, balance: Number(e.target.value) }))} /></div>
            <div><Label>الحالة</Label>
              <Select value={editing.status} onValueChange={(v: any) => setEditing(s => ({ ...s, status: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Accounts;
