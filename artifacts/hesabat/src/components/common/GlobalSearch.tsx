import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Package, FileText, Truck } from 'lucide-react';
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
import { formatCurrency, invoiceStatusLabel } from '@/lib/format';

interface ClientHit { id: string; name: string; phone?: string | null; code?: string | null }
interface ProductHit { id: string; name: string; sku?: string | null; barcode?: string | null }
interface InvoiceHit { id: string; number: string; status: string; total: string | number; client_name?: string | null }
interface SupplierHit { id: string; name: string; phone?: string | null }
interface SearchResults { clients: ClientHit[]; products: ProductHit[]; invoices: InvoiceHit[]; suppliers: SupplierHit[] }

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
    () => (data ? data.clients.length + data.products.length + data.invoices.length + data.suppliers.length : 0),
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
          placeholder="ابحث عن عميل، منتج، فاتورة، مورد..."
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
        </CommandList>
      </CommandDialog>
    </>
  );
};
