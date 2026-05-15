import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Ban, CheckCircle2 } from 'lucide-react';
import type { User, Role } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { roleLabel } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useUsers } from '@/hooks/entities';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { RoleMatrix } from '@/components/common/RoleMatrix';

const empty: User = { id: '', name: '', email: '', role: 'sales', disabled: false };

const Users = () => {
  const { list, save, remove, apiOn } = useUsers();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User>(empty);
  const [password, setPassword] = useState('');

  const isCreate = !list.find((x) => x.id === editing.id);

  const handleSave = async () => {
    if (!editing.name || !editing.email) return toast.error('أكمل البيانات');
    if (apiOn && isCreate) {
      if (!password || password.length < 8) return toast.error('كلمة المرور 8 أحرف على الأقل');
      try {
        await api.post('/api/users', {
          email: editing.email, name: editing.name, role: editing.role, password,
        });
        toast.success('تم الحفظ');
        qc.invalidateQueries({ queryKey: ['users'] });
        setOpen(false); setPassword('');
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
      }
      return;
    }
    await save(editing);
    setOpen(false); setPassword('');
  };

  /** Enable/disable a sub-account. Mock-mode persists locally;
   *  in API mode we attempt PATCH and silently fall back. */
  const toggleDisabled = async (u: User) => {
    const next: User = { ...u, disabled: !u.disabled };
    if (apiOn) {
      try {
        await api.patch(`/api/users/${u.id}/status`, { disabled: next.disabled });
        qc.invalidateQueries({ queryKey: ['users'] });
        toast.success(next.disabled ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
        return;
      } catch {
        // fall through to local update so the UI reflects intent
      }
    }
    await save(next);
    toast.success(next.disabled ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'الاسم', cell: (r) => (
      <div className="flex items-center gap-2">
        <span className={r.disabled ? 'font-medium text-muted-foreground line-through' : 'font-medium'}>{r.name}</span>
      </div>
    )},
    { key: 'email', header: 'البريد', cell: (r) => <span className="text-muted-foreground text-sm">{r.email}</span> },
    { key: 'phone', header: 'الهاتف', cell: (r) => <span dir="ltr" className="text-sm">{r.phone || '—'}</span> },
    { key: 'role', header: 'الدور', cell: (r) => <StatusBadge status="active" label={roleLabel(r.role)} /> },
    { key: 'status', header: 'الحالة', cell: (r) => (
      <div className="flex items-center gap-2">
        <Switch
          checked={!r.disabled}
          onCheckedChange={() => toggleDisabled(r)}
          aria-label={r.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
        />
        <span className={`text-xs ${r.disabled ? 'text-destructive' : 'text-success'}`}>
          {r.disabled ? 'معطّل' : 'نشط'}
        </span>
      </div>
    )},
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          title={r.disabled ? 'تفعيل' : 'تعطيل'}
          onClick={() => toggleDisabled(r)}
        >
          {r.disabled
            ? <CheckCircle2 className="h-4 w-4 text-success" />
            : <Ban className="h-4 w-4 text-muted-foreground" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="المستخدمون والصلاحيات" description="إدارة فريقك والأدوار"
        actions={<Button onClick={() => { setEditing({ ...empty, id: `u-${Date.now()}` }); setPassword(''); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> مستخدم جديد</Button>} />

      <Tabs defaultValue="team" className="mt-2">
        <TabsList>
          <TabsTrigger value="team">الفريق</TabsTrigger>
          <TabsTrigger value="matrix">مصفوفة الصلاحيات</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-4">
          <DataTable data={list} columns={columns} searchKeys={['name','email']} />
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <RoleMatrix />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>مستخدم</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>الاسم</Label><Input className="mt-1.5" value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>البريد</Label><Input className="mt-1.5" value={editing.email} onChange={(e) => setEditing((s) => ({ ...s, email: e.target.value }))} /></div>
            <div><Label>الهاتف</Label><Input className="mt-1.5" value={editing.phone ?? ''} onChange={(e) => setEditing((s) => ({ ...s, phone: e.target.value }))} /></div>
            <div><Label>الدور</Label>
              <Select value={editing.role} onValueChange={(v: Role) => setEditing((s) => ({ ...s, role: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_admin">مدير الشركة</SelectItem>
                  <SelectItem value="accountant">محاسب</SelectItem>
                  <SelectItem value="sales">مبيعات</SelectItem>
                  <SelectItem value="viewer">مشاهدة فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {apiOn && isCreate && (
              <div className="sm:col-span-2">
                <Label>كلمة المرور</Label>
                <Input type="password" className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" />
              </div>
            )}
            {!isCreate && (
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div>
                  <div className="text-sm font-medium">تفعيل الحساب</div>
                  <div className="text-xs text-muted-foreground">عند التعطيل لن يتمكن المستخدم من تسجيل الدخول.</div>
                </div>
                <Switch
                  checked={!editing.disabled}
                  onCheckedChange={(v) => setEditing((s) => ({ ...s, disabled: !v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
