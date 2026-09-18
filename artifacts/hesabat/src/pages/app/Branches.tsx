import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useResource } from '@/hooks/useResource';
import { formatDateShort } from '@/lib/format';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
}

interface BranchRow {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

const empty = (): Branch => ({ id: '', code: '', name: '', address: '', phone: '', isActive: true, createdAt: new Date().toISOString() });

const Branches = () => {
  const { list, save, remove } = useResource<Branch, BranchRow>({
    path: '/api/branches',
    key: 'branches',
    initial: [],
    fromRow: (r) => ({ id: r.id, code: r.code ?? '', name: r.name, address: r.address ?? '', phone: r.phone ?? '', isActive: r.is_active, createdAt: r.created_at }),
    toRow: (b) => ({ code: b.code || null, name: b.name, address: b.address || null, phone: b.phone || null, is_active: b.isActive }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch>(empty());

  const submit = async () => {
    if (!editing.name.trim()) return toast.error('اسم الفرع مطلوب');
    await save(editing);
    setOpen(false);
  };

  const columns: Column<Branch>[] = [
    { key: 'code', header: 'الكود', cell: (r) => r.code || '—' },
    { key: 'name', header: 'الفرع', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'phone', header: 'الهاتف', cell: (r) => r.phone || '—' },
    { key: 'address', header: 'العنوان', cell: (r) => <span className="text-muted-foreground">{r.address || '—'}</span> },
    { key: 'active', header: 'الحالة', cell: (r) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'نشط' : 'غير نشط'}</Badge> },
    { key: 'created', header: 'تاريخ الإضافة', cell: (r) => <span className="text-xs text-muted-foreground">{formatDateShort(r.createdAt)}</span> },
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="الفروع" description="إدارة فروع الشركة لاستخدامها كأبعاد محاسبية"
        actions={<Button onClick={() => { setEditing(empty()); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> فرع جديد</Button>} />
      <DataTable data={list} columns={columns} searchKeys={['code', 'name', 'phone']} searchPlaceholder="ابحث بالكود أو اسم الفرع..." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> {editing.id ? 'تعديل فرع' : 'فرع جديد'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            {editing.id && (
              <div><Label>الكود</Label><Input className="mt-1.5" value={editing.code} disabled readOnly /></div>
            )}
            <div className={editing.id ? '' : 'sm:col-span-2'}><Label>اسم الفرع *</Label><Input className="mt-1.5" value={editing.name} onChange={(e) => setEditing(v => ({ ...v, name: e.target.value }))} /></div>
            <div><Label>الهاتف</Label><Input className="mt-1.5" value={editing.phone} onChange={(e) => setEditing(v => ({ ...v, phone: e.target.value }))} /></div>
            <div className="flex items-center gap-3 pt-7"><Switch checked={editing.isActive} onCheckedChange={(v) => setEditing(s => ({ ...s, isActive: v }))} /><Label>نشط</Label></div>
            <div className="sm:col-span-2"><Label>العنوان</Label><Input className="mt-1.5" value={editing.address} onChange={(e) => setEditing(v => ({ ...v, address: e.target.value }))} /></div>
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

export default Branches;
