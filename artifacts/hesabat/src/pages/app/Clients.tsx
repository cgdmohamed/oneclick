import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Eye, Users, UserPlus, Link2, Download, Upload, Loader2, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { clients as initialClients } from '@/data/mock';
import type { Client } from '@/types';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/format';
import { useResource } from '@/hooks/useResource';
import { api, ApiError, isApiConfigured, API_URL, getAuthHeaders } from '@/lib/api';
import { EGP_CURRENCY_CODE, EGP_CURRENCY_SYMBOL } from '@/lib/currency';

interface ImportRowResult { row: number; name: string; error?: string; created?: boolean; }
interface ImportPreview { file: File; rows: ImportRowResult[]; created: number; errors: number; }

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

// A react-query hook rather than a plain useEffect/useState, specifically so
// it refetches when invalidated — e.g. right after "تسجيله كمورد أيضًا"
// creates a new supplier below, which otherwise left the "مرتبط بمورد"
// column showing "—" for the record it had just linked. Deliberately NOT
// keyed 'suppliers' — that's Suppliers.tsx's own canonical useResource key,
// mapped to a fuller camelCase shape; sharing it with this raw {id,name}
// fetch is exactly the stale/wrong-shape cache collision documented
// elsewhere in this codebase (products/branches/cost-centers "-picker" keys
// exist for the same reason).
const useSuppliers = () => {
  const { data } = useQuery({
    enabled: isApiConfigured(),
    queryKey: ['suppliers-lite'],
    queryFn: async () => (await api.get<{ data: SupplierOption[] }>('/api/suppliers?page_size=200')).data ?? [],
  });
  return data ?? [];
};

const empty: Client = { id: '', companyId: 'co-1', name: '', phone: '', whatsapp: '', email: '', address: '', taxNumber: '', currency: EGP_CURRENCY_CODE, currencySymbol: EGP_CURRENCY_SYMBOL, createdAt: new Date().toISOString(), linkedSupplierId: null };

