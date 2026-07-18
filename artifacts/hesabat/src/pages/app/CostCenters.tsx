import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useResource } from '@/hooks/useResource';
import { formatDateShort } from '@/lib/format';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

interface CostCenterRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const empty = (): CostCenter => ({ id: '', code: '', name: '', description: '', isActive: true, createdAt: new Date().toISOString() });

const CostCenters = () => {
  const { list, save, remove } = useResource<CostCenter, CostCenterRow>({
    path: '/api/cost-centers',
    key: 'cost-centers',
    initial: [],
    fromRow: (r) => ({ id: r.id, code: r.code ?? '', name: r.name, description: r.description ?? '', isActive: r.is_active, createdAt: r.created_at }),
    toRow: (c) => ({ code: c.code || null, name: c.name, description: c.description || null, is_active: c.isActive }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter>(empty());

  const submit = async () => {
    if (!editing.name.trim()) return toast.error('اسم مركز التكلفة مطلوب');
    await save(editing);
    setOpen(false);
  };

  const columns: Column<CostCenter>[] = [
    { key: 'code', header: 'الكود', cell: (r) => r.code || '—' },
    { key: 'name', header: 'مركز التكلفة', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'description', header: 'الوصف', cell: (r) => <span className="text-muted-foreground">{r.description || '—'}</span> },
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
      <PageHeader title="مراكز التكلفة" description="إدارة مراكز التكلفة لاستخدامها كأبعاد على سطور القيود"
        actions={<Button onClick={() => { setEditing(empty()); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> مركز جديد</Button>} />
      <DataTable data={list} columns={columns} searchKeys={['code', 'name']} searchPlaceholder="ابحث بالكود أو اسم مركز التكلفة..." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> {editing.id ? 'تعديل مركز تكلفة' : 'مركز تكلفة جديد'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>الكود</Label><Input className="mt-1.5" value={editing.code} onChange={(e) => setEditing(v => ({ ...v, code: e.target.value }))} /></div>
            <div><Label>اسم المركز *</Label><Input className="mt-1.5" value={editing.name} onChange={(e) => setEditing(v => ({ ...v, name: e.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>الوصف</Label><Textarea className="mt-1.5" rows={3} value={editing.description} onChange={(e) => setEditing(v => ({ ...v, description: e.target.value }))} /></div>
            <div className="flex items-center gap-3"><Switch checked={editing.isActive} onCheckedChange={(v) => setEditing(s => ({ ...s, isActive: v }))} /><Label>نشط</Label></div>
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

export default CostCenters;
