import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isApiConfigured } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { SentAlert, AlertEventKind, AlertChannel, AlertRecipientKind } from '@/lib/sentAlerts';

interface NotificationRow {
  id: string;
  company_id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationsResponse {
  data: NotificationRow[];
  page: number;
  page_size: number;
  total: number | null;
}

interface UnreadCountResponse {
  data: { total: number; unread: number };
}

function parseInvoiceAlert(row: NotificationRow): SentAlert {
  let meta: Partial<SentAlert & { clientId?: string; messageBody?: string }> = {};
  try {
    if (row.body) meta = JSON.parse(row.body);
  } catch {}
  return {
    id: row.id,
    event: (meta.event as AlertEventKind) ?? 'onCreated',
    channel: (meta.channel as AlertChannel) ?? 'email',
    recipientKind: (meta.recipientKind as AlertRecipientKind) ?? 'client',
    recipientId: meta.recipientId ?? meta.clientId ?? '',
    recipientName: meta.recipientName ?? '—',
    recipientContact: meta.recipientContact ?? '',
    invoiceId: meta.invoiceId ?? '',
    invoiceNumber: meta.invoiceNumber ?? '—',
    amount: meta.amount ?? 0,
    currencySymbol: meta.currencySymbol,
    subject: row.title,
    body: meta.messageBody ?? '',
    sentAt: row.created_at,
    read: !!row.read_at,
    readAt: row.read_at ?? undefined,
  };
}

export function useInvoiceAlerts() {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();

  const query = useQuery({
    enabled: apiOn,
    queryKey: ['notifications', 'invoice_email'],
    queryFn: async () => {
      const rs = await api.get<NotificationsResponse>(
        '/api/notifications?kind=invoice_email&page_size=200',
      );
      return rs.data.map(parseInvoiceAlert);
    },
    staleTime: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'invoice_email'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/notifications/read-all', { kind: 'invoice_email' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'invoice_email'] }),
  });

  return {
    alerts: query.data ?? [],
    isLoading: query.isLoading,
    markAlertRead: (id: string) => markRead.mutate(id),
    markAllAlertsRead: () => markAllRead.mutate(),
  };
}

export function useUnreadNotificationsCount(): number {
  const apiOn = isApiConfigured();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const { data } = useQuery({
    enabled: apiOn,
    queryKey: ['notifications', 'unread-count', isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const rs = await api.get<{ data: { unread: number } }>(
          '/api/platform/system-notifications/unread-count',
        );
        return rs.data.unread;
      }
      const rs = await api.get<UnreadCountResponse>('/api/notifications/count');
      return rs.data.unread;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return data ?? 0;
}

export interface NotificationPreviewItem {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

// Small, quick-loading slice of the notification list for the header bell
// popover — separate from useNotifications()/useAdminNotifications() (which
// page the full list for the dedicated /notifications screens) so opening
// the popover stays light regardless of how many notifications exist.
export function useNotificationsPreview(isAdmin: boolean) {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();

  const query = useQuery({
    enabled: apiOn,
    queryKey: ['notifications', 'preview', isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const rs = await api.get<{ data: { id: string; title: string; body: string; read_at: string | null; created_at: string }[] }>(
          '/api/platform/system-notifications',
        );
        return rs.data.slice(0, 6).map((r) => ({ id: r.id, title: r.title, body: r.body, read: !!r.read_at, createdAt: r.created_at }));
      }
      const rs = await api.get<NotificationsResponse>('/api/notifications?exclude_kind=invoice_email&page_size=6');
      return rs.data.map((r) => ({ id: r.id, title: r.title, body: r.body, read: !!r.read_at, createdAt: r.created_at }));
    },
    staleTime: 15_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['notifications', 'preview', isAdmin] });
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['system-notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(isAdmin ? `/api/platform/system-notifications/${id}/read` : `/api/notifications/${id}/read`, {}),
    onSuccess: invalidateAll,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post(isAdmin ? '/api/platform/system-notifications/read-all' : '/api/notifications/read-all', {}),
    onSuccess: invalidateAll,
  });

  return {
    items: (query.data ?? []) as NotificationPreviewItem[],
    isLoading: query.isLoading,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}

export function useAdminNotifications() {
  const apiOn = isApiConfigured();
  const qc = useQueryClient();

  interface AdminNotif {
    id: string;
    title: string;
    body: string;
    audience: string;
    read_at: string | null;
    created_at: string;
  }

  const query = useQuery({
    enabled: apiOn,
    queryKey: ['system-notifications', 'admin'],
    queryFn: async () => {
      const rs = await api.get<{ data: AdminNotif[] }>('/api/platform/system-notifications');
      return (rs.data ?? []).filter((n) => n.audience === 'admin');
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/platform/system-notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/platform/system-notifications/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}
