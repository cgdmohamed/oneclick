import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/common/SearchableSelect';

interface Product { id: string; name: string; sku?: string | null; product_type?: string; average_cost?: string | number; cost?: string | number; quantity: string | number }
interface Dimension { id: string; code?: string | null; name: string; is_active: boolean }
interface Item { product_id: string; quantity: string; unit_cost: string; reason: string; notes: string }

const reasons = [
  ['damaged', 'تالف'],
  ['expired', 'منتهي الصلاحية'],
  ['broken', 'مكسور'],
  ['missing', 'مفقود'],
  ['theft', 'سرقة'],
  ['quality_issue', 'مشكلة جودة'],
  ['inventory_count_difference', 'فرق جرد'],
  ['other', 'أخرى'],
] as const;

const blankItem = (): Item => ({ product_id: '', quantity: '1', unit_cost: '0', reason: '', notes: '' });

const NewInventoryWriteOff = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [reason, setReason] = useState('damaged');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'posted'>('draft');
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<{ data: Product[] }>('/api/products?page_size=500')).data ?? [] });
  const branches = useQuery({ queryKey: ['branches'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/branches')).data ?? [] });
  const costCenters = useQuery({ queryKey: ['cost-centers'], queryFn: async () => (await api.get<{ data: Dimension[] }>('/api/cost-centers')).data ?? [] });
  const stockProducts = (products.data ?? []).filter((p) => p.product_type === 'stock');

  const updateItem = (idx: number, patch: Partial<Item>) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  const totals = useMemo(() => {
    const total = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
    return { total };
  }, [items]);

  const submit = async () => {
    const validItems = items.filter((item) => item.product_id && Number(item.quantity) > 0 && Number(item.unit_cost) >= 0);
    if (!validItems.length) return toast.error('أضف بند شطب واحد على الأقل');
    setSaving(true);
    try {
      const res = await api.post<{ data: { id: string } }>('/api/inventory-write-offs', {
        write_off_date: new Date(date).toISOString(),
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
        reason,
        notes: notes || null,
        status,
        items: validItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          reason: item.reason || null,
          notes: item.notes || null,
        })),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inventory-write-offs'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
      ]);
      toast.success(status === 'posted' ? 'تم ترحيل شطب المخزون' : 'تم حفظ مسودة الشطب');
      navigate(`/app/inventory-write-offs/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ شطب المخزون');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/app/inventory-write-offs" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة لشطب المخزون</Link>
      <PageHeader title="شطب مخزون جديد" description="سجل التالف أو المفقود مع التأثير المحاسبي" />
      <Card className="p-4 border-border/60">
        <div className="grid md:grid-cols-5 gap-4">
          <div><Label>التاريخ</Label><Input className="mt-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>السبب</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><Label>الفرع</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">بدون</option>{(branches.data ?? []).filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><Label>مركز التكلفة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}><option value="">بدون</option>{(costCenters.data ?? []).filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><Label>الحالة</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'posted')}><option value="draft">مسودة</option><option value="posted">ترحيل مباشر</option></select></div>
        </div>
        <div className="mt-4"><Label>ملاحظات</Label><Textarea className="mt-1.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </Card>

      <Card className="p-4 border-border/60 space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid xl:grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_1fr_auto] gap-2 items-end">
            <div>
              <Label>المنتج</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  value={item.product_id}
                  onValueChange={(v) => {
                    const p = stockProducts.find((prod) => prod.id === v);
                    updateItem(idx, { product_id: v, unit_cost: String(p?.average_cost ?? p?.cost ?? 0) });
                  }}
                  options={stockProducts.map(p => ({ value: p.id, label: `${p.name} (${Number(p.quantity)} متاح)` }))}
                  placeholder="اختر منتجاً"
                  searchPlaceholder="ابحث عن منتج..."
                />
              </div>
            </div>
            <div><Label>الكمية</Label><Input className="mt-1.5" type="number" min={0} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></div>
            <div><Label>تكلفة الوحدة</Label><Input className="mt-1.5" type="number" min={0} step="0.01" value={item.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: e.target.value })} /></div>
            <div><Label>الإجمالي</Label><div className="h-10 flex items-center text-sm font-medium">{formatCurrency(Number(item.quantity || 0) * Number(item.unit_cost || 0))}</div></div>
            <div><Label>سبب البند</Label><select className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={item.reason} onChange={(e) => updateItem(idx, { reason: e.target.value })}><option value="">سبب المستند</option>{reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <Button variant="ghost" size="icon" className="text-destructive" disabled={items.length === 1} onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setItems(prev => [...prev, blankItem()])}><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">إجمالي التكلفة: <span className="font-semibold text-foreground">{formatCurrency(totals.total)}</span></div>
        <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
      </div>
    </div>
  );
};

export default NewInventoryWriteOff;
