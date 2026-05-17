/**
 * Brand settings — super-admin–controlled SaaS identity.
 * Persisted to the database via /api/platform/settings/branding.
 *
 * Two logo variants:
 *  - logoFullUrl: wide/horizontal lockup (headers, footers, auth, PDFs).
 *  - logoIconUrl: square mark (collapsed sidebar, compact chips).
 * If a variant is missing it falls back to the other, then to the
 * typographic wordmark rendered in the configured font.
 */
import { useCallback, useEffect, useState } from 'react';
import { API_URL, api, isApiConfigured } from '@/lib/api';
import { onSettingsUpdate, postSettingsUpdate } from '@/lib/platformSettingsChannel';

export interface BrandSettings {
  name: string;
  tagline: string;
  logoFullUrl: string;
  logoIconUrl: string;
  fontFamily: string;
  fontWeight: 'font-semibold' | 'font-bold' | 'font-extrabold' | 'font-black';
  tracking: 'tracking-tighter' | 'tracking-tight' | 'tracking-normal' | 'tracking-wide';
}

export const DEFAULT_BRAND: BrandSettings = {
  name: 'ون كليك',
  tagline: 'منصة محاسبة سحابية',
  logoFullUrl: '',
  logoIconUrl: '',
  fontFamily: "'Cairo', 'Tajawal', 'Inter', system-ui, sans-serif",
  fontWeight: 'font-extrabold',
  tracking: 'tracking-tight',
};

const SETTINGS_KEY = 'branding';

async function fetchBranding(): Promise<BrandSettings> {
  try {
    const res = await fetch(`${API_URL}/api/platform/settings/${SETTINGS_KEY}`, {
      credentials: 'include',
    });
    if (!res.ok) return DEFAULT_BRAND;
    const json = await res.json() as { data: Partial<BrandSettings> & { logoUrl?: string } };
    const parsed = json.data ?? {};
    if (parsed.logoUrl && !parsed.logoFullUrl) {
      parsed.logoFullUrl = parsed.logoUrl;
    }
    delete parsed.logoUrl;
    return { ...DEFAULT_BRAND, ...parsed };
  } catch {
    return DEFAULT_BRAND;
  }
}

export const getBrand = (): BrandSettings => DEFAULT_BRAND;

export const useBrand = () => {
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);
  const [pendingRemoteUpdate, setPendingRemoteUpdate] = useState(false);

  useEffect(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    fetchBranding().then((b) => { setBrand(b); setLoading(false); });

    return onSettingsUpdate(SETTINGS_KEY, () => {
      setPendingRemoteUpdate(true);
    });
  }, []);

  const applyRemoteUpdate = useCallback(async () => {
    const fresh = await fetchBranding();
    setBrand(fresh);
    setPendingRemoteUpdate(false);
  }, []);

  const save = useCallback(async (next: BrandSettings) => {
    setBrand(next);
    if (!isApiConfigured()) return;
    await api.put(`/api/platform/settings/${SETTINGS_KEY}`, next);
    postSettingsUpdate(SETTINGS_KEY);
  }, []);

  const reset = useCallback(async () => {
    setBrand(DEFAULT_BRAND);
    if (!isApiConfigured()) return;
    await api.put(`/api/platform/settings/${SETTINGS_KEY}`, DEFAULT_BRAND);
    postSettingsUpdate(SETTINGS_KEY);
  }, []);

  return { brand, save, reset, loading, pendingRemoteUpdate, applyRemoteUpdate };
};

export const brandMonogram = (name: string): string => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '•';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map(p => Array.from(p)[0] ?? '').join('');
};
