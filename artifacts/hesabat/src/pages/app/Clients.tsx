import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Eye, Users, UserPlus, Link2, Download, Upload, Loader2, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientFormDialog } from '@/components/common/ClientFormDialog';
import type { Client } from '@/types';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/format';
import { useClients, useSuppliersLite } from '@/hooks/entities';
import { ApiError, isApiConfigured, API_URL, getAuthHeaders, api } from '@/lib/api';

interface ImportRowResult { row: number; name: string; error?: string; created?: boolean; }
interface ImportPreview { file: File; rows: ImportRowResult[]; created: number; errors: number; }

const Clients = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const suppliers = useSuppliersLite();
  const { list, remove } = useClients();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

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

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setOpen(true); };

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

      <ClientFormDialog open={open} onOpenChange={setOpen} client={editing} />

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

export default Clients;
