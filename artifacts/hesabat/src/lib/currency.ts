export const EGP_CURRENCY_CODE = 'EGP';
export const EGP_CURRENCY_SYMBOL = 'ج.م';

export const CURRENCIES = [
  { code: EGP_CURRENCY_CODE, symbol: EGP_CURRENCY_SYMBOL, name: 'جنيه مصري' },
];

let _currentSymbol: string = EGP_CURRENCY_SYMBOL;
const listeners = new Set<() => void>();

export const getCurrencySymbol = (): string => _currentSymbol;

export const setCurrencySymbol = (_symbol?: string): void => {
  if (_currentSymbol === EGP_CURRENCY_SYMBOL) return;
  _currentSymbol = EGP_CURRENCY_SYMBOL;
  listeners.forEach((l) => l());
};

export const setCompanyCurrencyCode = (_code?: string): void => {
  setCurrencySymbol(EGP_CURRENCY_SYMBOL);
};

export const subscribeCurrency = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
