import { useMemo, useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, PackagePlus, UserPlus, AlertTriangle, Paperclip, Image as ImageIcon, X, Check, ChevronsUpDown } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { InvoiceSummary } from '@/components/common/InvoiceSummary';
import { useClients, useProducts } from '@/hooks/entities';
import { api, ApiError, isApiConfigured } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EGP_CURRENCY_CODE } from '@/lib/currency';

interface Item { id: string; name: string; quantity: number; unitPrice: number; discount: number; productId?: string; vatRate?: number }
interface Account { id: string; name: string; type: string; }

/* ── Quick-create forms ─────────────────────────────────────────── */
interface NewClientForm {
  name: string; phone: string; whatsapp: string; email: string; address: string; tax_number: string; currency: string;
}
interface NewProductForm {
  name: string; sku: string; price: string; quantity: string; unit: string; category_id: string; alertLevel: string;
}

const emptyClient: NewClientForm = { name: '', phone: '', whatsapp: '', email: '', address: '', tax_number: '', currency: EGP_CURRENCY_CODE };
const NO_CATEGORY = '__none__';
const emptyProduct: NewProductForm = { name: '', sku: '', price: '', quantity: '0', unit: 'قطعة', category_id: NO_CATEGORY, alertLevel: '5' };

/* ── Helpers ────────────────────────────────────────────────────── */
const normalize = (s: string) => s.trim().toLowerCase();

interface NewInvoiceProps {
  asModal?: boolean;
  defaultClientId?: string | null;
  onCancel?: () => void;
  onCreated?: (invoiceId: string | null) => void;
}

