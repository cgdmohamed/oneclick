/**
 * Activity log module — write-side is now handled server-side by audit.ts.
 * logActivity and clearActivity are intentional no-ops; the backend owns the
 * audit_log table. Read-side is fetched from GET /api/audit-log (see useAuditLog).
 */

export type ActivityModule = 'product' | 'category' | 'invoice' | 'payment' | 'client' | 'system' | 'role' | 'user' | 'auth' | 'permission';
export type ActivityAction = 'create' | 'update' | 'delete' | 'pay' | 'login' | 'logout' | 'assign' | 'grant' | 'revoke' | 'denied';

export interface ActivityEntry {
  id: string;
  date: string;
  module: ActivityModule;
  action: ActivityAction;
  description: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

export interface AuditLogRow {
  id: string;
  company_id: string | null;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  company_name?: string | null;
}

export const logActivity = (_entry: Omit<ActivityEntry, 'id' | 'date'> & { date?: string }) => {};

export const clearActivity = () => {};

export const useActivityLog = (): ActivityEntry[] => [];
