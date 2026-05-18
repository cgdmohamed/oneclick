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
