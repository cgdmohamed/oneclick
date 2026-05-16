import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clients as initialClients } from '@/data/mock';
import type { Client } from '@/types';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/format';
import { useResource } from '@/hooks/useResource';
import { CURRENCIES, getCurrencySymbol } from '@/lib/currency';

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
  created_at: string;
}

const empty: Client = { id: '', companyId: 'co-1', name: '', phone: '', whatsapp: '', email: '', address: '', taxNumber: '', createdAt: new Date().toISOString() };

const Clients = () => {
  const navigate = useNavigate();
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
      createdAt: r.created_at,
    }),
    toRow: (c) => ({
      name: c.name,
      phone: c.phone || null,
      whatsapp: c.whatsapp || null,
      email: c.email || null,
      address: c.address || null,
      tax_number: c.taxNumber || null,
    }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client>(empty);

  const openNew = () => { setEditing({ ...empty, id: `cl-${Date.now()}` }); setOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setOpen(true); };
  const submit = async () => {
    if (!editing.name || !editing.phone) return toast.error('الاسم والهاتف مطلوبان');
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
    { key: 'actions', header: '', cell: r => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" title="عرض ملف العميل" onClick={() => navigate(`/app/clients/${r.id}`)}><Eye className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="العملاء" description="إدارة قاعدة عملائك"
        actions={<Button onClick={openNew}><Plus className="h-4 w-4 ml-1" /> عميل جديد</Button>} />

      <DataTable data={list} columns={columns} searchKeys={['name','phone','email']} searchPlaceholder="ابحث باسم العميل أو رقمه..." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.name ? 'تعديل عميل' : 'إضافة عميل جديد'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="الاسم *" value={editing.name} onChange={v => setEditing(e => ({ ...e, name: v }))} />
            <Field label="رقم الهاتف *" value={editing.phone} onChange={v => setEditing(e => ({ ...e, phone: v }))} />
            <Field label="رقم واتساب" value={editing.whatsapp ?? ''} onChange={v => setEditing(e => ({ ...e, whatsapp: v }))} />
            <Field label="البريد الإلكتروني" value={editing.email ?? ''} onChange={v => setEditing(e => ({ ...e, email: v }))} />
            <Field label="الرقم الضريبي" value={editing.taxNumber ?? ''} onChange={v => setEditing(e => ({ ...e, taxNumber: v }))} />
            <div className="sm:col-span-2"><Field label="العنوان" value={editing.address ?? ''} onChange={v => setEditing(e => ({ ...e, address: v }))} /></div>
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

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div><Label>{label}</Label><Input value={value} onChange={e => onChange(e.target.value)} className="mt-1.5" /></div>
);

export default Clients;
