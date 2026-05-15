/**
 * Super-admin: manage the wallets that receive subscription payments.
 * Add new wallets, rename, change type, toggle active, delete (when unused).
 * Backed by /api/platform/wallets when API is configured; otherwise falls
 * back to in-memory state for the preview.
 */
import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wallet, Building2, CreditCard, Pencil, Trash2, ListOrdered } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { accountTypeLabel, formatCurrency, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useResource } from '@/hooks/useResource';
import { api, isApiConfigured } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

interface WalletRow {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'wallet';
  balance: string | number;
  is_active: boolean;
}

interface PlatformWallet {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'wallet';
  balance: number;
  status: 'active' | 'inactive';
}

const seed: PlatformWallet[] = [
  { id: 'pw-1', name: 'الخزنة الرئيسية', type: 'cash', balance: 0, status: 'active' },
  { id: 'pw-2', name: 'الراجحي - تحصيلات الاشتراكات', type: 'bank', balance: 0, status: 'active' },
  { id: 'pw-3', name: 'STC Pay', type: 'wallet', balance: 0, status: 'active' },
];

const empty: PlatformWallet = { id: '', name: '', type: 'cash', balance: 0, status: 'active' };
const iconFor = (t: string) => (t === 'bank' ? Building2 : t === 'wallet' ? CreditCard : Wallet);

const PlatformWallets = () => {
  const { list, save, remove } = useResource<PlatformWallet, WalletRow>({
    path: '/api/platform/wallets',
    key: 'platform-wallets',
    initial: seed,
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      balance: Number(r.balance),
      status: r.is_active ? 'active' : 'inactive',
    }),
    toRow: (w) => ({
      name: w.name,
      type: w.type,
      balance: w.balance,
      is_active: w.status !== 'inactive',
    }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformWallet>(empty);

  const submit = async () => {
    if (!editing.name.trim()) return toast.error('أدخل اسم المحفظة');
    await save(editing);
    setOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="محافظ التحصيل"
        description="المحافظ والحسابات التي تستقبل دفعات اشتراكات الشركات يدوياً"
        actions={
          <Button onClick={() => { setEditing({ ...empty, id: `pw-${Date.now()}` }); setOpen(true); }}>
            <Plus className="h-4 w-4 ml-1" /> محفظة جديدة
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((w) => {
          const Icon = iconFor(w.type);
          return (
            <Card key={w.id} className="p-5 border-border/60 shadow-soft">
              <div className="flex items-start justify-between">
                <div className="flex gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{accountTypeLabel(w.type)}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(w); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(w.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">الرصيد المُحصَّل</div>
                  <div className="text-2xl font-bold">{formatCurrency(w.balance)}</div>
                </div>
                <StatusBadge status={w.status} />
              </div>
            </Card>
          );
        })}
        {list.length === 0 && (
          <Card className="col-span-full p-8 text-center text-muted-foreground">
            لا توجد محافظ بعد — أضف أول محفظة لاستقبال تحصيلات الاشتراكات.
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>محفظة تحصيل</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الاسم</Label>
              <Input className="mt-1.5" value={editing.name}
                onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <Label>النوع</Label>
              <Select value={editing.type}
                onValueChange={(v: 'cash' | 'bank' | 'wallet') => setEditing((s) => ({ ...s, type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">خزنة</SelectItem>
                  <SelectItem value="bank">حساب بنكي</SelectItem>
                  <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الرصيد الافتتاحي</Label>
              <Input type="number" className="mt-1.5" value={editing.balance}
                onChange={(e) => setEditing((s) => ({ ...s, balance: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>الحالة</Label>
              <Select value={editing.status}
                onValueChange={(v: 'active' | 'inactive') => setEditing((s) => ({ ...s, status: v }))}>
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
            <Button onClick={submit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformWallets;
