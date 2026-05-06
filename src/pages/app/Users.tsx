import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Check } from 'lucide-react';
import { users as initial, rolePermissions } from '@/data/mock';
import type { User, Role } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { roleLabel } from '@/lib/format';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/common/StatusBadge';

const empty: User = { id: '', name: '', email: '', role: 'sales', companyId: 'co-1' };

const Users = () => {
  const companyUsers = initial.filter(u => u.role !== 'super_admin');
  const [list, setList] = useState<User[]>(companyUsers);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User>(empty);

  const save = () => {
    if (!editing.name || !editing.email) return toast.error('أكمل البيانات');
    setList(prev => {
      const exists = prev.find(x => x.id === editing.id);
      return exists ? prev.map(x => x.id === editing.id ? editing : x) : [editing, ...prev];
    });
    setOpen(false);
    toast.success('تم الحفظ');
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'الاسم', cell: r => <span className="font-medium">{r.name}</span> },
    { key: 'email', header: 'البريد', cell: r => <span className="text-muted-foreground text-sm">{r.email}</span> },
    { key: 'phone', header: 'الهاتف', cell: r => <span dir="ltr" className="text-sm">{r.phone || '—'}</span> },
    { key: 'role', header: 'الدور', cell: r => <StatusBadge status="active" label={roleLabel(r.role)} /> },
    { key: 'actions', header: '', cell: r => (
      <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
    )},
  ];

  return (
    <div>
      <PageHeader title="المستخدمون والصلاحيات" description="إدارة فريقك والأدوار"
        actions={<Button onClick={() => { setEditing({ ...empty, id: `u-${Date.now()}` }); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> مستخدم جديد</Button>} />

      <DataTable data={list} columns={columns} searchKeys={['name','email']} />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {(['company_admin','accountant','sales','viewer'] as Role[]).map(r => (
          <Card key={r} className="p-5 border-border/60">
            <div className="font-semibold mb-3">{roleLabel(r)}</div>
            <ul className="space-y-2 text-sm">
              {rolePermissions[r].map((p, i) => (
                <li key={i} className="flex items-start gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span>{p}</span></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>مستخدم</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>الاسم</Label><Input className="mt-1.5" value={editing.name} onChange={e => setEditing(s => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>البريد</Label><Input className="mt-1.5" value={editing.email} onChange={e => setEditing(s => ({ ...s, email: e.target.value }))} /></div>
            <div><Label>الهاتف</Label><Input className="mt-1.5" value={editing.phone ?? ''} onChange={e => setEditing(s => ({ ...s, phone: e.target.value }))} /></div>
            <div><Label>الدور</Label>
              <Select value={editing.role} onValueChange={(v: any) => setEditing(s => ({ ...s, role: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_admin">مدير الشركة</SelectItem>
                  <SelectItem value="accountant">محاسب</SelectItem>
                  <SelectItem value="sales">مبيعات</SelectItem>
                  <SelectItem value="viewer">مشاهدة فقط</SelectItem>
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

export default Users;
