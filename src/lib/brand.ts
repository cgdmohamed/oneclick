/**
 * Brand settings — super-admin–controlled SaaS identity.
 * Persists to localStorage, syncs across tabs via custom event.
 * Logo is typographic by default: brand name renders in the configured font.
 * An optional uploaded image (PNG/SVG/JPEG, base64 data URL) overrides the
 * text when provided.
 */
import { useCallback, useEffect, useState } from 'react';

export interface BrandSettings {
  /** Display name shown as the typographic logo when no image is set. */
  name: string;
  /** Short tagline under the brand in the app sidebar / footer. */
  tagline: string;
  /** Optional data-URL or absolute URL to a logo image (PNG/SVG/JPEG). */
  logoUrl: string;
  /** CSS font-family stack applied to the typographic wordmark. */
  fontFamily: string;
  /** Tailwind font-weight class for the wordmark. */
  fontWeight: 'font-semibold' | 'font-bold' | 'font-extrabold' | 'font-black';
  /** Letter-spacing class. */
  tracking: 'tracking-tighter' | 'tracking-tight' | 'tracking-normal' | 'tracking-wide';
}

const KEY = 'hesabat.brand.v1';
const EVT = 'hesabat-brand-change';

export const DEFAULT_BRAND: BrandSettings = {
  name: 'ون كليك',
  tagline: 'منصة محاسبة سحابية',
  logoUrl: '',
  fontFamily: "'Cairo', 'Tajawal', 'Inter', system-ui, sans-serif",
  fontWeight: 'font-extrabold',
  tracking: 'tracking-tight',
};

const read = (): BrandSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRAND;
    return { ...DEFAULT_BRAND, ...(JSON.parse(raw) as Partial<BrandSettings>) };
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
