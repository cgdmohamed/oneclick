import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string | null;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

/**
 * A dropdown with a search box, for any list that can plausibly grow large
 * in real use (clients, products, chart of accounts, suppliers, ...). Plain
 * shadcn <Select> has no search and becomes painful to scroll past ~20 items.
 * Same Popover+Command pattern as the product picker in NewInvoice.tsx.
 */
export const SearchableSelect = ({
  value,
  onValueChange,
  options,
  placeholder = 'اختر...',
  searchPlaceholder = 'ابحث...',
  emptyText = 'لا توجد نتائج',
  className,
  triggerClassName,
  disabled,
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-9 w-full justify-between px-3 font-normal', triggerClassName)}
        >
          <span className="truncate text-start">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[320px] p-0', className)} align="start" dir="rtl">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={[o.label, o.sublabel].filter(Boolean).join(' ')}
                  onSelect={() => { onValueChange(o.value); setOpen(false); }}
                >
                  <Check className={cn('h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0 flex-1 text-start">
                    <div className="truncate">{o.label}</div>
                    {o.sublabel && <div className="truncate text-xs text-muted-foreground">{o.sublabel}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
