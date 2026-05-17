/**
 * Sent-alerts module — write-side is now handled server-side when invoice
 * emails are dispatched (notifications table, kind='invoice_email').
 * Read-side is fetched via useInvoiceAlerts() in hooks/useNotificationsAlerts.
 *
 * The legacy localStorage functions below are retained as no-ops so existing
 * import sites compile without errors while the migration is in progress.
 */

export type AlertEventKind = 'onCreated' | 'onDueSoon' | 'onOverdue' | 'onPaid';
export type AlertRecipientKind = 'client' | 'user';
export type AlertChannel = 'email' | 'inApp';

export interface SentAlert {
  id: string;
  event: AlertEventKind;
  channel: AlertChannel;
  recipientKind: AlertRecipientKind;
  recipientId: string;
  recipientName: string;
  recipientContact: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currencySymbol?: string;
  subject: string;
  body: string;
  sentAt: string;
  read: boolean;
  readAt?: string;
}

const eventTitles: Record<AlertEventKind, string> = {
  onCreated: 'فاتورة جديدة بانتظار السداد',
  onDueSoon: 'تذكير بقرب موعد الاستحقاق',
  onOverdue: 'فاتورة متأخرة عن السداد',
  onPaid: 'تم استلام الدفعة',
};

export const eventLabel = (e: AlertEventKind): string => eventTitles[e];

export const getSentAlerts = (): SentAlert[] => [];
export const markAlertRead = (_id: string): void => {};
export const markAllAlertsRead = (_filter?: (a: SentAlert) => boolean): void => {};
export const subscribeSentAlerts = (_cb: () => void): (() => void) => () => {};
