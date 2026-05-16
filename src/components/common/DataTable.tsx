import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Search } from 'lucide-react';
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
  /** Initial page size. Defaults to 10. Set to 0 to disable pagination. */
  pageSize?: number;
  /** Available page-size options. Defaults to [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
}

export function DataTable<T extends { id: string }>({
  data, columns, searchKeys, searchPlaceholder = 'بحث...', emptyTitle = 'لا توجد بيانات',
  rightToolbar, onRowClick, pageSize: initialPageSize = 10, pageSizeOptions = [10, 25, 50, 100],
}: DataTableProps<T>) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize || 0);

  const filtered = useMemo(() => {
    if (!q || !searchKeys?.length) return data;
    const needle = q.toLowerCase();
    return data.filter(row => searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(needle)));
  }, [data, q, searchKeys]);

  const paginationEnabled = pageSize > 0;
  const total = filtered.length;
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const pageRows = paginationEnabled
    ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
    : filtered;

  // Reset page when filters/data shrink
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  useEffect(() => { setPage(1); }, [q, pageSize]);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

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
                  <TableHead key={c.key} className={`text-start text-xs font-semibold text-muted-foreground ${c.className ?? ''}`}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <EmptyState title={emptyTitle} />
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map(row => (
                  <TableRow key={row.id} onClick={() => onRowClick?.(row)} className={onRowClick ? 'cursor-pointer hover:bg-muted/30' : ''}>
                    {columns.map(c => (
                      <TableCell key={c.key} className={`text-start ${c.className ?? ''}`}>{c.cell(row)}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {paginationEnabled && total > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>عرض <span className="text-foreground font-medium tabular-nums">{from}-{to}</span> من <span className="text-foreground font-medium tabular-nums">{total}</span></span>
              <span className="hidden sm:inline">·</span>
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">لكل صفحة</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-7 w-[72px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={safePage === 1} aria-label="الصفحة الأولى">
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} aria-label="السابق">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2 tabular-nums">صفحة {safePage} من {totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} aria-label="التالي">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={safePage === totalPages} aria-label="الصفحة الأخيرة">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
