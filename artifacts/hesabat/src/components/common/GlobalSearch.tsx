import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Package, FileText, Truck, ShoppingCart, Undo2, Redo2, BookOpen, UserRound, Boxes, Trash2 } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency, invoiceStatusLabel, noteStatusLabel } from '@/lib/format';

const docStatusLabel = (s: string): string => {
  switch (s) {
    case 'reversed': return 'معكوس';
    case 'active': return 'نشط';
    case 'inactive': return 'غير نشط';
    case 'fully_depreciated': return 'مستهلك بالكامل';
    case 'disposed': return 'تم التخلص منه';
    case 'paid': return 'مدفوعة';
    case 'partial': return 'مدفوعة جزئياً';
    default: return noteStatusLabel(s);
  }
};

interface ClientHit { id: string; name: string; phone?: string | null; code?: string | null }
interface ProductHit { id: string; name: string; sku?: string | null; barcode?: string | null }
interface InvoiceHit { id: string; number: string; status: string; total: string | number; client_name?: string | null }
interface SupplierHit { id: string; name: string; phone?: string | null }
interface PurchaseInvoiceHit { id: string; number: string; status: string; total: string | number; supplier_name?: string | null }
interface CreditNoteHit { id: string; number: string; status: string; total: string | number; customer_name?: string | null }
interface DebitNoteHit { id: string; number: string; status: string; total: string | number; customer_name?: string | null }
interface JournalEntryHit { id: string; number: string; status: string; memo?: string | null }
interface EmployeeHit { id: string; employee_code: string; name: string; status: string }
interface FixedAssetHit { id: string; asset_code: string; name: string; status: string }
interface InventoryWriteOffHit { id: string; number: string; status: string; total_cost: string | number }
interface SearchResults {
  clients: ClientHit[]; products: ProductHit[]; invoices: InvoiceHit[]; suppliers: SupplierHit[];
  purchaseInvoices: PurchaseInvoiceHit[]; creditNotes: CreditNoteHit[]; debitNotes: DebitNoteHit[];
  journalEntries: JournalEntryHit[]; employees: EmployeeHit[]; fixedAssets: FixedAssetHit[];
  inventoryWriteOffs: InventoryWriteOffHit[];
}

