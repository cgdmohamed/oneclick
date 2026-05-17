/**
 * Thin API action hook for updating a user's company role via the backend.
 * No local override state — callers manage optimistic UI themselves.
 */
import { api } from '@/lib/api';

export const useUserRoleOverrides = () => {
  const set = async (userId: string, companyId: string, role: string) => {
    await api.patch(`/api/platform/users/${userId}/role`, { company_id: companyId, role });
  };

  return { set };
};
