/**
 * Brand settings — super-admin–controlled SaaS identity.
 * Persists to localStorage, syncs across tabs via custom event.
 *
 * Two logo variants:
 *  - logoFullUrl: wide/horizontal lockup (headers, footers, auth, PDFs).
 *  - logoIconUrl: square mark (collapsed sidebar, compact chips).
 * If a variant is missing it falls back to the other, then to the
 * typographic wordmark rendered in the configured font.
 */
import { useCallback, useEffect, useState } from 'react';

export interface BrandSettings {
  name: string;
  tagline: string;
  /** Wide/horizontal logo (data URL or absolute URL). */
  logoFullUrl: string;
  /** Square/compact icon mark (data URL or absolute URL). */
  logoIconUrl: string;
  fontFamily: string;
  fontWeight: 'font-semibold' | 'font-bold' | 'font-extrabold' | 'font-black';
  tracking: 'tracking-tighter' | 'tracking-tight' | 'tracking-normal' | 'tracking-wide';
}

const KEY = 'hesabat.brand.v1';
const EVT = 'hesabat-brand-change';

export const DEFAULT_BRAND: BrandSettings = {
  name: 'ون كليك',
  tagline: 'منصة محاسبة سحابية',
  logoFullUrl: '',
  logoIconUrl: '',
  fontFamily: "'Cairo', 'Tajawal', 'Inter', system-ui, sans-serif",
  fontWeight: 'font-extrabold',
  tracking: 'tracking-tight',
};

const read = (): BrandSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRAND;
    const parsed = JSON.parse(raw) as Partial<BrandSettings> & { logoUrl?: string };
    // Migrate legacy single-logo field.
    if (parsed.logoUrl && !parsed.logoFullUrl) {
      parsed.logoFullUrl = parsed.logoUrl;
    }
    delete parsed.logoUrl;
    return { ...DEFAULT_BRAND, ...parsed };
  } catch {
    return DEFAULT_BRAND;
  }
};

const write = (data: BrandSettings) => {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(EVT));
};

export const getBrand = (): BrandSettings => read();

export const useBrand = () => {
  const [brand, setBrand] = useState<BrandSettings>(read);

  useEffect(() => {
    const sync = () => setBrand(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const save = useCallback((next: BrandSettings) => {
    setBrand(next);
    write(next);
  }, []);

  const reset = useCallback(() => {
    setBrand(DEFAULT_BRAND);
    write(DEFAULT_BRAND);
  }, []);

  return { brand, save, reset };
};

/** First 1–2 chars of brand name — used as a monogram fallback for icon variant. */
export const brandMonogram = (name: string): string => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '•';
  // Take the first non-space char of the first 1–2 words.
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map(p => Array.from(p)[0] ?? '').join('');
};
