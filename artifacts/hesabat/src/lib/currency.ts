export const CURRENCIES = [
  { code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', name: 'درهم إماراتي' },
  { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري' },
  { code: 'KWD', symbol: 'د.ك', name: 'دينار كويتي' },
  { code: 'QAR', symbol: 'ر.ق', name: 'ريال قطري' },
  { code: 'USD', symbol: '$', name: 'دولار أمريكي' },
  { code: 'EUR', symbol: '€', name: 'يورو' },
];

const DEFAULT_SYMBOL = 'ر.س';

let _currentSymbol: string = DEFAULT_SYMBOL;
const listeners = new Set<() => void>();

export const getCurrencySymbol = (): string => _currentSymbol;

export const setCurrencySymbol = (symbol: string): void => {
  const s = symbol || DEFAULT_SYMBOL;
  if (s === _currentSymbol) return;
  _currentSymbol = s;
  listeners.forEach((l) => l());
};

export const setCompanyCurrencyCode = (code: string): void => {
  const c = CURRENCIES.find((x) => x.code === code);
  setCurrencySymbol(c?.symbol ?? DEFAULT_SYMBOL);
};

export const subscribeCurrency = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
