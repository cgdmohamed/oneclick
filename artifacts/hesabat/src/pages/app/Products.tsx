import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, AlertTriangle, ImageIcon, Loader2, Package, Tags, X, Download, Upload, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { useResource } from '@/hooks/useResource';
import { useInvoices } from '@/hooks/entities';
import { useQueryClient } from '@tanstack/react-query';
import { api, isApiConfigured, resolveAssetUrl, API_URL, getAuthHeaders } from '@/lib/api';

interface ProductRow {
  id: string;
  company_id: string;
  sku: string | null;
  name: string;
  price: string | number;
  cost: string | number;
  quantity: number;
  alert_level: number;
  image_url: string | null;
  is_active: boolean;
  category_id: string | null;
  category_name: string | null;
}

interface Category {
  id: string;
  name: string;
  product_count: number;
}

interface ImportRowResult {
  row: number;
  name: string;
  error?: string;
  created?: boolean;
}

interface ImportPreview {
  file: File;
  rows: ImportRowResult[];
  created: number;
  skipped: number;
}

const empty: Product = { id: '', companyId: 'co-1', name: '', code: '', category: '', price: 0, quantity: 0, alertLevel: 5, status: 'active' };

const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isApiConfigured()) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: Category[] }>('/api/categories');
      setCategories(res.data ?? []);
    } catch {
      // silent — categories are optional
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (name: string) => {
    const res = await api.post<{ data: Category }>('/api/categories', { name });
    setCategories(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
    return res.data;
  };

  const remove = async (id: string) => {
    await api.delete(`/api/categories/${id}`);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  return { categories, loading, reload: load, create, remove };
};

const Products = () => {
  const qc = useQueryClient();
  const { list, save, remove } = useResource<Product, ProductRow>({
    path: '/api/products',
    key: 'products',
    initial: [],
    fromRow: (r) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      code: r.sku ?? '',
      price: Number(r.price),
      quantity: r.quantity,
      alertLevel: r.alert_level,
      imageUrl: r.image_url ?? undefined,
      status: r.is_active ? 'active' : 'inactive',
      categoryId: r.category_id ?? undefined,
      category: r.category_name ?? undefined,
    }),
    toRow: (p) => ({
      name: p.name,
      sku: p.code || null,
      price: p.price,
      quantity: p.quantity,
      alert_level: p.alertLevel,
      image_url: p.imageUrl ?? null,
      is_active: p.status !== 'inactive',
      category_id: p.categoryId ?? null,
    }),
  });

  const { categories, loading: catsLoading, reload: reloadCats, create: createCat, remove: removeCat } = useCategories();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product>(empty);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catFilter, setCatFilter] = useState<string>('all');
  const { list: invoices } = useInvoices();

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!editing.name) return toast.error('أكمل بيانات المنتج');
    await save(editing);
    setOpen(false);
  };

  const usageCount = (p: Product) => {
    const inInvoices = invoices.reduce(
      (n, inv) => n + inv.items.filter(it => it.productId === p.id).length, 0,
    );
    return inInvoices;
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    if (usageCount(toDelete) > 0) {
      toast.error('لا يمكن حذف المنتج لأنه مستخدم في فواتير');
      setToDelete(null);
      return;
    }
    await remove(toDelete.id);
    setToDelete(null);
  };

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some(c => c.name === name)) { toast.error('التصنيف موجود مسبقاً'); return; }
    setCatSaving(true);
    try {
      if (isApiConfigured()) {
        await createCat(name);
      }
      setNewCat('');
    } catch {
      toast.error('تعذّر إضافة التصنيف');
    } finally {
      setCatSaving(false);
    }
  };

  const removeCategory = async (cat: Category) => {
    if (cat.product_count > 0) {
      toast.error('لا يمكن حذف تصنيف مستخدم في منتجات');
      return;
    }
    try {
      if (isApiConfigured()) {
        await removeCat(cat.id);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'تعذّر حذف التصنيف';
      toast.error(msg);
    }
  };

  const handleExport = async () => {
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    setExportLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/products/export`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'products.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success('تم تصدير المنتجات بنجاح');
    } catch {
      toast.error('تعذّر تصدير المنتجات');
    } finally {
      setExportLoading(false);
    }
  };

  const handleTemplateDownload = async () => {
    if (!isApiConfigured()) { toast.error('الاتصال بالخادم غير متاح'); return; }
    try {
      const res = await fetch(`${API_URL}/api/products/export/template`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Template download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'products-template.csv';
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
      const res = await api.upload<{ dry_run: boolean; created: number; skipped: number; results: ImportRowResult[] }>(
        '/api/products/import',
        form,
      );
      setImportPreview({ file, rows: res.results, created: res.created, skipped: res.skipped });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'تعذّر معالجة الملف';
      toast.error(msg);
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
      const res = await api.upload<{ dry_run: boolean; created: number; skipped: number; results: ImportRowResult[] }>(
        '/api/products/import',
        form,
      );
      toast.success(`تم استيراد ${res.created} منتج بنجاح${res.skipped > 0 ? ` (${res.skipped} صف بأخطاء)` : ''}`);
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      await qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'تعذّر استيراد المنتجات';
      toast.error(msg);
    } finally {
      setImportLoading(false);
    }
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportFile(null);
    setImportPreview(null);
  };

  const filteredList = useMemo(() => {
    if (catFilter === 'all') return list;
    if (catFilter === '__none__') return list.filter(p => !p.categoryId);
    return list.filter(p => p.categoryId === catFilter);
  }, [list, catFilter]);

  const columns: Column<Product>[] = [
    { key: 'image', header: '', cell: r => (
      <div className="h-10 w-10 rounded-lg border border-border/60 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
        {r.imageUrl
          ? <img src={resolveAssetUrl(r.imageUrl)} alt={r.name} className="h-full w-full object-cover" />
          : <Package className="h-4 w-4 text-muted-foreground/60" />}
      </div>
    ), className: 'w-14' },
    { key: 'name', header: 'المنتج', cell: r => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{r.name}</span>
        {r.quantity <= r.alertLevel && <AlertTriangle className="h-4 w-4 text-warning" />}
      </div>
    )},
    { key: 'code', header: 'الكود', cell: r => <span className="text-muted-foreground text-sm">{r.code}</span> },
    { key: 'category', header: 'التصنيف', cell: r => <span className="text-muted-foreground text-sm">{r.category || '—'}</span> },
    { key: 'price', header: 'السعر', cell: r => formatCurrency(r.price) },
    { key: 'qty', header: 'الكمية', cell: r => <span className={r.quantity <= r.alertLevel ? 'text-destructive font-semibold' : ''}>{r.quantity}</span> },
    { key: 'alert', header: 'حد التنبيه', cell: r => r.alertLevel },
    { key: 'status', header: 'الحالة', cell: r => <StatusBadge status={r.status} /> },
    { key: 'actions', header: '', cell: r => {
      const used = usageCount(r) > 0;
      return (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={used}
            title={used ? 'مستخدم في فواتير' : 'حذف'}
            onClick={() => setToDelete(r)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    }},
  ];

  const lowStock = list.filter(p => p.quantity <= p.alertLevel);

  return (
    <div>
      <PageHeader title="المنتجات والمخزون" description="إدارة المنتجات وحركة المخزون"
        actions={<>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Download className="h-4 w-4 ml-1" />}
            تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 ml-1" /> استيراد CSV
          </Button>
          <Button variant="outline" onClick={() => { reloadCats(); setCatsOpen(true); }}><Tags className="h-4 w-4 ml-1" /> التصنيفات</Button>
          <Button onClick={() => { setEditing({ ...empty, id: '' }); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> منتج جديد</Button>
        </>} />

      {lowStock.length > 0 && (
        <Card className="p-4 mb-5 border-warning/40 bg-warning/5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">{lowStock.length}</span> منتج وصل لحد التنبيه — يُنصح بإعادة التزويد.
          </div>
        </Card>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="movements">حركة المخزون</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4">
          <DataTable
            data={filteredList}
            columns={columns}
            searchKeys={['name','code']}
            searchPlaceholder="ابحث بالمنتج أو الكود..."
            rightToolbar={
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  <SelectItem value="__none__">بدون تصنيف</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            }
          />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-lg font-medium">قريباً...</p>
            <p className="text-sm">سيتم إضافة سجل حركة المخزون في تحديث قادم.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Product edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? 'تعديل منتج' : 'منتج جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <ProductImageField
              value={editing.imageUrl}
              onChange={(url) => setEditing(s => ({ ...s, imageUrl: url }))}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>اسم المنتج</Label><Input className="mt-1.5" value={editing.name} onChange={e => setEditing(s => ({ ...s, name: e.target.value }))} /></div>
              <div><Label>الكود</Label><Input className="mt-1.5" value={editing.code} onChange={e => setEditing(s => ({ ...s, code: e.target.value }))} /></div>
              <div className="sm:col-span-2">
                <Label>التصنيف</Label>
                <Select
                  value={editing.categoryId ?? '__none__'}
                  onValueChange={(v) => setEditing(s => ({ ...s, categoryId: v === '__none__' ? undefined : v }))}
                >
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر تصنيفاً" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون تصنيف</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>السعر</Label><Input type="number" className="mt-1.5" value={editing.price} onChange={e => setEditing(s => ({ ...s, price: Number(e.target.value) }))} /></div>
              <div><Label>الكمية</Label><Input type="number" className="mt-1.5" value={editing.quantity} onChange={e => setEditing(s => ({ ...s, quantity: Number(e.target.value) }))} /></div>
              <div><Label>حد التنبيه</Label><Input type="number" className="mt-1.5" value={editing.alertLevel} onChange={e => setEditing(s => ({ ...s, alertLevel: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المنتج</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف "{toDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Categories dialog */}
      <Dialog open={catsOpen} onOpenChange={setCatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إدارة التصنيفات</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="اسم التصنيف الجديد"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                disabled={catSaving}
              />
              <Button onClick={addCategory} disabled={catSaving}>
                {catSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 ml-1" /> إضافة</>}
              </Button>
            </div>
            {catsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد تصنيفات بعد.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {categories.map(c => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">({c.product_count})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={c.product_count > 0}
                      title={c.product_count > 0 ? 'مستخدم في منتجات' : 'حذف'}
                      onClick={() => removeCategory(c)}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatsOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import modal */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) closeImport(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>استيراد منتجات من CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-muted-foreground">
                <p className="mb-1">الأعمدة المطلوبة: <span className="font-mono text-foreground text-xs">name, sku, description, price, cost, quantity, alert_level, unit, category, status</span></p>
                <p>التصنيفات غير الموجودة ستُنشأ تلقائياً. يمكن تنزيل نموذج لمعرفة الشكل الصحيح.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleTemplateDownload} className="shrink-0">
                <Download className="h-4 w-4 ml-1" /> نموذج CSV
              </Button>
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
                    <p className="text-xs text-muted-foreground">ملفات CSV فقط</p>
                  </div>
                )}
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,text/csv"
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
                    <span><strong>{importPreview.created}</strong> منتج سيتم إضافته</span>
                  </div>
                  {importPreview.skipped > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span><strong>{importPreview.skipped}</strong> صف بأخطاء</span>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-auto text-xs"
                    onClick={() => { setImportFile(null); setImportPreview(null); }}
                  >
                    تغيير الملف
                  </Button>
                </div>

                {/* Row-level preview table */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-16">الصف</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">اسم المنتج</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importPreview.rows.map(r => (
                          <tr key={r.row} className={r.error ? 'bg-destructive/5' : ''}>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.row}</td>
                            <td className="px-3 py-2 font-medium truncate max-w-xs">{r.name || <span className="italic text-muted-foreground">بدون اسم</span>}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="inline-flex items-center gap-1 text-destructive text-xs">
                                  <XCircle className="h-3.5 w-3.5 shrink-0" />{r.error}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />صالح
                                </span>
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
            <Button variant="outline" onClick={closeImport}>إلغاء</Button>
            <Button
              onClick={handleImportConfirm}
              disabled={!importPreview || importPreview.created === 0 || importLoading}
            >
              {importLoading
                ? <><Loader2 className="h-4 w-4 animate-spin ml-1" /> جارٍ المعالجة...</>
                : `استيراد ${importPreview?.created ?? 0} منتج`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ProductImageField = ({ value, onChange }: { value?: string; onChange: (url: string | undefined) => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const preview = resolveAssetUrl(value);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('يجب اختيار صورة');
    if (file.size > 2 * 1024 * 1024) return toast.error('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت');
    if (isApiConfigured()) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('kind', 'image');
        form.append('file', file);
        const res = await api.upload<{ data: { url: string } }>('/api/uploads', form);
        onChange(res.data.url);
      } catch {
        toast.error('تعذّر رفع الصورة');
      } finally { setUploading(false); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <Label>صورة المنتج</Label>
      <div className="mt-1.5 flex items-start gap-3">
        <div className="h-20 w-20 rounded-lg border border-dashed border-border/70 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : preview ? <img src={preview} alt="" className="h-full w-full object-cover" />
            : <ImageIcon className="h-6 w-6 text-muted-foreground/60" />}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">PNG / JPG حتى 2 ميجا. تظهر في قائمة المنتجات والفواتير.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? 'جارٍ الرفع…' : value ? 'تغيير الصورة' : 'رفع صورة'}
            </Button>
            {value && !uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>إزالة</Button>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
};

export default Products;
