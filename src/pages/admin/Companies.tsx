import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { companies as initial, plans } from '@/data/mock';
import type { Company } from '@/types';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, PowerOff } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { companyStatusLabel, formatDateShort } from '@/lib/format';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const empty: Company = { id: '', name: '', ownerName: '', email: '', phone: '', status: 'active', planId: 'plan-basic', createdAt: new Date().toISOString() };

const Companies = () => {
  const [list, setList] = useState<Company[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Company>(empty);

  const save = () => {
    if (!editing.name || !editing.email) return toast.error('أكمل البيانات');
    setList(prev => {
      const exists = prev.find(x => x.id === editing.id);
      return exists ? prev.map(x => x.id === editing.id ? editing : x) : [editing, ...prev];
    });
    setOpen(false);
    toast.success('تم الحفظ');
  };
  const toggleSuspend = (c: Company) => {
    setList(prev => prev.map(x => x.id === c.id ? { ...x, status: x.status === 'suspended' ? 'active' : 'suspended' } : x));
    toast.success('تم تحديث الحالة');
  };

  const columns: Column<Company>[] = [
    { key: 'name', header: 'الشركة', cell: r => <span className="font-medium">{r.name}</span> },
    { key: 'owner', header: 'المسؤول', cell: r => r.ownerName },
    { key: 'email', header: 'البريد', cell: r => <span className="text-muted-foreground text-sm">{r.email}</span> },
    { key: 'plan', header: 'الباقة', cell: r => plans.find(p => p.id === r.planId)?.name ?? '—' },
    { key: 'created', header: 'التسجيل', cell: r => formatDateShort(r.createdAt) },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} label={companyStatusLabel(r.status)} /> },
    { key: 'actions', header: '', cell: r => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => toggleSuspend(r)}><PowerOff className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="الشركات" description="إدارة الشركات المسجلة على المنصة"
        actions={<Button onClick={() => { setEditing({ ...empty, id: `co-${Date.now()}` }); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> شركة جديدة</Button>} />
      <DataTable data={list} columns={columns} searchKeys={['name','email','ownerName']} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>شركة</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>اسم الشركة</Label><Input className="mt-1.5" value={editing.name} onChange={e => setEditing(s => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>المسؤول</Label><Input className="mt-1.5" value={editing.ownerName} onChange={e => setEditing(s => ({ ...s, ownerName: e.target.value }))} /></div>
            <div><Label>البريد</Label><Input className="mt-1.5" value={editing.email} onChange={e => setEditing(s => ({ ...s, email: e.target.value }))} /></div>
            <div><Label>الهاتف</Label><Input className="mt-1.5" value={editing.phone} onChange={e => setEditing(s => ({ ...s, phone: e.target.value }))} /></div>
            <div>
              <Label>الباقة</Label>
              <Select value={editing.planId} onValueChange={v => setEditing(s => ({ ...s, planId: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>الحالة</Label>
              <Select value={editing.status} onValueChange={(v: any) => setEditing(s => ({ ...s, status: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="suspended">موقوفة</SelectItem>
                  <SelectItem value="expired">منتهية</SelectItem>
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

export default Companies;
