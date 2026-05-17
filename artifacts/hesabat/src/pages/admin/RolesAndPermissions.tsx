import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Check, Minus, ShieldCheck, Plus, Pencil, Trash2, Copy, Sparkles, Search } from 'lucide-react';
import { permissionRows, matrixRoles, rolePermissionMap } from '@/data/permissions';
import { users as mockUsers, companies as mockCompanies } from '@/data/mock';
import { roleLabel } from '@/lib/format';
import { useCustomRoles, type CustomRole } from '@/hooks/useCustomRoles';
import { useUserRoleOverrides } from '@/hooks/useUserRoleOverrides';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';

// ---------- Permission Matrix ----------
const PermissionMatrix = ({ customRoles }: { customRoles: CustomRole[] }) => {
  const grouped = useMemo(() => {
    const g: { module: string; rows: typeof permissionRows }[] = [];
    for (const r of permissionRows) {
      const last = g[g.length - 1];
      if (last && last.module === r.module) last.rows.push(r);
      else g.push({ module: r.module, rows: [r] });
    }
    return g;
  }, []);

  const allCols: { id: string; label: string; color?: string; builtin: boolean }[] = [
    ...matrixRoles.map(r => ({ id: r.role, label: r.label, builtin: true })),
    ...customRoles.filter(r => r.enabled).map(r => ({ id: r.id, label: r.name, color: r.color, builtin: false })),
  ];

  const hasPerm = (colId: string, key: string): boolean => {
    if (matrixRoles.some(r => r.role === colId)) return rolePermissionMap[colId as Role]?.has(key) ?? false;
    return customRoles.find(r => r.id === colId)?.permissions.includes(key) ?? false;
  };

  return (
    <Card className="border-border/60 overflow-hidden shadow-soft">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div className="font-semibold">مصفوفة الأدوار والصلاحيات</div>
        <div className="text-xs text-muted-foreground mr-auto">
          {allCols.length} دور × {permissionRows.length} صلاحية
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="bg-muted/40">
            <tr className="border-b border-border/60">
              <th className="text-start font-medium px-4 py-3 w-44">الوحدة</th>
              <th className="text-start font-medium px-4 py-3">الصلاحية</th>
              {allCols.map(c => (
                <th key={c.id} className="text-center font-medium px-3 py-3 whitespace-nowrap">
                  <div className="flex flex-col items-center gap-1">
                    <span>{c.label}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', c.builtin ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                      {c.builtin ? 'افتراضي' : 'مخصص'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(g => g.rows.map((row, idx) => (
              <tr key={row.key} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5 text-muted-foreground">
                  {idx === 0 ? <span className="font-medium text-foreground">{g.module}</span> : ''}
                </td>
                <td className="px-4 py-2.5">{row.action}</td>
                {allCols.map(c => (
                  <td key={c.id} className="px-3 py-2.5 text-center">
                    {hasPerm(c.id, row.key) ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
                        <Minus className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ---------- Role Generator ----------
const PRESETS = [
  { id: 'invoicing-only', label: 'فواتير فقط', perms: ['invoices.view', 'invoices.create', 'invoices.edit', 'clients.view', 'products.view'] },
  { id: 'collector', label: 'محصّل', perms: ['invoices.view', 'payments.view', 'payments.create', 'clients.view'] },
  { id: 'stock-manager', label: 'مسؤول المخزون', perms: ['products.view', 'products.manage'] },
  { id: 'reporter', label: 'تقارير فقط', perms: ['reports.view', 'reports.export', 'invoices.view', 'payments.view'] },
];

const emptyRole = (): CustomRole => ({
  id: `r-${Date.now().toString(36)}`,
  name: '',
  description: '',
  permissions: [],
  color: '#6366f1',
  scope: 'company',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  enabled: true,
});

const RoleEditorDialog = ({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: CustomRole;
  onSave: (r: CustomRole) => void;
}) => {
  const [draft, setDraft] = useState<CustomRole>(() => initial ?? emptyRole());

  const togglePerm = (key: string) => {
    setDraft(d => ({
      ...d,
      permissions: d.permissions.includes(key)
        ? d.permissions.filter(p => p !== key)
        : [...d.permissions, key],
    }));
  };

  const grouped = useMemo(() => {
    const g: { module: string; rows: typeof permissionRows }[] = [];
    for (const r of permissionRows) {
      const last = g[g.length - 1];
      if (last && last.module === r.module) last.rows.push(r);
      else g.push({ module: r.module, rows: [r] });
    }
    return g;
  }, []);

  const applyPreset = (id: string) => {
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    setDraft(d => ({ ...d, permissions: Array.from(new Set([...d.permissions, ...p.perms])) }));
  };

  const cloneFromBuiltin = (role: Role) => {
    setDraft(d => ({ ...d, permissions: Array.from(rolePermissionMap[role] ?? new Set()) }));
  };

  const submit = () => {
    if (!draft.name.trim()) return toast.error('أدخل اسم الدور');
    if (draft.permissions.length === 0) return toast.error('اختر صلاحية واحدة على الأقل');
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'تعديل الدور' : 'منشئ الأدوار'}</DialogTitle>
          <DialogDescription>عرّف دوراً مخصصاً بصلاحيات دقيقة لتطبيقه على مستخدمي المنصة.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>اسم الدور</Label>
              <Input className="mt-1.5" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="مثال: مدير الفرع" />
            </div>
            <div>
              <Label>النطاق</Label>
              <Select value={draft.scope} onValueChange={(v: 'company' | 'platform') => setDraft(d => ({ ...d, scope: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">داخل الشركات</SelectItem>
                  <SelectItem value="platform">على مستوى المنصة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea className="mt-1.5" rows={2} value={draft.description ?? ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="وصف موجز لطبيعة الدور..." />
          </div>

          <div className="rounded-lg border border-border/60 p-3 bg-muted/30 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> اقتراحات سريعة
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <Button key={p.id} type="button" size="sm" variant="outline" onClick={() => applyPreset(p.id)}>
                  + {p.label}
                </Button>
              ))}
              <div className="w-full h-px bg-border my-1" />
              <span className="text-xs text-muted-foreground self-center">انسخ من دور قائم:</span>
              {matrixRoles.map(r => (
                <Button key={r.role} type="button" size="sm" variant="ghost" onClick={() => cloneFromBuiltin(r.role)}>
                  <Copy className="h-3 w-3 ml-1" /> {r.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>الصلاحيات ({draft.permissions.length} / {permissionRows.length})</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" type="button" onClick={() => setDraft(d => ({ ...d, permissions: permissionRows.map(r => r.key) }))}>تحديد الكل</Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setDraft(d => ({ ...d, permissions: [] }))}>مسح</Button>
              </div>
            </div>
            <div className="space-y-3">
              {grouped.map(g => (
                <div key={g.module} className="rounded-lg border border-border/60 p-3">
                  <div className="font-semibold text-sm mb-2">{g.module}</div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {g.rows.map(row => (
                      <label key={row.key} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted">
                        <Checkbox
                          checked={draft.permissions.includes(row.key)}
                          onCheckedChange={() => togglePerm(row.key)}
                        />
                        <span>{row.action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <div className="text-sm font-medium">حالة الدور</div>
              <div className="text-xs text-muted-foreground">إيقاف الدور يمنع تعيينه لمستخدمين جدد</div>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={v => setDraft(d => ({ ...d, enabled: v }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>{initial ? 'حفظ التعديلات' : 'إنشاء الدور'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RoleGenerator = () => {
  const { roles, upsert, remove, toggle } = useCustomRoles();
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [open, setOpen] = useState(false);

  const handleSave = (r: CustomRole) => {
    const existed = roles.some(x => x.id === r.id);
    upsert(r);
    toast.success(existed ? 'تم حفظ الدور' : 'تم إنشاء الدور');
  };

  const handleDelete = (r: CustomRole) => {
    remove(r.id);
    toast.success('تم حذف الدور');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">الأدوار المخصصة</h3>
          <p className="text-sm text-muted-foreground">{roles.length} دور — يمكنك إنشاء أدوار جديدة بصلاحيات مخصصة</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> دور جديد
        </Button>
      </div>

      {roles.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-muted-foreground mb-4">لا توجد أدوار مخصصة بعد.</p>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>إنشاء أول دور</Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map(r => (
            <Card dir="rtl" key={r.id} className="p-4 border-border/60 shadow-soft hover:shadow-elev transition-shadow text-start">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-10 w-10 rounded-xl flex items-center justify-center text-primary-foreground shrink-0" style={{ background: r.color ?? 'hsl(var(--primary))' }}>
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.name}</div>
                    <Badge variant="outline" className="text-[10px] mt-0.5">{r.scope === 'platform' ? 'المنصة' : 'الشركات'}</Badge>
                  </div>
                </div>
                <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
              </div>
              {r.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{r.description}</p>}
              <div className="text-xs text-muted-foreground mb-3">{r.permissions.length} صلاحية مفعّلة</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(r); setOpen(true); }}>
                  <Pencil className="h-3 w-3 ml-1" /> تعديل
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDelete(r)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <RoleEditorDialog
          open={open}
          onOpenChange={setOpen}
          initial={editing ?? undefined}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

// ---------- Users & Roles ----------
const UsersAndRoles = () => {
  const { roles: custom } = useCustomRoles();
  const { overrides, set, clear } = useUserRoleOverrides();
  const [q, setQ] = useState('');

  const allUsers = useMemo(() => mockUsers.map(u => {
    const company = u.companyId ? mockCompanies.find(c => c.id === u.companyId) : null;
    const currentRole = overrides[u.id] ?? u.role;
    return { ...u, companyName: company?.name ?? 'منصة ون كليك', currentRole };
  }), [overrides]);

  const filtered = useMemo(() => {
    if (!q) return allUsers;
    const n = q.toLowerCase();
    return allUsers.filter(u => u.name.toLowerCase().includes(n) || u.email.toLowerCase().includes(n) || u.companyName.toLowerCase().includes(n));
  }, [allUsers, q]);

  const handleAssign = (userId: string, _userName: string, newRole: string) => {
    if (newRole === '__reset__') {
      clear(userId);
    } else {
      set(userId, newRole);
    }
    toast.success('تم تحديث الدور');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">المستخدمون والأدوار</h3>
          <p className="text-sm text-muted-foreground">{allUsers.length} مستخدم — قم بإسناد دور افتراضي أو مخصص لكل مستخدم</p>
        </div>
        <div className="relative w-72 max-w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم/البريد/الشركة..." className="pr-9" />
        </div>
      </div>

      <Card className="p-0 border-border/60 shadow-soft overflow-hidden">
        <table dir="rtl" className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-2.5 font-semibold">المستخدم</th>
              <th className="text-start px-4 py-2.5 font-semibold">الشركة</th>
              <th className="text-start px-4 py-2.5 font-semibold">الدور الحالي</th>
              <th className="text-start px-4 py-2.5 font-semibold w-72">تغيير الدور</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const isOverride = u.id in overrides;
              const currentCustom = custom.find(c => c.id === u.currentRole);
              const currentLabel = currentCustom?.name ?? roleLabel(u.currentRole);
              return (
                <tr key={u.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{u.name[0]}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.companyName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={currentCustom ? 'default' : 'secondary'}>{currentLabel}</Badge>
                      {isOverride && <span className="text-[10px] text-warning">(مخصص)</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={u.currentRole} onValueChange={(v) => handleAssign(u.id, u.name, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-[10px] uppercase text-muted-foreground font-semibold">أدوار افتراضية</div>
                        {matrixRoles.map(r => <SelectItem key={r.role} value={r.role}>{r.label}</SelectItem>)}
                        <SelectItem value="super_admin">مشرف عام</SelectItem>
                        {custom.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-[10px] uppercase text-muted-foreground font-semibold border-t mt-1 pt-2">أدوار مخصصة</div>
                            {custom.filter(c => c.enabled).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </>
                        )}
                        {isOverride && (
                          <>
                            <div className="border-t mt-1" />
                            <SelectItem value="__reset__">↺ إعادة للدور الأصلي</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ---------- Main page ----------
const RolesAndPermissions = () => {
  const { roles } = useCustomRoles();

  return (
    <div>
      <PageHeader
        title="الأدوار والصلاحيات"
        description="مصفوفة الصلاحيات، منشئ الأدوار المخصصة، وإسناد الأدوار للمستخدمين"
      />
      <Tabs dir="rtl" defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">مصفوفة الصلاحيات</TabsTrigger>
          <TabsTrigger value="generator">منشئ الأدوار</TabsTrigger>
          <TabsTrigger value="users">المستخدمون والأدوار</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="mt-4">
          <PermissionMatrix customRoles={roles} />
        </TabsContent>
        <TabsContent value="generator" className="mt-4">
          <RoleGenerator />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersAndRoles />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RolesAndPermissions;
