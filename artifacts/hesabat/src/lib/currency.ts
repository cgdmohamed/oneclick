const KEY = 'oneclick.currencySymbol';
const DEFAULT = 'ر.س';

export const CURRENCIES = [
  { code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', name: 'درهم إماراتي' },
  { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري' },
  { code: 'KWD', symbol: 'د.ك', name: 'دينار كويتي' },
  { code: 'QAR', symbol: 'ر.ق', name: 'ريال قطري' },
  { code: 'USD', symbol: '$', name: 'دولار أمريكي' },
  { code: 'EUR', symbol: '€', name: 'يورو' },
];
const listeners = new Set<() => void>();

export const getCurrencySymbol = (): string => {
  try { return localStorage.getItem(KEY) || DEFAULT; } catch { return DEFAULT; }
};

export const setCurrencySymbol = (symbol: string): void => {
  try { localStorage.setItem(KEY, symbol || DEFAULT); } catch { /* ignore */ }
  listeners.forEach(l => l());
};

export const subscribeCurrency = (cb: () => void): (() => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
};
