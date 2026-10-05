import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Eye, Users, UserPlus, Link2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { clients as initialClients } from '@/data/mock';
import type { Client } from '@/types';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/format';
import { useResource } from '@/hooks/useResource';
import { api, isApiConfigured } from '@/lib/api';
import { EGP_CURRENCY_CODE, EGP_CURRENCY_SYMBOL } from '@/lib/currency';

interface ClientRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  notes: string | null;
  currency: string | null;
  created_at: string;
  linked_supplier_id: string | null;
}

interface SupplierOption { id: string; name: string; }

const useSuppliers = () => {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  useEffect(() => {
    if (!isApiConfigured()) return;
    api.get<{ data: SupplierOption[] }>('/api/suppliers?page_size=200').then(res => setSuppliers(res.data ?? [])).catch(() => {});
  }, []);
  return suppliers;
};

const empty: Client = { id: '', companyId: 'co-1', name: '', phone: '', whatsapp: '', email: '', address: '', taxNumber: '', currency: EGP_CURRENCY_CODE, currencySymbol: EGP_CURRENCY_SYMBOL, createdAt: new Date().toISOString(), linkedSupplierId: null };

const Clients = () => {
  const navigate = useNavigate();
  const suppliers = useSuppliers();
  const { list, save, remove } = useResource<Client, ClientRow>({
    path: '/api/clients',
    key: 'clients',
    initial: initialClients,
    fromRow: (r) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      phone: r.phone ?? '',
      whatsapp: r.whatsapp ?? '',
      email: r.email ?? '',
      address: r.address ?? '',
      taxNumber: r.tax_number ?? '',
      currency: EGP_CURRENCY_CODE,
      currencySymbol: EGP_CURRENCY_SYMBOL,
      createdAt: r.created_at,
      linkedSupplierId: r.linked_supplier_id,
    }),
    toRow: (c) => ({
      name: c.name,
      phone: c.phone || null,
      whatsapp: c.whatsapp || null,
      email: c.email || null,
      address: c.address || null,
      tax_number: c.taxNumber || null,
      currency: EGP_CURRENCY_CODE,
      linked_supplier_id: c.linkedSupplierId || null,
    }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client>(empty);

  const openNew = () => { setEditing({ ...empty, id: `cl-${Date.now()}` }); setOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setOpen(true); };
  const submit = async () => {
    if (!editing.name || !editing.phone) return toast.error('الاسم والهاتف مطلوبان');
    if (editing.taxNumber && !/^\d+$/.test(editing.taxNumber)) return toast.error('الرقم الضريبي يجب أن يحتوي على أرقام فقط');
    await save(editing);
    setOpen(false);
  };

  const columns: Column<Client>[] = [
    { key: 'name', header: 'الاسم', cell: r => (
      <button onClick={() => navigate(`/app/clients/${r.id}`)} className="font-medium text-primary hover:underline text-start">
        {r.name}
      </button>
    )},
    { key: 'phone', header: 'الهاتف', cell: r => <span dir="ltr" className="text-sm">{r.phone}</span> },
    { key: 'email', header: 'البريد', cell: r => <span className="text-sm text-muted-foreground">{r.email || '—'}</span> },
    { key: 'address', header: 'العنوان', cell: r => <span className="text-sm text-muted-foreground">{r.address || '—'}</span> },
    { key: 'tax', header: 'الرقم الضريبي', cell: r => <span className="text-sm">{r.taxNumber || '—'}</span> },
    { key: 'created', header: 'تاريخ الإضافة', cell: r => <span className="text-xs text-muted-foreground">{formatDateShort(r.createdAt)}</span> },
    { key: 'linked', header: 'مرتبط بمورد', cell: r => r.linkedSupplierId
      ? <span className="text-xs text-muted-foreground">{suppliers.find(s => s.id === r.linkedSupplierId)?.name ?? '—'}</span>
      : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'actions', header: '', cell: r => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" title="عرض ملف العميل" onClick={() => navigate(`/app/clients/${r.id}`)}><Eye className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  const now = new Date();
  const newThisMonth = list.filter((c) => {
    const d = new Date(c.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const linkedCount = list.filter((c) => c.linkedSupplierId).length;

  return (
    <div className="space-y-5">
      <PageHeader title="العملاء" description="إدارة قاعدة عملائك"
        actions={<Button onClick={openNew}><Plus className="h-4 w-4 ml-1" /> عميل جديد</Button>} />

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard title="عدد العملاء" value={list.length} icon={Users} accent="info" />
        <StatCard title="عملاء جدد هذا الشهر" value={newThisMonth} icon={UserPlus} accent="success" />
        <StatCard title="عملاء مرتبطون بمورد" value={linkedCount} icon={Link2} accent="primary" />
      </div>

      <DataTable data={list} columns={columns} searchKeys={['name','phone','email']} searchPlaceholder="ابحث باسم العميل أو رقمه..." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.name ? 'تعديل عميل' : 'إضافة عميل جديد'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="client-name" label="الاسم *" value={editing.name} onChange={v => setEditing(e => ({ ...e, name: v }))} />
            <Field id="client-phone" label="رقم الهاتف *" type="tel" value={editing.phone} onChange={v => setEditing(e => ({ ...e, phone: v }))} />
            <Field id="client-whatsapp" label="رقم واتساب" type="tel" value={editing.whatsapp ?? ''} onChange={v => setEditing(e => ({ ...e, whatsapp: v }))} />
            <Field id="client-email" label="البريد الإلكتروني" type="email" value={editing.email ?? ''} onChange={v => setEditing(e => ({ ...e, email: v }))} />
            <Field id="client-tax-number" label="الرقم الضريبي" inputMode="numeric" pattern="[0-9]*" value={editing.taxNumber ?? ''} onChange={v => setEditing(e => ({ ...e, taxNumber: v.replace(/\D/g, '') }))} />
            <div className="sm:col-span-2"><Field id="client-address" label="العنوان" value={editing.address ?? ''} onChange={v => setEditing(e => ({ ...e, address: v }))} /></div>
            <div className="sm:col-span-2">
              <Label>مرتبط بمورد (اختياري)</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                لو هذا العميل هو نفسه مورد مسجّل لديك، اربطه هنا لعرض كشف حساب موحد بصافي الرصيد بين الجانبين — الربط لا يغيّر أي قيد محاسبي قائم.
              </p>
              <SearchableSelect
                value={editing.linkedSupplierId ?? ''}
                onValueChange={v => setEditing(e => ({ ...e, linkedSupplierId: v || null }))}
                options={[{ value: '', label: 'بدون ربط' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
                placeholder="اختر موردًا..."
                searchPlaceholder="ابحث عن مورد..."
              />
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

const Field = ({ id, label, value, onChange, type, inputMode, pattern }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; pattern?: string;
}) => (
  <div><Label htmlFor={id}>{label}</Label><Input id={id} type={type} inputMode={inputMode} pattern={pattern} value={value} onChange={e => onChange(e.target.value)} className="mt-1.5" /></div>
);

export default Clients;