export const GlobalSearch = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) { setTerm(''); setDebounced(''); }
  }, [open]);

  const results = useQuery({
    enabled: debounced.length >= 2,
    queryKey: ['global-search', debounced],
    queryFn: async () => (await api.get<{ data: SearchResults }>(`/api/search?q=${encodeURIComponent(debounced)}`)).data,
  });

  const data = results.data;
  const hasQuery = debounced.length >= 2;
  const totalCount = useMemo(
    () => (data
      ? data.clients.length + data.products.length + data.invoices.length + data.suppliers.length
        + data.purchaseInvoices.length + data.creditNotes.length + data.debitNotes.length
        + data.journalEntries.length + data.employees.length + data.fixedAssets.length + data.inventoryWriteOffs.length
      : 0),
    [data],
  );

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <Button
        variant="outline"
        className="hidden sm:flex items-center gap-2 text-muted-foreground w-56 justify-start px-3"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-start">بحث...</span>
        <kbd className="text-[10px] font-medium text-muted-foreground border rounded px-1.5 py-0.5">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="sm:hidden" aria-label="بحث" onClick={() => setOpen(true)}>
        <Search className="h-5 w-5" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="ابحث عن عميل، منتج، فاتورة، مورد، فاتورة شراء، إشعار، قيد يومية، موظف، أصل ثابت..."
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          {hasQuery && !results.isFetching && totalCount === 0 && (
            <CommandEmpty>لا توجد نتائج مطابقة</CommandEmpty>
          )}
          {!hasQuery && <CommandEmpty>اكتب حرفين على الأقل لبدء البحث</CommandEmpty>}

          {(data?.clients.length ?? 0) > 0 && (
            <CommandGroup heading="العملاء">
              {data!.clients.map((c) => (
                <CommandItem key={c.id} value={`client-${c.id}-${c.name}`} onSelect={() => go(`/app/clients/${c.id}`)}>
                  <Users className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.phone || c.code || ''}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.products.length ?? 0) > 0 && (
            <CommandGroup heading="المنتجات">
              {data!.products.map((p) => (
                <CommandItem key={p.id} value={`product-${p.id}-${p.name}`} onSelect={() => go(`/app/products/${p.id}`)}>
                  <Package className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.sku || p.barcode || ''}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.invoices.length ?? 0) > 0 && (
            <CommandGroup heading="الفواتير">
              {data!.invoices.map((inv) => (
                <CommandItem key={inv.id} value={`invoice-${inv.id}-${inv.number}`} onSelect={() => go(`/app/invoices/${inv.id}`)}>
                  <FileText className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{inv.number} {inv.client_name ? `— ${inv.client_name}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(Number(inv.total))} · {invoiceStatusLabel(inv.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.suppliers.length ?? 0) > 0 && (
            <CommandGroup heading="الموردون">
              {data!.suppliers.map((s) => (
                <CommandItem key={s.id} value={`supplier-${s.id}-${s.name}`} onSelect={() => go(`/app/suppliers/${s.id}`)}>
                  <Truck className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.phone || ''}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.purchaseInvoices.length ?? 0) > 0 && (
            <CommandGroup heading="فواتير الشراء">
              {data!.purchaseInvoices.map((pi) => (
                <CommandItem key={pi.id} value={`purchase-invoice-${pi.id}-${pi.number}`} onSelect={() => go(`/app/purchases/invoices/${pi.id}`)}>
                  <ShoppingCart className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{pi.number} {pi.supplier_name ? `— ${pi.supplier_name}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(Number(pi.total))} · {docStatusLabel(pi.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.creditNotes.length ?? 0) > 0 && (
            <CommandGroup heading="الإشعارات الدائنة">
              {data!.creditNotes.map((cn) => (
                <CommandItem key={cn.id} value={`credit-note-${cn.id}-${cn.number}`} onSelect={() => go(`/app/credit-notes/${cn.id}`)}>
                  <Undo2 className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{cn.number} {cn.customer_name ? `— ${cn.customer_name}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(Number(cn.total))} · {noteStatusLabel(cn.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.debitNotes.length ?? 0) > 0 && (
            <CommandGroup heading="الإشعارات المدينة">
              {data!.debitNotes.map((dn) => (
                <CommandItem key={dn.id} value={`debit-note-${dn.id}-${dn.number}`} onSelect={() => go(`/app/debit-notes/${dn.id}`)}>
                  <Redo2 className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{dn.number} {dn.customer_name ? `— ${dn.customer_name}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(Number(dn.total))} · {noteStatusLabel(dn.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.journalEntries.length ?? 0) > 0 && (
            <CommandGroup heading="قيود اليومية">
              {data!.journalEntries.map((je) => (
                <CommandItem key={je.id} value={`journal-entry-${je.id}-${je.number}`} onSelect={() => go(`/app/accounting/journals/${je.id}`)}>
                  <BookOpen className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{je.number} {je.memo ? `— ${je.memo}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{docStatusLabel(je.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.employees.length ?? 0) > 0 && (
            <CommandGroup heading="الموظفون">
              {data!.employees.map((emp) => (
                <CommandItem key={emp.id} value={`employee-${emp.id}-${emp.name}`} onSelect={() => go('/app/accounting/employees')}>
                  <UserRound className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{emp.name}</span>
                  <span className="text-xs text-muted-foreground">{emp.employee_code} · {docStatusLabel(emp.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.fixedAssets.length ?? 0) > 0 && (
            <CommandGroup heading="الأصول الثابتة">
              {data!.fixedAssets.map((fa) => (
                <CommandItem key={fa.id} value={`fixed-asset-${fa.id}-${fa.name}`} onSelect={() => go(`/app/accounting/assets/${fa.id}`)}>
                  <Boxes className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{fa.name}</span>
                  <span className="text-xs text-muted-foreground">{fa.asset_code} · {docStatusLabel(fa.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.inventoryWriteOffs.length ?? 0) > 0 && (
            <CommandGroup heading="شطب المخزون">
              {data!.inventoryWriteOffs.map((wo) => (
                <CommandItem key={wo.id} value={`write-off-${wo.id}-${wo.number}`} onSelect={() => go(`/app/inventory-write-offs/${wo.id}`)}>
                  <Trash2 className="h-4 w-4 me-2 shrink-0" />
                  <span className="flex-1">{wo.number}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(Number(wo.total_cost))} · {docStatusLabel(wo.status)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
