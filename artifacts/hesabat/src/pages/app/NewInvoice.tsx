import { useMemo, useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, PackagePlus, UserPlus, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { InvoiceSummary } from '@/components/common/InvoiceSummary';
import { useClients, useProducts } from '@/hooks/entities';
import { api, ApiError, isApiConfigured } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface Item { id: string; name: string; quantity: number; unitPrice: number; productId?: string }

/* ── Quick-create forms ─────────────────────────────────────────── */
interface NewClientForm {
  name: string; phone: string; email: string; address: string; tax_number: string;
}
interface NewProductForm {
  name: string; sku: string; price: string; quantity: string; unit: string; category_id: string;
}

const emptyClient:  NewClientForm  = { name: '', phone: '', email: '', address: '', tax_number: '' };
const NO_CATEGORY = '__none__';
const emptyProduct: NewProductForm = { name: '', sku: '', price: '', quantity: '0', unit: 'قطعة', category_id: NO_CATEGORY };

/* ── Helpers ────────────────────────────────────────────────────── */
const normalize = (s: string) => s.trim().toLowerCase();

const NewInvoice = () => {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { list: clients }  = useClients();
  const { list: products } = useProducts();

  /* Invoice state */
  const [clientId, setClientId] = useState('');
  const [items, setItems]       = useState<Item[]>([{ id: 'i1', name: '', quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate]   = useState(15);
  const [discount, setDiscount] = useState(0);
  const [dueDate, setDueDate]   = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [saving, setSaving]     = useState(false);

  /* Default client once list loads */
  if (!clientId && clients[0]) setClientId(clients[0].id);

  /* ── Quick client creation ──────────────────────────────────── */
  const [clientOpen, setClientOpen]       = useState(false);
  const [newClient, setNewClient]         = useState<NewClientForm>(emptyClient);
  const [clientSaving, setClientSaving]   = useState(false);
  const [dupClient, setDupClient]         = useState<{ id: string; name: string } | null>(null);

  const openQuickClient = () => {
    setNewClient(emptyClient);
    setDupClient(null);
    setClientOpen(true);
  };

  const saveQuickClient = async (forceDuplicate = false) => {
    const name = newClient.name.trim();
    if (!name) return toast.error('اسم العميل مطلوب');

    /* Duplicate check */
    if (!forceDuplicate) {
      const existing = clients.find(c => normalize(c.name) === normalize(name));
      if (existing) {
        setDupClient({ id: existing.id, name: existing.name });
        return; // show confirm dialog
      }
    }

    setClientSaving(true);
    try {
      const res = await api.post<{ data: { id: string; name: string } }>('/api/clients', {
        name,
        phone:      newClient.phone      || null,
        email:      newClient.email      || null,
        address:    newClient.address    || null,
        tax_number: newClient.tax_number || null,
      });
      await qc.invalidateQueries({ queryKey: ['clients'] });
      setClientId(res.data.id);
      toast.success(`تم إضافة العميل «${res.data.name}»`);
      setClientOpen(false);
      setDupClient(null);
    } catch {
      toast.error('تعذّر إضافة العميل');
    } finally {
      setClientSaving(false);
    }
  };

  /* ── Quick product creation ─────────────────────────────────── */
  const [productOpen, setProductOpen]     = useState(false);
  const [addProductRow, setAddProductRow] = useState<number | null>(null);
  const [newProduct, setNewProduct]       = useState<NewProductForm>(emptyProduct);
  const [productSaving, setProductSaving] = useState(false);
  const [dupProduct, setDupProduct]       = useState<{ id: string; name: string } | null>(null);
  const [categories, setCategories]       = useState<{ id: string; name: string }[]>([]);

  const loadCategories = useCallback(async () => {
    if (!isApiConfigured()) return;
    try {
      const res = await api.get<{ data: { id: string; name: string }[] }>('/api/categories');
      setCategories(res.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const openQuickProduct = (rowIndex: number) => {
    setAddProductRow(rowIndex);
    setNewProduct(emptyProduct);
    setDupProduct(null);
    setProductOpen(true);
  };

  const saveQuickProduct = async (forceDuplicate = false) => {
    const name = newProduct.name.trim();
    if (!name) return toast.error('اسم المنتج مطلوب');
    const price = parseFloat(newProduct.price);
    if (isNaN(price) || price < 0) return toast.error('السعر غير صحيح');

    /* Duplicate check — by name or SKU */
    if (!forceDuplicate) {
      const existing = products.find(p =>
        normalize(p.name) === normalize(name) ||
        (newProduct.sku.trim() && p.code && normalize(p.code) === normalize(newProduct.sku.trim())),
      );
      if (existing) {
        setDupProduct({ id: existing.id, name: existing.name });
        return;
      }
    }

    setProductSaving(true);
    try {
      const res = await api.post<{ data: { id: string; name: string; price: string | number } }>('/api/products', {
        name,
        sku:         newProduct.sku || null,
        price,
        quantity:    parseInt(newProduct.quantity, 10) || 0,
        unit:        newProduct.unit || 'قطعة',
        category_id: (newProduct.category_id && newProduct.category_id !== NO_CATEGORY) ? newProduct.category_id : null,
        is_active:   true,
      });
      const created = res.data;
      await qc.invalidateQueries({ queryKey: ['products'] });
      if (addProductRow !== null) {
        update(addProductRow, { productId: created.id, name: created.name, unitPrice: Number(created.price) });
      }
      toast.success(`تم إضافة المنتج «${created.name}»`);
      setProductOpen(false);
      setDupProduct(null);
    } catch {
      toast.error('تعذّر إضافة المنتج');
    } finally {
      setProductSaving(false);
    }
  };

  /* Pick existing product → auto-fill description + price */
  const pickExistingProduct = (rowIndex: number, pid: string) => {
    setDupProduct(null);
    setProductOpen(false);
    const ex = products.find(p => p.id === pid);
    if (ex) update(rowIndex, { productId: ex.id, name: ex.name, unitPrice: ex.price });
  };

  /* ── Invoice line helpers ───────────────────────────────────── */
  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const tax      = +(subtotal * (taxRate / 100)).toFixed(2);
    const total    = +(subtotal + tax - discount).toFixed(2);
    return { subtotal, tax, total };
  }, [items, taxRate, discount]);

  const addItem    = () => setItems(p => [...p, { id: `i${Date.now()}`, name: '', quantity: 1, unitPrice: 0 }]);
  const update     = (i: number, patch: Partial<Item>) => setItems(p => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove     = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const pickProduct = (i: number, pid: string) => {
    const p = products.find(x => x.id === pid);
    if (p) update(i, { productId: pid, name: p.name, unitPrice: p.price });
  };

  /* ── Submit ─────────────────────────────────────────────────── */
  const submit = async (draft: boolean) => {
    if (!clientId) return toast.error('اختر عميلاً');
    if (items.some(it => !it.name || it.quantity <= 0)) return toast.error('أكمل بيانات بنود الفاتورة');
    setSaving(true);
    try {
      if (isApiConfigured()) {
        const res = await api.post<{ data: { id: string } }>('/api/invoices', {
          client_id: clientId,
          due_date:  new Date(dueDate).toISOString(),
          discount,
          draft,
          items: items.map(it => ({
            product_id:  it.productId ?? null,
            description: it.name,
            quantity:    it.quantity,
            unit_price:  it.unitPrice,
            vat_rate:    taxRate,
          })),
        });
        qc.invalidateQueries({ queryKey: ['invoices'] });
        qc.invalidateQueries({ queryKey: ['reports-overview'] });
        toast.success(draft ? 'تم حفظ المسودة' : 'تم حفظ الفاتورة');
        navigate(`/app/invoices/${res.data.id}`);
      } else {
        toast.success(draft ? 'حفظ مسودة (تجريبي)' : 'حفظ فاتورة (تجريبي)');
        navigate('/app/invoices');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر حفظ الفاتورة');
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader title="فاتورة جديدة" description="أنشئ فاتورة لعميلك" />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Main form ── */}
        <Card className="lg:col-span-2 p-5 space-y-5 border-border/60 shadow-soft">

          {/* Client + Due date */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>العميل</Label>
              <div className="flex gap-1 mt-1.5">
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر عميلاً" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-9 w-9"
                  title="إضافة عميل جديد"
                  onClick={openQuickClient}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>تاريخ الاستحقاق</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">بنود الفاتورة</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 ml-1" /> إضافة بند
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-border/70 bg-card">
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">المنتج</Label>
                    <div className="flex gap-1 mt-0.5">
                      <Select value={it.productId ?? ''} onValueChange={(v) => pickProduct(i, v)}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="اختياري" /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0 h-9 w-9"
                        title="إضافة منتج جديد"
                        onClick={() => openQuickProduct(i)}
                      >
                        <PackagePlus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">الوصف</Label>
                    <Input value={it.name} onChange={e => update(i, { name: e.target.value })} placeholder="اسم المنتج/الخدمة" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs">الكمية</Label>
                    <Input type="number" min={1} value={it.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Label className="text-xs">سعر الوحدة</Label>
                    <Input type="number" min={0} step="0.01" value={it.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="col-span-12 text-end text-sm text-muted-foreground">
                    الإجمالي: <span className="font-semibold text-foreground">{formatCurrency(it.quantity * it.unitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tax + discount */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>نسبة الضريبة (%)</Label>
              <Input type="number" min={0} value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="mt-1.5" />
            </div>
            <div>
              <Label>الخصم</Label>
              <Input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))} className="mt-1.5" />
            </div>
          </div>
        </Card>

        {/* ── Sidebar summary ── */}
        <div className="space-y-4">
          <InvoiceSummary subtotal={totals.subtotal} tax={totals.tax} discount={discount} total={totals.total} paid={0} remaining={totals.total} />
          <Card className="p-5 border-border/60 space-y-2">
            <Button className="w-full" onClick={() => submit(false)} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ الفاتورة وإرسالها'}
            </Button>
            <Button className="w-full" variant="outline" onClick={() => submit(true)} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
            </Button>
          </Card>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          QUICK CLIENT CREATION MODAL
      ════════════════════════════════════════════════════════ */}
      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> إضافة عميل جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>اسم العميل *</Label>
              <Input
                className="mt-1.5"
                value={newClient.name}
                onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                placeholder="الاسم الكامل أو اسم الشركة"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الهاتف</Label>
                <Input className="mt-1.5" value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} placeholder="05xxxxxxxx" />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input className="mt-1.5" type="email" value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>العنوان</Label>
              <Input className="mt-1.5" value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <Label>الرقم الضريبي</Label>
              <Input className="mt-1.5" value={newClient.tax_number} onChange={e => setNewClient(p => ({ ...p, tax_number: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveQuickClient(false)} disabled={clientSaving}>
              {clientSaving ? 'جارٍ الإضافة...' : 'إضافة العميل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate client warning */}
      <AlertDialog open={Boolean(dupClient)} onOpenChange={v => !v && setDupClient(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> عميل مشابه موجود
            </AlertDialogTitle>
            <AlertDialogDescription>
              يوجد عميل باسم «{dupClient?.name}» مسبقاً. هل تريد اختياره بدلاً من إنشاء عميل جديد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => { setDupClient(null); }}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => {
                if (dupClient) setClientId(dupClient.id);
                setClientOpen(false);
                setDupClient(null);
                toast.success('تم اختيار العميل الموجود');
              }}
            >
              استخدام الموجود
            </AlertDialogAction>
            <AlertDialogAction onClick={() => saveQuickClient(true)}>
              إنشاء جديد على أي حال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
          QUICK PRODUCT CREATION MODAL
      ════════════════════════════════════════════════════════ */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5" /> إضافة منتج جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>اسم المنتج *</Label>
              <Input
                className="mt-1.5"
                value={newProduct.name}
                onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                placeholder="اسم المنتج أو الخدمة"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU</Label>
                <Input className="mt-1.5" value={newProduct.sku} onChange={e => setNewProduct(p => ({ ...p, sku: e.target.value }))} placeholder="اختياري" />
              </div>
              <div>
                <Label>الوحدة</Label>
                <Input className="mt-1.5" value={newProduct.unit} onChange={e => setNewProduct(p => ({ ...p, unit: e.target.value }))} placeholder="قطعة" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>السعر *</Label>
                <Input className="mt-1.5" type="number" min="0" step="0.01" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>الكمية الأولية</Label>
                <Input className="mt-1.5" type="number" min="0" value={newProduct.quantity} onChange={e => setNewProduct(p => ({ ...p, quantity: e.target.value }))} />
              </div>
            </div>
            {categories.length > 0 && (
              <div>
                <Label>التصنيف</Label>
                <Select value={newProduct.category_id} onValueChange={v => setNewProduct(p => ({ ...p, category_id: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>بدون تصنيف</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveQuickProduct(false)} disabled={productSaving}>
              {productSaving ? 'جارٍ الإضافة...' : 'إضافة المنتج'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate product warning */}
      <AlertDialog open={Boolean(dupProduct)} onOpenChange={v => !v && setDupProduct(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> منتج مشابه موجود
            </AlertDialogTitle>
            <AlertDialogDescription>
              يوجد منتج باسم «{dupProduct?.name}» مسبقاً. هل تريد اختياره بدلاً من إنشاء منتج جديد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => setDupProduct(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => {
                if (dupProduct && addProductRow !== null) {
                  pickExistingProduct(addProductRow, dupProduct.id);
                }
                setDupProduct(null);
                toast.success('تم اختيار المنتج الموجود');
              }}
            >
              استخدام الموجود
            </AlertDialogAction>
            <AlertDialogAction onClick={() => saveQuickProduct(true)}>
              إنشاء جديد على أي حال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NewInvoice;
