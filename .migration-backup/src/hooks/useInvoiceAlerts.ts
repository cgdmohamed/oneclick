import { useCallback, useEffect, useState } from 'react';

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

const read = (): InvoiceAlertsSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultInvoiceAlerts;
    return { ...defaultInvoiceAlerts, ...JSON.parse(raw) } as InvoiceAlertsSettings;
  } catch {
    return defaultInvoiceAlerts;
  }
};

export const useInvoiceAlerts = () => {
  const [settings, setSettings] = useState<InvoiceAlertsSettings>(() => read());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  const update = useCallback(<K extends keyof InvoiceAlertsSettings>(key: K, value: InvoiceAlertsSettings[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(defaultInvoiceAlerts), []);

  return { settings, setSettings, update, reset };
};
