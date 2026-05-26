import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Truck, Phone, Mail, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { toast } from 'sonner';
import { useResource } from '@/hooks/useResource';

interface SupplierRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
}

const empty: Supplier = {
  id: '', name: '', phone: '', email: '', address: '', taxNumber: '', notes: '', isActive: true, createdAt: '',
};

const Suppliers = () => {
  const { list, save, remove } = useResource<Supplier, SupplierRow>({
    path: '/api/suppliers',
    key: 'suppliers',
    initial: [],
    searchable: ['name', 'phone', 'email'],
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? '',
      email: r.email ?? '',
      address: r.address ?? '',
      taxNumber: r.tax_number ?? '',
      notes: r.notes ?? '',
      isActive: r.is_active,
      createdAt: r.created_at,
    }),
    toRow: (s) => ({
      name: s.name,
      phone: s.phone || null,
      email: s.email || null,
      address: s.address || null,
      tax_number: s.taxNumber || null,
      notes: s.notes || null,
      is_active: s.isActive,
    }),
  });

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<Supplier>(empty);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');

  const filtered = list.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()),
  );

  const openAdd  = () => { setEditing(empty); setOpen(true); };
  const openEdit = (s: Supplier) => { setEditing({ ...s }); setOpen(true); };

  const submit = async () => {
    if (!editing.name.trim()) return toast.error('اسم المورد مطلوب');
    setSaving(true);
    try {
      await save(editing);
      setOpen(false);
      toast.success(editing.id ? 'تم تحديث المورد' : 'تم إضافة المورد');
    } catch {
      toast.error('تعذّر حفظ المورد');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete.id);
      toast.success('تم حذف المورد');
    } catch {
      toast.error('تعذّر حذف المورد');
    } finally {
      setToDelete(null);
    }
  };

  const columns: Column<Supplier>[] = [
    {
      key: 'name', header: 'اسم المورد',
      cell: (r) => (
        <Link to={`/app/suppliers/${r.id}`} className="font-medium text-primary hover:underline flex items-center gap-1">
          <Truck className="h-3.5 w-3.5" /> {r.name}
        </Link>
      ),
    },
    { key: 'phone', header: 'الهاتف', cell: (r) => r.phone ? <span className="flex items-center gap-1 text-sm"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{r.phone}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'email', header: 'البريد الإلكتروني', cell: (r) => r.email ? <span className="flex items-center gap-1 text-sm"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{r.email}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'tax', header: 'الرقم الضريبي', cell: (r) => r.taxNumber || <span className="text-muted-foreground">—</span> },
    { key: 'status', header: 'الحالة', cell: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} label={r.isActive ? 'نشط' : 'غير نشط'} /> },
    {
      key: 'actions', header: '',
      cell: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link to={`/app/suppliers/${r.id}`}><ExternalLink className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setToDelete(r)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="الموردون" description="إدارة بيانات الموردين والمزودين" />

      <DataTable
        data={filtered}
        columns={columns}
        rightToolbar={
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث باسم، هاتف، بريد..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Button onClick={openAdd}><Plus className="h-4 w-4 ml-1" /> إضافة مورد</Button>
          </div>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing.id ? 'تعديل المورد' : 'إضافة مورد جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>اسم المورد *</Label>
              <Input className="mt-1.5" value={editing.name} onChange={(e) => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="اسم الشركة أو الشخص" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الهاتف</Label>
                <Input className="mt-1.5" type="tel" value={editing.phone} onChange={(e) => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="05xxxxxxxx" />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input className="mt-1.5" type="email" value={editing.email} onChange={(e) => setEditing(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>العنوان</Label>
              <Input className="mt-1.5" value={editing.address} onChange={(e) => setEditing(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <Label>الرقم الضريبي</Label>
              <Input className="mt-1.5" inputMode="numeric" pattern="[0-9]*" value={editing.taxNumber} onChange={(e) => setEditing(p => ({ ...p, taxNumber: e.target.value }))} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea className="mt-1.5" value={editing.notes} onChange={(e) => setEditing(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editing.isActive} onCheckedChange={(v) => setEditing(p => ({ ...p, isActive: v }))} id="is-active" />
              <Label htmlFor="is-active">نشط</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المورد</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف «{toDelete?.name}»? لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Suppliers;
