/**
 * useTrackingSettings — CMS for marketing/analytics IDs.
 * Persists to localStorage and syncs across tabs via a custom event.
 *
 * IDs are intentionally stored client-side: they are public identifiers
 * (e.g. GA4 Measurement IDs, Pixel IDs) meant to be embedded in browser code.
 */
import { useCallback, useEffect, useState } from 'react';

export interface TrackingSettings {
  /** Apply tracking only after user consent (cookie banner). */
  consentRequired: boolean;
  /** Disable all tracking inside /app and /admin routes (privacy default). */
  privateAppRoutes: boolean;

  ga4: { enabled: boolean; measurementId: string };          // G-XXXXXXXXXX
  gtm: { enabled: boolean; containerId: string };            // GTM-XXXXXXX
  metaPixel: { enabled: boolean; pixelId: string };          // numeric
  linkedinInsight: { enabled: boolean; partnerId: string };  // numeric
  microsoftClarity: { enabled: boolean; projectId: string }; // 10 chars
  tiktokPixel: { enabled: boolean; pixelId: string };
  hotjar: { enabled: boolean; siteId: string; version: string };
  posthog: { enabled: boolean; apiKey: string; apiHost: string };
}

const KEY = 'hesabat.tracking.v1';
const EVT = 'hesabat-tracking-change';

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

const read = (): TrackingSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_TRACKING;
    const p = JSON.parse(raw) as Partial<TrackingSettings>;
    return { ...DEFAULT_TRACKING, ...p };
  } catch {
    return DEFAULT_TRACKING;
  }
};

const write = (data: TrackingSettings) => {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(EVT));
};

export const useTrackingSettings = () => {
  const [settings, setSettings] = useState<TrackingSettings>(read);

  useEffect(() => {
    const sync = () => setSettings(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const save = useCallback((next: TrackingSettings) => {
    setSettings(next);
    write(next);
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_TRACKING);
    write(DEFAULT_TRACKING);
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
