import { useState, useSyncExternalStore } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Ban, CheckCircle2, Mail, Copy, RefreshCw, X, Clock, Send } from 'lucide-react';
import type { User, Role } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { roleLabel, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useUsers } from '@/hooks/entities';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { RoleMatrix } from '@/components/common/RoleMatrix';
import { useAuth } from '@/lib/auth';
import {
  createInvitation, getInvitations, getInvitationsForCompany,
  subscribeInvitations, buildInviteUrl, revokeInvitation, resendInvitation,
  type Invitation,
} from '@/lib/invitations';

const empty: User = { id: '', name: '', email: '', role: 'sales', disabled: false };

const inviteEmpty = { email: '', fullName: '', phone: '', role: 'sales' as Role };

const Users = () => {
  const { list, save, remove, apiOn } = useUsers();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User>(empty);
  const [password, setPassword] = useState('');

  // ---------- Invite flow ----------
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState(inviteEmpty);
  const [createdInvite, setCreatedInvite] = useState<Invitation | null>(null);

  useSyncExternalStore(subscribeInvitations, getInvitations, getInvitations);
  const companyId = user?.companyId ?? 'co-1';
  const invitations: (Invitation & { id: string })[] = getInvitationsForCompany(companyId).map((i) => ({ ...i, id: i.token }));

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

  const toggleDisabled = async (u: User) => {
    const next: User = { ...u, disabled: !u.disabled };
    if (apiOn) {
      try {
        await api.patch(`/api/users/${u.id}/status`, { disabled: next.disabled });
        qc.invalidateQueries({ queryKey: ['users'] });
        toast.success(next.disabled ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
        return;
      } catch { /* fall through */ }
    }
    await save(next);
    toast.success(next.disabled ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
  };

  // ---------- Invitations ----------
  const sendInvite = () => {
    const email = invite.email.trim().toLowerCase();
    const fullName = invite.fullName.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('بريد إلكتروني غير صالح');
    if (fullName.length < 2) return toast.error('أدخل الاسم الكامل');
    if (list.some((u) => u.email.toLowerCase() === email && u.companyId === companyId)) {
      return toast.error('يوجد مستخدم بهذا البريد فعلًا');
    }
    const inv = createInvitation({
      email, fullName, phone: invite.phone.trim() || undefined,
      role: invite.role, companyId, invitedBy: user?.id ?? 'system',
    });
    setCreatedInvite(inv);
    setInviteOpen(false);
    setInvite(inviteEmpty);
    toast.success('تم إرسال الدعوة عبر البريد الإلكتروني');
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token));
      toast.success('تم نسخ رابط الدعوة');
    } catch {
      toast.error('تعذّر النسخ');
    }
  };

  const userColumns: Column<User>[] = [
    { key: 'name', header: 'الاسم', cell: (r) => (
      <span className={r.disabled ? 'font-medium text-muted-foreground line-through' : 'font-medium'}>{r.name}</span>
    )},
    { key: 'email', header: 'البريد', cell: (r) => <span className="text-muted-foreground text-sm" dir="ltr">{r.email}</span> },
    { key: 'phone', header: 'الهاتف', cell: (r) => <span dir="ltr" className="text-sm">{r.phone || '—'}</span> },
    { key: 'role', header: 'الدور', cell: (r) => <StatusBadge status="active" label={roleLabel(r.role)} /> },
    { key: 'status', header: 'الحالة', cell: (r) => (
      <div className="flex items-center gap-2">
        <Switch checked={!r.disabled} onCheckedChange={() => toggleDisabled(r)} aria-label={r.disabled ? 'تفعيل' : 'تعطيل'} />
        <span className={`text-xs ${r.disabled ? 'text-destructive' : 'text-success'}`}>{r.disabled ? 'معطّل' : 'نشط'}</span>
      </div>
    )},
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    )},
  ];

  const inviteStatusBadge = (s: Invitation['status']) => {
    const map: Record<Invitation['status'], { label: string; cls: string }> = {
      pending:  { label: 'بانتظار القبول', cls: 'bg-warning/10 text-warning border-warning/20' },
      accepted: { label: 'تم القبول',     cls: 'bg-success/10 text-success border-success/20' },
      revoked:  { label: 'ملغاة',          cls: 'bg-muted text-muted-foreground border-border' },
      expired:  { label: 'منتهية',          cls: 'bg-destructive/10 text-destructive border-destructive/20' },
    };
    const v = map[s];
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${v.cls}`}>{v.label}</span>;
  };

  const inviteColumns: Column<Invitation & { id: string }>[] = [
    { key: 'email', header: 'البريد', cell: (r) => <span dir="ltr" className="text-sm font-medium">{r.email}</span> },
    { key: 'fullName', header: 'الاسم', cell: (r) => <span className="text-sm">{r.fullName}</span> },
    { key: 'role', header: 'الدور', cell: (r) => <StatusBadge status="active" label={roleLabel(r.role)} /> },
    { key: 'status', header: 'الحالة', cell: (r) => inviteStatusBadge(r.status) },
    { key: 'invitedAt', header: 'أُرسلت', cell: (r) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(r.invitedAt)}</span> },
    { key: 'expiresAt', header: 'تنتهي', cell: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1">
        <Clock className="h-3 w-3" /> {formatDateShort(r.expiresAt)}
      </span>
    )},
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex gap-1">
        {r.status === 'pending' && (
          <>
            <Button variant="ghost" size="icon" title="نسخ رابط الدعوة" onClick={() => copyLink(r.token)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="إعادة إرسال" onClick={() => { const v = resendInvitation(r.token); if (v) { setCreatedInvite(v); toast.success('تم إعادة إرسال الدعوة'); } }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="إلغاء الدعوة" onClick={() => { revokeInvitation(r.token); toast.success('تم إلغاء الدعوة'); }}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
        {(r.status === 'expired' || r.status === 'revoked') && (
          <Button variant="ghost" size="sm" onClick={() => { const v = resendInvitation(r.token); if (v) { setCreatedInvite(v); toast.success('تم إعادة الإرسال'); } }}>
            <RefreshCw className="h-3.5 w-3.5 ml-1" /> إعادة الإرسال
          </Button>
        )}
      </div>
    )},
  ];

  const pendingCount = invitations.filter((i) => i.status === 'pending').length;

  return (
    <div>
      <PageHeader
        title="المستخدمون والصلاحيات"
        description="أدر فريق شركتك وأرسل دعوات الانضمام"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setInvite(inviteEmpty); setInviteOpen(true); }}>
              <Mail className="h-4 w-4 ml-1.5" /> دعوة مستخدم
            </Button>
            <Button onClick={() => { setEditing({ ...empty, id: `u-${Date.now()}` }); setPassword(''); setOpen(true); }}>
              <Plus className="h-4 w-4 ml-1" /> مستخدم جديد
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="team" className="mt-2">
        <TabsList>
          <TabsTrigger value="team">الفريق</TabsTrigger>
          <TabsTrigger value="invitations" className="gap-1.5">
            الدعوات
            {pendingCount > 0 && <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="matrix">مصفوفة الصلاحيات</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-4">
          <DataTable data={list} columns={userColumns} searchKeys={['name','email']} />
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          <DataTable data={invitations} columns={inviteColumns} searchKeys={['email','fullName']} />
          {invitations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد دعوات بعد. اضغط «دعوة مستخدم» لإرسال أول دعوة.</p>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <RoleMatrix />
        </TabsContent>
      </Tabs>

      {/* ----- Existing user create/edit dialog ----- */}
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
                <Switch checked={!editing.disabled} onCheckedChange={(v) => setEditing((s) => ({ ...s, disabled: !v }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Invite dialog ----- */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>دعوة مستخدم جديد</DialogTitle>
            <DialogDescription>
              سنرسل رابط دعوة إلى البريد الإلكتروني. عند فتحه، سيكمل المستخدم بياناته ويعيّن كلمة المرور بنفسه.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>البريد الإلكتروني</Label>
              <Input className="mt-1.5" type="email" dir="ltr" value={invite.email}
                onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                placeholder="user@company.com" maxLength={120} />
            </div>
            <div>
              <Label>الاسم الكامل</Label>
              <Input className="mt-1.5" value={invite.fullName}
                onChange={(e) => setInvite((s) => ({ ...s, fullName: e.target.value }))}
                maxLength={80} />
            </div>
            <div>
              <Label>رقم الجوال <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Input className="mt-1.5" dir="ltr" value={invite.phone}
                onChange={(e) => setInvite((s) => ({ ...s, phone: e.target.value }))}
                placeholder="+25XXXXXXXX" maxLength={20} />
            </div>
            <div className="sm:col-span-2">
              <Label>الدور والصلاحيات</Label>
              <Select value={invite.role} onValueChange={(v: Role) => setInvite((s) => ({ ...s, role: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_admin">مدير الشركة</SelectItem>
                  <SelectItem value="accountant">محاسب</SelectItem>
                  <SelectItem value="sales">مبيعات</SelectItem>
                  <SelectItem value="viewer">مشاهدة فقط</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">يمكنك تغيير الدور لاحقًا من شاشة الفريق.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>إلغاء</Button>
            <Button onClick={sendInvite}><Send className="h-4 w-4 ml-1.5" /> إرسال الدعوة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Created invite confirmation (simulates "sent email" + link) ----- */}
      <Dialog open={!!createdInvite} onOpenChange={(o) => !o && setCreatedInvite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> تم إرسال الدعوة
            </DialogTitle>
            <DialogDescription>
              أُرسل بريد إلى <span dir="ltr" className="font-semibold text-foreground">{createdInvite?.email}</span> يحتوي رابط تفعيل صالح لمدة 7 أيام.
            </DialogDescription>
          </DialogHeader>
          {createdInvite && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground mb-1.5">رابط الدعوة (للمشاركة المباشرة):</div>
                <div className="flex items-center gap-2">
                  <Input dir="ltr" readOnly value={buildInviteUrl(createdInvite.token)} className="text-xs bg-background" />
                  <Button size="icon" variant="outline" onClick={() => copyLink(createdInvite.token)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 في وضع العرض الحالي، يمكنك فتح الرابط مباشرة لاختبار تجربة المستخدم المدعو.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedInvite(null)}>إغلاق</Button>
            {createdInvite && (
              <Button asChild>
                <a href={buildInviteUrl(createdInvite.token)} target="_blank" rel="noreferrer">معاينة صفحة القبول</a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