const Clients = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
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
  const [alsoSupplier, setAlsoSupplier] = useState(false);
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    setExportLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/clients/export?format=${format}`, { credentials: 'include', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `clients.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success('تم تصدير العملاء بنجاح');
    } catch {
      toast.error('تعذّر تصدير العملاء');
    } finally {
      setExportLoading(false);
    }
  };

  const handleTemplateDownload = async (format: 'csv' | 'xlsx' = 'csv') => {
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    try {
      const res = await fetch(`${API_URL}/api/clients/export/template?format=${format}`, { credentials: 'include', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Template download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `clients-template.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error('تعذّر تنزيل النموذج');
    }
  };

  const handleImportFileChange = async (file: File | undefined) => {
    if (!file) return;
    setImportFile(file);
    setImportPreview(null);
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('dry_run', 'true');
      const res = await api.upload<{ created: number; errors: number; results: ImportRowResult[] }>('/api/clients/import', form);
      setImportPreview({ file, rows: res.results, created: res.created, errors: res.errors });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر معالجة الملف');
      setImportFile(null);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importPreview || !importFile) return;
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append('file', importFile);
      form.append('dry_run', 'false');
      const res = await api.upload<{ created: number; errors: number }>('/api/clients/import', form);
      toast.success(`تم استيراد ${res.created} عميل جديد${res.errors > 0 ? ` (${res.errors} صف بأخطاء)` : ''}`);
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر استيراد العملاء');
    } finally {
      setImportLoading(false);
    }
  };

  const isNew = !list.some((c) => c.id === editing.id);

  const openNew = () => { setEditing({ ...empty, id: `cl-${Date.now()}` }); setAlsoSupplier(false); setOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setAlsoSupplier(false); setOpen(true); };
  const submit = async () => {
    if (!editing.name || !editing.phone) return toast.error('الاسم والهاتف مطلوبان');
    if (editing.taxNumber && !/^\d+$/.test(editing.taxNumber)) return toast.error('الرقم الضريبي يجب أن يحتوي على أرقام فقط');
    // Non-blocking duplicate-phone warning — two clients may legitimately
    // share a phone number (e.g. a shared office line), so this warns
    // without preventing the save, matching the zero-cost-item warning
    // pattern used elsewhere in this app.
    const normalizedPhone = editing.phone.replace(/\D/g, '');
    if (normalizedPhone) {
      const duplicate = list.find((c) => c.id !== editing.id && c.phone.replace(/\D/g, '') === normalizedPhone);
      if (duplicate) toast.warning(`رقم الهاتف مسجَّل بالفعل لدى العميل «${duplicate.name}» — يُرجى التأكد من عدم تكرار العميل نفسه`);
    }

    if (isNew && alsoSupplier) {
      setSaving(true);
      try {
        const clientRes = await api.post<{ data: { id: string } }>('/api/clients', {
          name: editing.name, phone: editing.phone || null, whatsapp: editing.whatsapp || null,
          email: editing.email || null, address: editing.address || null,
          tax_number: editing.taxNumber || null, currency: EGP_CURRENCY_CODE,
        });
        const clientId = clientRes.data.id;
        try {
          const supplierRes = await api.post<{ data: { id: string } }>('/api/suppliers', {
            name: editing.name, phone: editing.phone || null, email: editing.email || null,
            address: editing.address || null, tax_number: editing.taxNumber || null, is_active: true,
          });
          await api.patch(`/api/clients/${clientId}`, { linked_supplier_id: supplierRes.data.id });
          toast.success('تم تسجيل العميل والمورد وربطهما ببعض');
        } catch (e) {
          // The client itself is already saved successfully — a failure here
          // (e.g. duplicate tax number on the supplier side) must not look
          // like the whole save failed, since it didn't.
          toast.warning(
            `تم حفظ العميل، لكن تعذّر تسجيله كمورد أيضًا${e instanceof ApiError ? `: ${e.message}` : ''} — يمكنك ربطه يدويًا لاحقًا من حقل "مرتبط بمورد"`,
          );
        }
        qc.invalidateQueries({ queryKey: ['clients'] });
        qc.invalidateQueries({ queryKey: ['suppliers'] });
        qc.invalidateQueries({ queryKey: ['suppliers-lite'] });
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر حفظ العميل');
      } finally {
        setSaving(false);
      }
      return;
    }

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
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Download className="h-4 w-4 ml-1" />} تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Download className="h-4 w-4 ml-1" />} تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 ml-1" /> استيراد</Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 ml-1" /> عميل جديد</Button>
        </div>} />

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
            {isNew && (
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div>
                  <Label htmlFor="also-supplier">تسجيله كمورد أيضًا</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">ينشئ سجل مورد بنفس البيانات ويربطه بهذا العميل تلقائيًا.</p>
                </div>
                <Switch id="also-supplier" checked={alsoSupplier} onCheckedChange={setAlsoSupplier} />
              </div>
            )}
            {!alsoSupplier && (
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportFile(null); setImportPreview(null); } }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>استيراد العملاء</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-muted-foreground">
                <p className="mb-1">الأعمدة المطلوبة: <span className="font-mono text-foreground text-xs">name, phone, email, whatsapp, tax_number, address, notes</span></p>
                <p>كل صف ينشئ عميلاً جديدًا — الاسم والهاتف إجباريان، الباقي اختياري.</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button variant="outline" size="sm" onClick={() => handleTemplateDownload('csv')}>
                  <Download className="h-4 w-4 me-1" /> نموذج CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleTemplateDownload('xlsx')}>
                  <Download className="h-4 w-4 me-1" /> نموذج Excel
                </Button>
              </div>
            </div>

            {!importPreview && (
              <div
                className="rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors p-8 text-center cursor-pointer"
                onClick={() => importFileRef.current?.click()}
              >
                {importLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">جارٍ معالجة الملف...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium">اسحب الملف هنا أو اضغط للاختيار</p>
                    <p className="text-xs text-muted-foreground">ملفات CSV أو Excel (xlsx)</p>
                  </div>
                )}
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => { handleImportFileChange(e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>
            )}

            {importPreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 rounded-lg border border-border p-3 bg-muted/20">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span><strong>{importPreview.created}</strong> عميل جديد</span>
                  </div>
                  {importPreview.errors > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span><strong>{importPreview.errors}</strong> صف بأخطاء</span>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="ms-auto text-xs" onClick={() => { setImportFile(null); setImportPreview(null); }}>
                    تغيير الملف
                  </Button>
                </div>

                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-start px-3 py-2 font-medium text-muted-foreground w-16">الصف</th>
                          <th className="text-start px-3 py-2 font-medium text-muted-foreground">الاسم</th>
                          <th className="text-start px-3 py-2 font-medium text-muted-foreground w-32">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importPreview.rows.map((r) => (
                          <tr key={r.row} className={r.error ? 'bg-destructive/5' : ''}>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.row}</td>
                            <td className="px-3 py-2 font-medium">{r.name || <span className="italic text-muted-foreground">بدون اسم</span>}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="inline-flex items-center gap-1 text-destructive text-xs"><XCircle className="h-3.5 w-3.5 shrink-0" />{r.error}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />جديد</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {importPreview.created === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">لا توجد صفوف صالحة للاستيراد.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); setImportPreview(null); }}>إلغاء</Button>
            <Button
              onClick={handleImportConfirm}
              disabled={!importPreview || importPreview.created === 0 || importLoading}
            >
              {importLoading ? <><Loader2 className="h-4 w-4 animate-spin me-1" /> جارٍ المعالجة...</> : 'تأكيد الاستيراد'}
            </Button>
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
