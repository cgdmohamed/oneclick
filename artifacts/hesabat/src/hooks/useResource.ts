/**
 * useResource — generic hook unifying CRUD over an API resource OR
 * an in-memory mock array (so the preview keeps working when
 * VITE_API_URL is not configured).
 *
 * Field names are mapped between the API row shape (snake_case) and
 * the frontend type (usually camelCase) via `toRow` / `fromRow`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { toast } from 'sonner';

export interface ResourceConfig<T extends { id: string }, Row = Record<string, unknown>> {
  /** API path, e.g. "/api/clients" */
  path: string;
  /** React Query key */
  key: string;
  /** Initial mock data used in fallback mode */
  initial: T[];
  /** Convert API row → frontend object */
  fromRow: (row: Row) => T;
  /** Convert frontend object → API body (omit id/createdAt etc.) */
  toRow: (item: Partial<T>) => Record<string, unknown>;
}

export function useResource<T extends { id: string }, Row = Record<string, unknown>>(
  cfg: ResourceConfig<T, Row>,
) {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();

  /* ---- Mock-mode fallback ---- */
  const [mock, setMock] = useState<T[]>(cfg.initial);
  useEffect(() => { if (!apiOn) setMock(cfg.initial); /* eslint-disable-next-line */ }, [apiOn]);

  /* ---- Real API mode ---- */
  const query = useQuery({
    enabled: apiOn,
    queryKey: [cfg.key],
    queryFn: async () => {
      const res = await api.get<{ data: Row[] }>(cfg.path);
      return res.data.map(cfg.fromRow);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [cfg.key] });
    qc.invalidateQueries({ queryKey: ['reports-overview'] });
  };

  const createMut = useMutation({
    mutationFn: async (item: Partial<T>) => {
      const res = await api.post<{ data: Row }>(cfg.path, cfg.toRow(item));
      return cfg.fromRow(res.data);
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async (item: Partial<T> & { id: string }) => {
      const { id, ...rest } = item;
      const res = await api.patch<{ data: Row }>(`${cfg.path}/${id}`, cfg.toRow(rest as Partial<T>));
      return cfg.fromRow(res.data);
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await api.delete(`${cfg.path}/${id}`); return id; },
    onSuccess: invalidate,
  });

  const handleErr = (e: unknown, fallback: string) => {
    const msg = e instanceof ApiError ? e.message : fallback;
    toast.error(msg);
  };

  /* ---- Unified surface ---- */
  const list = apiOn ? (query.data ?? []) : mock;
  const isLoading = apiOn ? query.isLoading : false;

  const save = useCallback(async (item: T) => {
    if (apiOn) {
      try {
        if (list.find((x) => x.id === item.id)) {
          await updateMut.mutateAsync(item);
        } else {
          await createMut.mutateAsync(item);
        }
        toast.success('تم الحفظ');
      } catch (e) { handleErr(e, 'تعذّر الحفظ'); }
    } else {
      setMock((prev) => prev.find((x) => x.id === item.id)
        ? prev.map((x) => x.id === item.id ? item : x)
        : [item, ...prev]);
      toast.success('تم الحفظ');
    }
  }, [apiOn, list, updateMut, createMut]);

  const remove = useCallback(async (id: string) => {
    if (apiOn) {
      try { await deleteMut.mutateAsync(id); toast.success('تم الحذف'); }
      catch (e) { handleErr(e, 'تعذّر الحذف'); }
    } else {
      setMock((prev) => prev.filter((x) => x.id !== id));
      toast.success('تم الحذف');
    }
  }, [apiOn, deleteMut]);

  return { list, isLoading, save, remove, apiOn };
}
