/* Sent invoice-alerts ledger (localStorage). Records each alert dispatched to
 * a client or a system user, with channel, event kind, and read status. */

export type AlertEventKind = 'onCreated' | 'onDueSoon' | 'onOverdue' | 'onPaid';
export type AlertRecipientKind = 'client' | 'user';
export type AlertChannel = 'email' | 'inApp';

export interface SentAlert {
  id: string;
  event: AlertEventKind;
  channel: AlertChannel;
  recipientKind: AlertRecipientKind;
  recipientId: string;       // clientId or userId
  recipientName: string;
  recipientContact: string;  // email or display
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currencySymbol?: string;
  subject: string;
  body: string;
  sentAt: string;            // ISO
  read: boolean;
  readAt?: string;
}

const KEY = 'oneclick.sentAlerts';
const listeners = new Set<() => void>();

const eventTitles: Record<AlertEventKind, string> = {
  onCreated: 'فاتورة جديدة بانتظار السداد',
  onDueSoon: 'تذكير بقرب موعد الاستحقاق',
  onOverdue: 'فاتورة متأخرة عن السداد',
  onPaid: 'تم استلام الدفعة',
};

export const eventLabel = (e: AlertEventKind): string => eventTitles[e];

const seed: SentAlert[] = [
  {
    id: 'sa-1', event: 'onDueSoon', channel: 'email',
    recipientKind: 'client', recipientId: 'cl-1',
    recipientName: 'شركة الأفق للتجارة', recipientContact: 'finance@alofok.sa',
    invoiceId: 'inv-1', invoiceNumber: 'INV-2026-0006',
    amount: 12450, currencySymbol: 'ر.س',
    subject: 'تذكير: استحقاق فاتورتك خلال 3 أيام',
    body: 'مرحباً، نذكّرك بأن الفاتورة INV-2026-0006 بمبلغ 12,450 ر.س تستحق خلال 3 أيام.',
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    read: false,
  },
  {
    id: 'sa-2', event: 'onCreated', channel: 'inApp',
    recipientKind: 'user', recipientId: 'u-1',
    recipientName: 'أحمد عبدالله', recipientContact: 'المحاسب',
    invoiceId: 'inv-2', invoiceNumber: 'INV-2026-0007',
    amount: 4800, currencySymbol: 'ر.س',
    subject: 'تم إصدار فاتورة جديدة',
    body: 'تم إصدار الفاتورة INV-2026-0007 للعميل مؤسسة النجم.',
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    read: true, readAt: new Date(Date.now() - 1000 * 60 * 60 * 27).toISOString(),
  },
  {
    id: 'sa-3', event: 'onOverdue', channel: 'email',
    recipientKind: 'client', recipientId: 'cl-1',
    recipientName: 'شركة الأفق للتجارة', recipientContact: 'finance@alofok.sa',
    invoiceId: 'inv-3', invoiceNumber: 'INV-2026-0004',
    amount: 8200, currencySymbol: 'ر.س',
    subject: 'فاتورتك متأخرة عن السداد',
    body: 'الفاتورة INV-2026-0004 متأخرة 7 أيام عن موعد الاستحقاق.',
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    read: false,
  },
  {
    id: 'sa-4', event: 'onPaid', channel: 'email',
    recipientKind: 'client', recipientId: 'cl-2',
    recipientName: 'مؤسسة النجم', recipientContact: 'pay@alnajm.sa',
    invoiceId: 'inv-4', invoiceNumber: 'INV-2026-0005',
    amount: 3100, currencySymbol: 'ر.س',
    subject: 'تم استلام دفعتك — شكراً لك',
    body: 'تم تأكيد استلام دفعتك على الفاتورة INV-2026-0005.',
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    read: true, readAt: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
  },
];

let cache: SentAlert[] | null = null;

const read = (): SentAlert[] => {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seed));
      cache = seed;
      return cache;
    }
    cache = JSON.parse(raw) as SentAlert[];
    return cache;
  } catch { cache = seed; return cache; }
};

const write = (list: SentAlert[]): void => {
  cache = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  listeners.forEach(l => l());
};

export const getSentAlerts = (): SentAlert[] => read();

export const markAlertRead = (id: string): void => {
  const list = read().map(a => a.id === id ? { ...a, read: true, readAt: new Date().toISOString() } : a);
  write(list);
};

export const markAllAlertsRead = (filter?: (a: SentAlert) => boolean): void => {
  const list = read().map(a => (!a.read && (!filter || filter(a))) ? { ...a, read: true, readAt: new Date().toISOString() } : a);
  write(list);
};

export const subscribeSentAlerts = (cb: () => void): (() => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
};
