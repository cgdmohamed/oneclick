import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { api, ApiError, isApiConfigured, API_URL, getAuthHeaders } from '@/lib/api';
import { Plus, Pencil, ArrowLeftRight, Download, Upload, Loader2, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { accountTypeLabel, normalBalanceLabel, type ChartAccount } from './types';

interface ImportRowResult {
  row: number;
  code: string;
  error?: string;
  created?: boolean;
  updated?: boolean;
}
interface ImportPreview {
  file: File;
  rows: ImportRowResult[];
  created: number;
  updated: number;
  errors: number;
}

const empty: Partial<ChartAccount> = {
  code: '',
  name: '',
  type: 'asset',
  normal_balance: 'debit',
  parent_id: null,
  is_active: true,
};

const emptyAdjustment = {
  from_account_id: '',
  to_account_id: '',
  amount: '',
  entry_date: new Date().toISOString().slice(0, 10),
  description: '',
};

const ChartOfAccounts = () => {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const deepLinkAccountId = searchParams.get('account');
  // A link from a client/supplier/employee's own page ("الحساب في دليل
  // الحسابات") points at a specific auto-generated sub-account, so the
  // default hidden-by-toggle filter above must not hide the very row the
  // link was meant to show.
  const [showPartyAccounts, setShowPartyAccounts] = useState(!!deepLinkAccountId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<ChartAccount>>(empty);
  const [saving, setSaving] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustment, setAdjustment] = useState(emptyAdjustment);
  const [adjustSaving, setAdjustSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const { data = [] } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: async () => (await api.get<{ data: ChartAccount[] }>('/api/accounting/chart-accounts')).data ?? [],
  });

  const partyAccountsCount = useMemo(() => data.filter((a) => a.is_party_account).length, [data]);

  // Auto-generated party sub-accounts (one per client/supplier/employee —
  // see ensurePartySubAccount() in posting.ts) can number in the hundreds
  // and would otherwise flood this flat list; hidden by default, toggle
  // reveals them when actually needed (e.g. a manual reconciliation entry
  // against one specific party).
  const pickerOptions = useMemo(
    () => data.filter((a) => showPartyAccounts || !a.is_party_account).map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })),
    [data, showPartyAccounts],
  );

  const rows = useMemo(() => data
    .filter((a) => showPartyAccounts || !a.is_party_account)
    .map((a) => ({
      ...a,
      tree_name: `${a.parent_id ? '   ' : ''}${a.code} - ${a.name}`,
    })), [data, showPartyAccounts]);

  // Resolved client-side from the account id in the URL (rather than
  // trusting a code passed by the caller) so the search box always lands on
  // whatever this account is actually called/coded right now.
  const deepLinkCode = useMemo(
    () => (deepLinkAccountId ? data.find((a) => a.id === deepLinkAccountId)?.code : undefined),
    [data, deepLinkAccountId],
  );

  const submit = async () => {
    if (!form.code?.trim()) return toast.error('أدخل كود الحساب');
    if (!form.name?.trim()) return toast.error('أدخل اسم الحساب');
    setSaving(true);
    try {
      const body = {
        parent_id: form.parent_id || null,
        code: form.code,
        name: form.name,
        type: form.type,
        normal_balance: form.normal_balance,
        is_active: form.is_active !== false,
      };
      if (form.id) await api.patch(`/api/accounting/chart-accounts/${form.id}`, body);
      else await api.post('/api/accounting/chart-accounts', body);
      await qc.invalidateQueries({ queryKey: ['chart-accounts'] });
      toast.success('تم حفظ الحساب');
      setOpen(false);
      setForm(empty);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ الحساب');
    } finally {
      setSaving(false);
    }
  };

  const submitAdjustment = async () => {
    if (!adjustment.from_account_id) return toast.error('اختر الحساب المنقول منه');
    if (!adjustment.to_account_id) return toast.error('اختر الحساب المنقول إليه');
    if (adjustment.from_account_id === adjustment.to_account_id) return toast.error('الحسابان لا يمكن أن يكونا نفس الحساب');
    if (!adjustment.amount || Number(adjustment.amount) <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    if (!adjustment.description.trim()) return toast.error('أدخل بيان القيد');
    setAdjustSaving(true);
    try {
      await api.post('/api/accounting/reconciliation-entries', {
        from_account_id: adjustment.from_account_id,
        to_account_id: adjustment.to_account_id,
        amount: Number(adjustment.amount),
        entry_date: adjustment.entry_date,
        description: adjustment.description.trim(),
      });
      toast.success('تم ترحيل قيد التسوية');
      setAdjustOpen(false);
      setAdjustment(emptyAdjustment);
      await qc.invalidateQueries({ queryKey: ['chart-accounts'] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذر ترحيل قيد التسوية');
    } finally {
      setAdjustSaving(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    setExportLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/accounting/chart-accounts/export?format=${format}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chart-of-accounts.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success('تم تصدير دليل الحسابات بنجاح');
    } catch {
      toast.error('تعذّر تصدير دليل الحسابات');
    } finally {
      setExportLoading(false);
    }
  };

  const handleTemplateDownload = async (format: 'csv' | 'xlsx' = 'csv') => {
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    try {
      const res = await fetch(`${API_URL}/api/accounting/chart-accounts/export/template?format=${format}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Template download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chart-of-accounts-template.${format}`;
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
      const res = await api.upload<{ created: number; updated: number; errors: number; results: ImportRowResult[] }>(
        '/api/accounting/chart-accounts/import',
        form,
      );
      setImportPreview({ file, rows: res.results, created: res.created, updated: res.updated, errors: res.errors });
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
      const res = await api.upload<{ created: number; updated: number; errors: number }>(
        '/api/accounting/chart-accounts/import',
        form,
      );
      toast.success(`تم استيراد ${res.created} حساب جديد وتحديث ${res.updated}${res.errors > 0 ? ` (${res.errors} صف بأخطاء)` : ''}`);
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      await qc.invalidateQueries({ queryKey: ['chart-accounts'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر استيراد دليل الحسابات');
    } finally {
      setImportLoading(false);
    }
  };

  const columns: Column<ChartAccount & { tree_name: string }>[] = [
    { key: 'code', header: 'الكود', cell: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'الحساب', cell: (r) => <div><div className="font-medium">{r.name}</div>{r.parent_name && <div className="text-xs text-muted-foreground">تابع لـ {r.parent_code} - {r.parent_name}</div>}</div> },
    { key: 'type', header: 'النوع', cell: (r) => accountTypeLabel(r.type) },
    { key: 'normal', header: 'الطبيعة', cell: (r) => normalBalanceLabel(r.normal_balance) },
    { key: 'status', header: 'الحالة', cell: (r) => <div className="flex items-center gap-1.5">
      <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'نشط' : 'غير نشط'}</Badge>
      {r.is_party_account && <Badge variant="outline" className="text-xs text-muted-foreground">تلقائي</Badge>}
    </div> },
    { key: 'actions', header: '', cell: (r) => <Button variant="ghost" size="icon" onClick={() => { setForm(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="دليل الحسابات"
        description="حسابات الأستاذ العام حسب الهيكل الهرمي وطبيعة الرصيد"
        actions={<div className="flex flex-wrap items-center gap-2">
          {partyAccountsCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground px-2 border rounded-md h-9">
              <Switch checked={showPartyAccounts} onCheckedChange={setShowPartyAccounts} />
              إظهار الحسابات الفرعية التلقائية ({partyAccountsCount})
            </label>
          )}
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Download className="h-4 w-4 ml-1" />} تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Download className="h-4 w-4 ml-1" />} تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 ml-1" /> استيراد</Button>
          <Button variant="outline" onClick={() => { setAdjustment(emptyAdjustment); setAdjustOpen(true); }}><ArrowLeftRight className="h-4 w-4 ml-1" /> قيد تسوية</Button>
          <Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> حساب جديد</Button>
        </div>}
      />
      <DataTable
        key={deepLinkCode ?? 'all'}
        data={rows}
        columns={columns}
        searchKeys={['code', 'name']}
        defaultSearch={deepLinkCode}
        emptyTitle="لا توجد حسابات"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? 'تعديل حساب' : 'حساب جديد'}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div><Label>كود الحساب</Label><Input className="mt-1.5" value={form.code ?? ''} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} /></div>
            <div><Label>اسم الحساب</Label><Input className="mt-1.5" value={form.name ?? ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div>
              <Label>نوع الحساب</Label>
              <Select value={form.type} onValueChange={(v: ChartAccount['type']) => setForm((p) => ({ ...p, type: v, normal_balance: ['asset', 'expense'].includes(v) ? 'debit' : 'credit' }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{['asset','liability','equity','revenue','expense'].map((t) => <SelectItem key={t} value={t}>{accountTypeLabel(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>الحساب الأب</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  value={form.parent_id ?? '__none__'}
                  onValueChange={(v) => setForm((p) => ({ ...p, parent_id: v === '__none__' ? null : v }))}
                  options={[{ value: '__none__', label: 'بدون حساب أب' }, ...pickerOptions.filter((o) => o.value !== form.id)]}
                  placeholder="بدون حساب أب"
                  searchPlaceholder="ابحث بالكود أو الاسم..."
                />
              </div>
            </div>
            <div>
              <Label>طبيعة الرصيد</Label>
              <Select value={form.normal_balance} onValueChange={(v: ChartAccount['normal_balance']) => setForm((p) => ({ ...p, normal_balance: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="debit">مدين</SelectItem><SelectItem value="credit">دائن</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 mt-6">
              <Label>نشط</Label>
              <Switch checked={form.is_active !== false} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader>
            <DialogTitle>قيد تسوية بين حسابين</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            ينقل مبلغاً من حساب (فرعي أو رئيسي) إلى حساب آخر بقيد محاسبي مرحّل فوراً — لتصحيح فرق اكتُشف في تقارير التسوية (كشف حساب عميل/مورد، تسوية المخزون) أو أي تصحيح يدوي مماثل.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div>
              <Label>من حساب (دائن)</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  value={adjustment.from_account_id}
                  onValueChange={(v) => setAdjustment((p) => ({ ...p, from_account_id: v }))}
                  options={pickerOptions}
                  placeholder="اختر الحساب"
                  searchPlaceholder="ابحث بالكود أو الاسم..."
                />
              </div>
            </div>
            <div>
              <Label>إلى حساب (مدين)</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  value={adjustment.to_account_id}
                  onValueChange={(v) => setAdjustment((p) => ({ ...p, to_account_id: v }))}
                  options={pickerOptions}
                  placeholder="اختر الحساب"
                  searchPlaceholder="ابحث بالكود أو الاسم..."
                />
              </div>
            </div>
            <div>
              <Label>المبلغ</Label>
              <Input className="mt-1.5" type="number" min="0" step="0.01" value={adjustment.amount} onChange={(e) => setAdjustment((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <Label>تاريخ القيد</Label>
              <Input className="mt-1.5" type="date" value={adjustment.entry_date} onChange={(e) => setAdjustment((p) => ({ ...p, entry_date: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>بيان القيد</Label>
              <Input className="mt-1.5" value={adjustment.description} onChange={(e) => setAdjustment((p) => ({ ...p, description: e.target.value }))} placeholder="سبب التسوية" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>إلغاء</Button>
            <Button onClick={submitAdjustment} disabled={adjustSaving}>{adjustSaving ? 'جار الترحيل...' : 'ترحيل القيد'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportFile(null); setImportPreview(null); } }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>استيراد دليل الحسابات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-muted-foreground">
                <p className="mb-1">الأعمدة المطلوبة: <span className="font-mono text-foreground text-xs">code, name, type, normal_balance, parent_code, status</span></p>
                <p>حساب بكود موجود بالفعل يتم تحديث بياناته؛ كود جديد يُنشأ حساباً جديداً. اذكر الحساب الأب قبل حساباته الفرعية في الملف.</p>
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
                    <span><strong>{importPreview.created}</strong> حساب جديد، <strong>{importPreview.updated}</strong> تحديث</span>
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
                          <th className="text-start px-3 py-2 font-medium text-muted-foreground">الكود</th>
                          <th className="text-start px-3 py-2 font-medium text-muted-foreground w-32">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importPreview.rows.map((r) => (
                          <tr key={r.row} className={r.error ? 'bg-destructive/5' : ''}>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.row}</td>
                            <td className="px-3 py-2 font-medium">{r.code || <span className="italic text-muted-foreground">بدون كود</span>}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="inline-flex items-center gap-1 text-destructive text-xs"><XCircle className="h-3.5 w-3.5 shrink-0" />{r.error}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{r.created ? 'جديد' : 'تحديث'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {importPreview.created + importPreview.updated === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">لا توجد صفوف صالحة للاستيراد.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); setImportPreview(null); }}>إلغاء</Button>
            <Button
              onClick={handleImportConfirm}
              disabled={!importPreview || importPreview.created + importPreview.updated === 0 || importLoading}
            >
              {importLoading ? <><Loader2 className="h-4 w-4 animate-spin me-1" /> جارٍ المعالجة...</> : 'تأكيد الاستيراد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChartOfAccounts;
