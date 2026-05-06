import { ReactNode, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  emptyTitle?: string;
  rightToolbar?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { id: string }>({ data, columns, searchKeys, searchPlaceholder = 'بحث...', emptyTitle = 'لا توجد بيانات', rightToolbar, onRowClick }: DataTableProps<T>) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q || !searchKeys?.length) return data;
    const needle = q.toLowerCase();
    return data.filter(row => searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(needle)));
  }, [data, q, searchKeys]);

  return (
    <div className="space-y-3">
      {(searchKeys?.length || rightToolbar) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          {searchKeys?.length ? (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="pr-9" />
            </div>
          ) : <div />}
          {rightToolbar}
        </div>
      )}
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {columns.map(c => (
                  <TableHead key={c.key} className={`text-right text-xs font-semibold text-muted-foreground ${c.className ?? ''}`}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <EmptyState title={emptyTitle} />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(row => (
                  <TableRow key={row.id} onClick={() => onRowClick?.(row)} className={onRowClick ? 'cursor-pointer hover:bg-muted/30' : ''}>
                    {columns.map(c => (
                      <TableCell key={c.key} className={`text-right ${c.className ?? ''}`}>{c.cell(row)}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
