/**
 * Platform custom roles — fetched from the real backend.
 * Endpoints: GET/POST/PATCH/DELETE /api/platform/custom-roles
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { isApiConfigured } from '@/lib/api';

export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  color?: string;
  scope: 'company' | 'platform';
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

interface ApiRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  color: string | null;
  scope: 'company' | 'platform';
  created_at: string;
  updated_at: string;
  enabled: boolean;
}

function mapRole(r: ApiRole): CustomRole {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
    color: r.color ?? undefined,
    scope: r.scope,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    enabled: r.enabled,
  };
}

export const useCustomRoles = () => {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isApiConfigured()) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: ApiRole[] }>('/api/platform/custom-roles');
      setRoles(res.data.map(mapRole));
    } catch {
      /* silently ignore when not super_admin or API unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = async (role: CustomRole) => {
    const payload = {
      name: role.name,
      description: role.description ?? null,
      permissions: role.permissions,
      color: role.color ?? null,
      scope: role.scope,
      enabled: role.enabled,
    };
    const existed = roles.some(r => r.id === role.id);
    if (existed) {
      const res = await api.patch<{ data: ApiRole }>(`/api/platform/custom-roles/${role.id}`, payload);
      setRoles(prev => prev.map(r => r.id === role.id ? mapRole(res.data) : r));
    } else {
      const res = await api.post<{ data: ApiRole }>('/api/platform/custom-roles', payload);
      setRoles(prev => [mapRole(res.data), ...prev]);
    }
  };

  const remove = async (id: string) => {
    await api.delete(`/api/platform/custom-roles/${id}`);
    setRoles(prev => prev.filter(r => r.id !== id));
  };

  const toggle = async (id: string) => {
    const role = roles.find(r => r.id === id);
    if (!role) return;
    const res = await api.patch<{ data: ApiRole }>(`/api/platform/custom-roles/${id}`, {
      enabled: !role.enabled,
    });
    setRoles(prev => prev.map(r => r.id === id ? mapRole(res.data) : r));
  };

  return { roles, loading, upsert, remove, toggle };
};
