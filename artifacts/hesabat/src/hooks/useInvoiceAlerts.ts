import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { toast } from 'sonner';

export type AlertsAudience = 'clients' | 'users' | 'both';
export type ScheduleMode = 'immediate' | 'daily' | 'weekly';
export type WeekDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface InvoiceAlertsSettings {
  enabled: boolean;
  audience: AlertsAudience;
  channels: { email: boolean; inApp: boolean };
  events: {
    onCreated: boolean;
    onDueSoon: { enabled: boolean; daysBefore: number };
    onOverdue: { enabled: boolean; daysAfter: number; repeatEveryDays: number };
    onPaid: boolean;
  };
  schedule: { mode: ScheduleMode; dailyAt: string; weeklyDay: WeekDay };
  quietHours: { enabled: boolean; from: string; to: string };
  requireEmailConfigured: boolean;
}

const STORAGE_KEY = 'oneclick.invoiceAlerts';

export const defaultInvoiceAlerts: InvoiceAlertsSettings = {
  enabled: false,
  audience: 'both',
  channels: { email: true, inApp: true },
  events: {
    onCreated: true,
    onDueSoon: { enabled: true, daysBefore: 3 },
    onOverdue: { enabled: true, daysAfter: 1, repeatEveryDays: 7 },
    onPaid: true,
  },
  schedule: { mode: 'immediate', dailyAt: '09:00', weeklyDay: 'sun' },
  quietHours: { enabled: false, from: '22:00', to: '07:00' },
  requireEmailConfigured: true,
};

const readCache = (): InvoiceAlertsSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultInvoiceAlerts;
    return { ...defaultInvoiceAlerts, ...JSON.parse(raw) } as InvoiceAlertsSettings;
  } catch {
    return defaultInvoiceAlerts;
  }
};

// Settings live in the backend (invoice_alert_settings table) so the
// scheduled job (jobs/invoiceAlerts.ts) can actually read and act on them.
// localStorage is kept only as an instant-paint cache while the initial
// GET is in flight, and as a fallback if the API is unreachable.
export const useInvoiceAlerts = () => {
  const [settings, setSettings] = useState<InvoiceAlertsSettings>(() => readCache());
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isApiConfigured()) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ data: InvoiceAlertsSettings | null }>('/api/companies/invoice-alert-settings');
        if (!cancelled && res.data) setSettings({ ...defaultInvoiceAlerts, ...res.data });
      } catch {
        // keep the localStorage cache on failure
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    if (!loaded || !isApiConfigured()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.put('/api/companies/invoice-alert-settings', settings);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'تعذّر حفظ إعدادات تنبيهات الفواتير');
      }
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [settings, loaded]);

  const update = useCallback(<K extends keyof InvoiceAlertsSettings>(key: K, value: InvoiceAlertsSettings[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(defaultInvoiceAlerts), []);

  return { settings, setSettings, update, reset };
};
