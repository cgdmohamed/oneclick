/**
 * useTrackingSettings — CMS for marketing/analytics IDs.
 * Persisted to the database via /api/platform/settings/tracking.
 *
 * IDs are public identifiers (e.g. GA4 Measurement IDs, Pixel IDs) meant
 * to be embedded in browser code — storing them server-side is fine.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { API_URL, api, isApiConfigured } from '@/lib/api';
import { onSettingsUpdate, postSettingsUpdate } from '@/lib/platformSettingsChannel';

export interface TrackingSettings {
  consentRequired: boolean;
  privateAppRoutes: boolean;

  ga4: { enabled: boolean; measurementId: string };
  gtm: { enabled: boolean; containerId: string };
  metaPixel: { enabled: boolean; pixelId: string };
  linkedinInsight: { enabled: boolean; partnerId: string };
  microsoftClarity: { enabled: boolean; projectId: string };
  tiktokPixel: { enabled: boolean; pixelId: string };
  hotjar: { enabled: boolean; siteId: string; version: string };
  posthog: { enabled: boolean; apiKey: string; apiHost: string };
}

const SETTINGS_KEY = 'tracking';

export const DEFAULT_TRACKING: TrackingSettings = {
  consentRequired: true,
  privateAppRoutes: true,
  ga4: { enabled: false, measurementId: '' },
  gtm: { enabled: false, containerId: '' },
  metaPixel: { enabled: false, pixelId: '' },
  linkedinInsight: { enabled: false, partnerId: '' },
  microsoftClarity: { enabled: false, projectId: '' },
  tiktokPixel: { enabled: false, pixelId: '' },
  hotjar: { enabled: false, siteId: '', version: '6' },
  posthog: { enabled: false, apiKey: '', apiHost: 'https://us.i.posthog.com' },
};

async function fetchTracking(): Promise<TrackingSettings> {
  try {
    const res = await fetch(`${API_URL}/api/platform/settings/${SETTINGS_KEY}`, {
      credentials: 'include',
    });
    if (!res.ok) return DEFAULT_TRACKING;
    const json = await res.json() as { data: Partial<TrackingSettings> };
    return { ...DEFAULT_TRACKING, ...(json.data ?? {}) };
  } catch {
    return DEFAULT_TRACKING;
  }
}

export const useTrackingSettings = () => {
  const [settings, setSettings] = useState<TrackingSettings>(DEFAULT_TRACKING);

  useEffect(() => {
    if (!isApiConfigured()) return;
    fetchTracking().then(setSettings);

    return onSettingsUpdate(SETTINGS_KEY, () => {
      toast('تم تحديث إعدادات التتبع والتحليلات من تبويب آخر', {
        description: 'قد تكون مسوداتك الحالية قديمة.',
        action: { label: 'تحديث', onClick: () => fetchTracking().then(setSettings) },
        duration: 12000,
      });
    });
  }, []);

  const save = useCallback(async (next: TrackingSettings) => {
    setSettings(next);
    if (!isApiConfigured()) return;
    await api.put(`/api/platform/settings/${SETTINGS_KEY}`, next);
    postSettingsUpdate(SETTINGS_KEY);
  }, []);

  const reset = useCallback(async () => {
    setSettings(DEFAULT_TRACKING);
    if (!isApiConfigured()) return;
    await api.put(`/api/platform/settings/${SETTINGS_KEY}`, DEFAULT_TRACKING);
    postSettingsUpdate(SETTINGS_KEY);
  }, []);

  return { settings, save, reset };
};

/* ---------- Consent helpers ---------- */
const CONSENT_KEY = 'hesabat.tracking.consent';
export const getConsent = (): boolean =>
  typeof window !== 'undefined' && localStorage.getItem(CONSENT_KEY) === 'granted';
export const setConsent = (granted: boolean) => {
  localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  window.dispatchEvent(new CustomEvent('hesabat-consent-change'));
};
export const hasConsentDecision = (): boolean =>
  typeof window !== 'undefined' && localStorage.getItem(CONSENT_KEY) !== null;
