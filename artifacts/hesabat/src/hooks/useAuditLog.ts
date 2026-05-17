import { useQuery } from '@tanstack/react-query';
import { api, isApiConfigured } from '@/lib/api';
import type { AuditLogRow } from '@/lib/activityLog';

export interface AuditLogResponse {
  data: AuditLogRow[];
  page: number;
  page_size: number;
  total: number | null;
}

interface UseAuditLogParams {
  entity?: string;
  action?: string;
  company_id?: string;
  page?: number;
  page_size?: number;
  platform?: boolean;
}

export function useAuditLog(params?: UseAuditLogParams) {
  const apiOn = isApiConfigured();
  return useQuery({
    enabled: apiOn,
    queryKey: ['audit-log', params],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.entity) search.set('entity', params.entity);
      if (params?.action) search.set('action', params.action);
      if (params?.company_id) search.set('company_id', params.company_id);
      if (params?.page) search.set('page', String(params.page));
      if (params?.page_size) search.set('page_size', String(params.page_size ?? 50));
      const base = params?.platform ? '/api/platform/audit-log' : '/api/audit-log';
      const url = search.toString() ? `${base}?${search}` : base;
      return api.get<AuditLogResponse>(url);
    },
    staleTime: 30_000,
  });
}
