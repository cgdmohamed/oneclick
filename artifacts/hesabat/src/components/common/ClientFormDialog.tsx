/**
 * Shared "add/edit client" dialog — the single client-creation screen used
 * both from the Clients list page and from any other screen that needs to
 * create a client inline (e.g. the quick-add button on New Invoice).
 * Having one implementation means a validation/UX fix made here (phone
 * required, tax-number digit stripping, duplicate-phone warning, the
 * "register as supplier too" switch) reaches every entry point at once.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { EGP_CURRENCY_CODE, EGP_CURRENCY_SYMBOL } from '@/lib/currency';
import type { Client } from '@/types';
import { useClients, useSuppliersLite } from '@/hooks/entities';

const empty: Client = {
  id: '', companyId: '', name: '', phone: '', whatsapp: '', email: '', address: '', taxNumber: '',
  currency: EGP_CURRENCY_CODE, currencySymbol: EGP_CURRENCY_SYMBOL, createdAt: '', linkedSupplierId: null,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing client to edit it; omit/null to create a new one. */
  client?: Client | null;
  /** Called once the client is saved successfully, with its id/name. */
  onSaved?: (client: { id: string; name: string }) => void;
}

export const ClientFormDialog = ({ open, onOpenChange, client, onSaved }: Props) => {
  const qc = useQueryClient();
  const { list, save } = useClients();
  const suppliers = useSuppliersLite();
  const isNew = !client?.id;

  const [editing, setEditing] = useState<Client>(client ?? empty);
  const [alsoSupplier, setAlsoSupplier] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dupReasons, setDupReasons] = useState<string[] | null>(null);

  useEffect(() => {
    if (open) {
      setEditing(client ?? empty);
      setAlsoSupplier(false);
      setDupReasons(null);
    }
  }, [open, client]);

  // Blocks the save on any match against an existing client's name, phone,
  // email, or tax number — the user must explicitly confirm or go back,
  // rather than a silent/non-blocking warning, since saving a true
  // duplicate here creates a second party with its own sub-ledger that
  // then has to be merged by hand later.
  const checkDuplicates = (): string[] => {
    const normName = editing.name.trim().toLowerCase();
    const normPhone = editing.phone.replace(/\D/g, '');
    const normEmail = (editing.email ?? '').trim().toLowerCase();
    const normTax = (editing.taxNumber ?? '').trim();
    const reasons: string[] = [];
    const dupName = list.find((c) => c.id !== editing.id && c.name.trim().toLowerCase() === normName);
    if (dupName) reasons.push(`الاسم مطابق لعميل موجود «${dupName.name}»`);
    const dupPhone = normPhone ? list.find((c) => c.id !== editing.id && c.phone.replace(/\D/g, '') === normPhone) : undefined;
    if (dupPhone) reasons.push(`رقم الهاتف مطابق لعميل «${dupPhone.name}»`);
    const dupEmail = normEmail ? list.find((c) => c.id !== editing.id && (c.email ?? '').trim().toLowerCase() === normEmail) : undefined;
    if (dupEmail) reasons.push(`البريد الإلكتروني مطابق لعميل «${dupEmail.name}»`);
    const dupTax = normTax ? list.find((c) => c.id !== editing.id && (c.taxNumber ?? '').trim() === normTax) : undefined;
    if (dupTax) reasons.push(`الرقم الضريبي مطابق لعميل «${dupTax.name}»`);
    return reasons;
  };

  const submit = async () => {
    if (!editing.name.trim()) return toast.error('اسم العميل مطلوب');
    if (!editing.phone?.trim()) return toast.error('رقم الهاتف مطلوب');
    if (editing.taxNumber && !/^\d+$/.test(editing.taxNumber)) return toast.error('الرقم الضريبي يجب أن يحتوي على أرقام فقط');

    const reasons = checkDuplicates();
    if (reasons.length) { setDupReasons(reasons); return; }

    await doSave();
  };

  const doSave = async () => {
    if (isNew && alsoSupplier) {
      setSaving(true);
      try {
        const clientRes = await api.post<{ data: { id: string; name: string } }>('/api/clients', {
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
        onOpenChange(false);
        onSaved?.({ id: clientId, name: clientRes.data.name });
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر حفظ العميل');
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const saved = await save(editing);
      onOpenChange(false);
      if (saved) onSaved?.({ id: saved.id, name: saved.name });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>{isNew ? 'إضافة عميل جديد' : 'تعديل عميل'}</DialogTitle></DialogHeader>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : (isNew ? 'إضافة العميل' : 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <AlertDialog open={Boolean(dupReasons)} onOpenChange={(v) => !v && setDupReasons(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> عميل مشابه موجود بالفعل
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <ul className="list-disc pr-4 space-y-1">
                  {dupReasons?.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                <p>هل تريد المتابعة والحفظ رغم ذلك، أم الرجوع لمراجعة البيانات؟</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDupReasons(null)}>رجوع</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setDupReasons(null); await doSave(); }}>متابعة الحفظ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const Field = ({ id, label, value, onChange, type, inputMode, pattern }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; pattern?: string;
}) => (
  <div><Label htmlFor={id}>{label}</Label><Input id={id} type={type} inputMode={inputMode} pattern={pattern} value={value} onChange={e => onChange(e.target.value)} className="mt-1.5" /></div>
);