const NewInvoice = ({ asModal = false, defaultClientId, onCancel, onCreated }: NewInvoiceProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc       = useQueryClient();
  const { list: clients }  = useClients();
  const { list: products } = useProducts();
  const requestedClientId = defaultClientId ?? searchParams.get('client');

  /* Invoice state */
  const [clientId, setClientId] = useState('');
  const [items, setItems]       = useState<Item[]>([{ id: 'i1', name: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 15 }]);
  const [taxRate, setTaxRate]   = useState(15);
  const [discount, setDiscount] = useState(0);
  const [dueDate, setDueDate]   = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [enableInitialCollection, setEnableInitialCollection] = useState(false);
  const [initialCollection, setInitialCollection] = useState({ amount: '0', account_id: '', method: 'cash', reference: '', notes: '' });
  const [internalAttachment, setInternalAttachment] = useState<{
    type: 'none' | 'text' | 'image';
    text: string;
    uploadId: string;
    fileName: string;
  }>({ type: 'none', text: '', uploadId: '', fileName: '' });
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const accounts = useQuery({
    enabled: isApiConfigured(),
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<{ data: Account[] }>('/api/accounts?page_size=300')).data ?? [],
  });

  /* Default client once list loads */
  useEffect(() => {
    if (requestedClientId && clients.some(c => c.id === requestedClientId)) {
      setClientId(requestedClientId);
      return;
    }
    if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [clientId, clients, requestedClientId]);

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
        whatsapp:   newClient.whatsapp   || null,
        email:      newClient.email      || null,
        address:    newClient.address    || null,
        tax_number: newClient.tax_number || null,
        currency:   EGP_CURRENCY_CODE,
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
  const [categories, setCategories]       = useState<{ id: string; name: string; parent_id?: string | null; parent_name?: string | null }[]>([]);

  const loadCategories = useCallback(async () => {
    if (!isApiConfigured()) return;
    try {
      const res = await api.get<{ data: { id: string; name: string; parent_id?: string | null; parent_name?: string | null }[] }>('/api/categories');
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
        alert_level: parseInt(newProduct.alertLevel, 10) || 5,
        category_id: (newProduct.category_id && newProduct.category_id !== NO_CATEGORY) ? newProduct.category_id : null,
        is_active:   true,
      });
      const created = res.data;
      await qc.invalidateQueries({ queryKey: ['products'] });
      if (addProductRow !== null) {
        update(addProductRow, { productId: created.id, name: created.name, unitPrice: Number(created.price), vatRate: taxRate });
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
    if (ex) update(rowIndex, { productId: ex.id, name: ex.name, unitPrice: ex.price, vatRate: ex.vatRate ?? taxRate });
  };

  /* ── Invoice line helpers ───────────────────────────────────── */
  const lineGross = (it: Item) => it.quantity * it.unitPrice;
  const lineDiscount = (it: Item) => Math.min(Math.max(Number(it.discount || 0), 0), lineGross(it));
  const lineNet = (it: Item) => lineGross(it) - lineDiscount(it);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + lineGross(it), 0);
    const itemDiscount = items.reduce((s, it) => s + lineDiscount(it), 0);
    const headerDiscount = Math.min(Math.max(Number(discount || 0), 0), Math.max(0, subtotal - itemDiscount));
    const totalDiscount = Math.min(subtotal, headerDiscount + itemDiscount);
    const taxBase = Math.max(0, subtotal - totalDiscount);
    const headerDiscountBase = Math.max(0, subtotal - itemDiscount);
    const tax = +items.reduce((s, it) => {
      const netAfterItemDiscount = lineNet(it);
      const allocatedHeaderDiscount = headerDiscountBase > 0 ? headerDiscount * (netAfterItemDiscount / headerDiscountBase) : 0;
      return s + Math.max(0, netAfterItemDiscount - allocatedHeaderDiscount) * ((it.vatRate ?? taxRate) / 100);
    }, 0).toFixed(2);
    const total    = +(taxBase + tax).toFixed(2);
    return { subtotal, itemDiscount, headerDiscount, totalDiscount, tax, total };
  }, [items, taxRate, discount]);

  const addItem    = () => setItems(p => [...p, { id: `i${Date.now()}`, name: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: taxRate }]);
  const update     = (i: number, patch: Partial<Item>) => setItems(p => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove     = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const pickProduct = (i: number, pid: string) => {
    const p = products.find(x => x.id === pid);
    if (p) update(i, { productId: pid, name: p.name, unitPrice: p.price, vatRate: p.vatRate ?? taxRate });
    setProductPickerOpen(null);
  };

  const productSearchText = (p: typeof products[number]) =>
    [p.name, p.code, p.barcode].filter(Boolean).join(' ');

  const productDisplayName = (productId?: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return '';
    return `${p.name}${p.barcode ? ` - ${p.barcode}` : p.code ? ` - ${p.code}` : ''}`;
  };

  const uploadInternalImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('الملحق الداخلي يجب أن يكون صورة');
    if (file.size > 5 * 1024 * 1024) return toast.error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت');
    if (!isApiConfigured()) return toast.error('رفع الصور يتطلب الاتصال بالخادم');
    setAttachmentUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'attachment');
      const res = await api.upload<{ data: { id: string; url: string } }>('/api/uploads', form);
      setInternalAttachment({ type: 'image', text: '', uploadId: res.data.id, fileName: file.name });
      toast.success('تم رفع الملحق الداخلي');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'تعذّر رفع الملحق');
    } finally {
      setAttachmentUploading(false);
    }
  };

  /* ── Submit ─────────────────────────────────────────────────── */
  const submit = async (draft: boolean) => {
    if (!clientId) return toast.error('اختر عميلاً');
    if (items.some(it => !it.name || it.quantity <= 0)) return toast.error('أكمل بيانات بنود الفاتورة');
    if (internalAttachment.type === 'text' && !internalAttachment.text.trim()) return toast.error('اكتب نص الملحق الداخلي أو ألغِ الملحق');
    if (internalAttachment.type === 'image' && !internalAttachment.uploadId) return toast.error('ارفع صورة الملحق الداخلي أولاً');
    if (attachmentUploading) return toast.error('انتظر انتهاء رفع الملحق');
    const collectionAmount = Number(initialCollection.amount || 0);
    if (!draft && enableInitialCollection && collectionAmount > totals.total + 0.005) return toast.error('مبلغ التحصيل أكبر من إجمالي الفاتورة');
    if (!draft && enableInitialCollection && collectionAmount > 0 && !initialCollection.account_id) return toast.error('اختر حساب التحصيل');
    setSaving(true);
    try {
      if (isApiConfigured()) {
        const res = await api.post<{ data: { id: string } }>('/api/invoices', {
          client_id: clientId,
          due_date:  new Date(dueDate).toISOString(),
          discount: totals.headerDiscount,
          internal_attachment: internalAttachment.type === 'none' ? null : internalAttachment.type === 'text' ? {
            type: 'text',
            text: internalAttachment.text.trim(),
          } : {
            type: 'image',
            upload_id: internalAttachment.uploadId,
          },
          draft,
          initial_collection: !draft && enableInitialCollection && collectionAmount > 0 ? {
            amount: collectionAmount,
            account_id: initialCollection.account_id,
            method: initialCollection.method,
            reference: initialCollection.reference || null,
            notes: initialCollection.notes || null,
          } : null,
          items: items.map(it => ({
            product_id:  it.productId ?? null,
            description: it.name,
            quantity:    it.quantity,
            unit_price:  it.unitPrice,
            discount:    lineDiscount(it),
            vat_rate:    it.vatRate ?? taxRate,
          })),
        });
        qc.invalidateQueries({ queryKey: ['invoices'] });
        qc.invalidateQueries({ queryKey: ['reports-overview'] });
        toast.success(draft ? 'تم حفظ المسودة' : 'تم حفظ الفاتورة');
        if (onCreated) onCreated(res.data.id);
        else navigate(`/app/invoices/${res.data.id}`);
      } else {
        toast.success(draft ? 'حفظ مسودة (تجريبي)' : 'حفظ فاتورة (تجريبي)');
        if (onCreated) onCreated(null);
        else navigate('/app/invoices');
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
      {!asModal && <PageHeader title="فاتورة جديدة" description="أنشئ فاتورة لعميلك" />}

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
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">المنتج</Label>
                    <div className="flex gap-1 mt-0.5">
                      <Popover open={productPickerOpen === it.id} onOpenChange={(open) => setProductPickerOpen(open ? it.id : null)}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={productPickerOpen === it.id}
                            className="h-9 flex-1 justify-between px-3 font-normal"
                          >
                            <span className="truncate text-start">
                              {it.productId ? productDisplayName(it.productId) : 'ابحث عن منتج...'}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-0" align="start" dir="rtl">
                          <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                            <CommandInput placeholder="ابحث بالاسم أو الكود أو الباركود..." />
                            <CommandList>
                              <CommandEmpty>لا توجد منتجات مطابقة</CommandEmpty>
                              <CommandGroup>
                                {products.map(p => (
                                  <CommandItem
                                    key={p.id}
                                    value={productSearchText(p)}
                                    onSelect={() => pickProduct(i, p.id)}
                                  >
                                    <Check className={cn('h-4 w-4', it.productId === p.id ? 'opacity-100' : 'opacity-0')} />
                                    <div className="min-w-0 flex-1 text-start">
                                      <div className="truncate font-medium">{p.name}</div>
                                      {(p.barcode || p.code) && (
                                        <div className="truncate text-xs text-muted-foreground">
                                          {[p.code, p.barcode].filter(Boolean).join(' - ')}
                                        </div>
                                      )}
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(p.price)}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
                  <div className="col-span-12 md:col-span-2">
                    <Label className="text-xs">الوصف</Label>
                    <Input value={it.name} onChange={e => update(i, { name: e.target.value })} placeholder="اسم المنتج/الخدمة" />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    <Label className="text-xs">الكمية</Label>
                    <Input type="number" min={1} value={it.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Label className="text-xs">سعر الوحدة</Label>
                    <Input type="number" min={0} step="0.01" value={it.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-6 md:col-span-1">
                    <Label className="text-xs">خصم البند</Label>
                    <Input type="number" min={0} step="0.01" value={it.discount} onChange={e => update(i, { discount: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-6 md:col-span-1">
                    <Label className="text-xs">الضريبة</Label>
                    <Input type="number" min={0} step="0.01" value={it.vatRate ?? taxRate} onChange={e => update(i, { vatRate: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="col-span-12 text-end text-sm text-muted-foreground">
                    الإجمالي بعد خصم البند: <span className="font-semibold text-foreground">{formatCurrency(lineNet(it))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card className="p-4 border-border/60 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold inline-flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />
                  ملحق داخلي
                </div>
                <p className="text-xs text-muted-foreground mt-1">لن يظهر في الرابط العام أو الطباعة.</p>
              </div>
              {internalAttachment.type !== 'none' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInternalAttachment({ type: 'none', text: '', uploadId: '', fileName: '' })}
                >
                  <X className="h-4 w-4 ml-1" /> إزالة
                </Button>
              )}
            </div>
            <Select
              value={internalAttachment.type}
              onValueChange={(value: 'none' | 'text' | 'image') => setInternalAttachment((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون ملحق</SelectItem>
                <SelectItem value="text">نص داخلي</SelectItem>
                <SelectItem value="image">صورة داخلية</SelectItem>
              </SelectContent>
            </Select>
            {internalAttachment.type === 'text' && (
              <Textarea
                rows={3}
                value={internalAttachment.text}
                onChange={(e) => setInternalAttachment((prev) => ({ ...prev, text: e.target.value }))}
                placeholder="اكتب ملاحظة أو ملحقًا داخليًا مرتبطًا بهذه الفاتورة..."
              />
            )}
            {internalAttachment.type === 'image' && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" disabled={attachmentUploading} onClick={() => document.getElementById('invoice-internal-attachment')?.click()}>
                  <ImageIcon className="h-4 w-4 ml-1" />
                  {attachmentUploading ? 'جارٍ الرفع...' : internalAttachment.fileName ? 'تغيير الصورة' : 'رفع صورة'}
                </Button>
                {internalAttachment.fileName && <span className="text-sm text-muted-foreground">{internalAttachment.fileName}</span>}
                <Input
                  id="invoice-internal-attachment"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadInternalImage(e.target.files?.[0])}
                />
              </div>
            )}
          </Card>

          {/* Tax + discount */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>نسبة الضريبة (%)</Label>
              <Input type="number" min={0} value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="mt-1.5" />
            </div>
            <div>
              <Label>خصم إضافي على الفاتورة</Label>
              <Input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))} className="mt-1.5" />
              {totals.itemDiscount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  خصومات البنود: {formatCurrency(totals.itemDiscount)}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ── Sidebar summary ── */}
        <div className="space-y-4">
          <InvoiceSummary subtotal={totals.subtotal} tax={totals.tax} discount={totals.totalDiscount} total={totals.total} paid={0} remaining={totals.total} />
          <Card className="p-5 border-border/60 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={enableInitialCollection} onChange={(e) => setEnableInitialCollection(e.target.checked)} />
              تحصيل عند إنشاء الفاتورة
            </label>
            {enableInitialCollection && (
              <div className="space-y-3">
                <div>
                  <Label>مبلغ التحصيل</Label>
                  <Input className="mt-1.5" type="number" min="0" max={totals.total} step="0.01" value={initialCollection.amount} onChange={(e) => setInitialCollection((p) => ({ ...p, amount: e.target.value }))} />
                </div>
                <div>
                  <Label>حساب التحصيل</Label>
                  <Select value={initialCollection.account_id} onValueChange={(v) => setInitialCollection((p) => ({ ...p, account_id: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                    <SelectContent>{(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الطريقة</Label>
                  <Select value={initialCollection.method} onValueChange={(v) => setInitialCollection((p) => ({ ...p, method: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cash">نقدي</SelectItem><SelectItem value="bank">تحويل بنكي</SelectItem><SelectItem value="wallet">محفظة إلكترونية</SelectItem></SelectContent>
                  </Select>
                </div>
                <Input placeholder="المرجع" value={initialCollection.reference} onChange={(e) => setInitialCollection((p) => ({ ...p, reference: e.target.value }))} />
                <Input placeholder="ملاحظات" value={initialCollection.notes} onChange={(e) => setInitialCollection((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            )}
          </Card>
          <Card className="p-5 border-border/60 space-y-2">
            <Button className="w-full" onClick={() => submit(false)} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ الفاتورة وإرسالها'}
            </Button>
            <Button className="w-full" variant="outline" onClick={() => submit(true)} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
            </Button>
            {asModal && (
              <Button className="w-full" variant="ghost" onClick={onCancel} disabled={saving}>
                إلغاء
              </Button>
            )}
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
                <Label>رقم الهاتف *</Label>
                <Input className="mt-1.5" type="tel" value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} placeholder="05xxxxxxxx" />
              </div>
              <div>
                <Label>رقم واتساب</Label>
                <Input className="mt-1.5" type="tel" value={newClient.whatsapp} onChange={e => setNewClient(p => ({ ...p, whatsapp: e.target.value }))} placeholder="05xxxxxxxx" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input className="mt-1.5" type="email" value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <Label>الرقم الضريبي</Label>
                <Input className="mt-1.5" inputMode="numeric" pattern="[0-9]*" value={newClient.tax_number} onChange={e => setNewClient(p => ({ ...p, tax_number: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>العنوان</Label>
              <Input className="mt-1.5" value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} />
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
              <div>
                <Label>السعر *</Label>
                <Input className="mt-1.5" type="number" min="0" step="0.01" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>الكمية الأولية</Label>
                <Input className="mt-1.5" type="number" min="0" value={newProduct.quantity} onChange={e => setNewProduct(p => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>حد التنبيه</Label>
                <Input className="mt-1.5" type="number" min="0" value={newProduct.alertLevel} onChange={e => setNewProduct(p => ({ ...p, alertLevel: e.target.value }))} />
              </div>
            </div>
            {categories.length > 0 && (
              <div>
                <Label>التصنيف</Label>
                <Select value={newProduct.category_id} onValueChange={v => setNewProduct(p => ({ ...p, category_id: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>بدون تصنيف</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</SelectItem>)}
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
