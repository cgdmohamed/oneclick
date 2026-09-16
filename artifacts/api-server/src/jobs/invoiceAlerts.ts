/**
 * Runs the "Invoice Alerts" feature configured per-company in Settings →
 * تنبيهات الفواتير (see invoice_alert_settings table / InvoiceAlertsSettings.tsx).
 * Ticks hourly alongside the other jobs in jobs/overdue.ts. For each company
 * with the feature enabled, checks due-soon / overdue / just-paid invoices
 * against invoice_alert_log to avoid re-sending the same event twice, then
 * dispatches per the configured audience/channels and logs the result as a
 * kind='invoice_email' notification — the same shape the manual "send email"
 * endpoint writes, so automated alerts show up in the existing
 * "تنبيهات الفواتير المُرسَلة" tab without any extra frontend work.
 */
import { pool } from '../db/client.js';
import { sendEmail } from '../utils/email.js';
import { renderEmail } from '../utils/emailTemplate.js';
import { getCompanyBranding } from '../utils/platformBranding.js';
import { internalKindSchema } from '../modules/notifications/kinds.js';
import { env } from '../config/env.js';

type AlertEvent = 'onDueSoon' | 'onOverdue' | 'onPaid';

interface AlertSettings {
  enabled: boolean;
  audience: 'clients' | 'users' | 'both';
  channels: { email: boolean; inApp: boolean };
  events: {
    onCreated: boolean;
    onDueSoon: { enabled: boolean; daysBefore: number };
    onOverdue: { enabled: boolean; daysAfter: number; repeatEveryDays: number };
    onPaid: boolean;
  };
  schedule: { mode: 'immediate' | 'daily' | 'weekly'; dailyAt: string; weeklyDay: string };
  quietHours: { enabled: boolean; from: string; to: string };
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function withinQuietHours(settings: AlertSettings, now: Date): boolean {
  if (!settings.quietHours.enabled) return false;
  const [fh, fm] = settings.quietHours.from.split(':').map(Number);
  const [th, tm] = settings.quietHours.to.split(':').map(Number);
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const from = (fh ?? 0) * 60 + (fm ?? 0);
  const to = (th ?? 0) * 60 + (tm ?? 0);
  if (from === to) return false;
  return from < to ? cur >= from && cur < to : cur >= from || cur < to;
}

/** Immediate = every tick; daily/weekly = only during the configured hour (and weekday). */
function scheduleDue(settings: AlertSettings, now: Date): boolean {
  if (settings.schedule.mode === 'immediate') return true;
  const [h] = settings.schedule.dailyAt.split(':').map(Number);
  if (now.getUTCHours() !== (h ?? 9)) return false;
  if (settings.schedule.mode === 'weekly' && WEEKDAYS[now.getUTCDay()] !== settings.schedule.weeklyDay) return false;
  return true;
}

interface Recipient { email: string | null; name: string; kind: 'client' | 'user' }

async function recipientsFor(companyId: string, clientId: string, audience: AlertSettings['audience']): Promise<Recipient[]> {
  const out: Recipient[] = [];
  if (audience === 'clients' || audience === 'both') {
    const cl = await pool.query(`SELECT name, email FROM clients WHERE id = $1`, [clientId]);
    if (cl.rows[0]) out.push({ email: cl.rows[0].email, name: cl.rows[0].name, kind: 'client' });
  }
  if (audience === 'users' || audience === 'both') {
    const users = await pool.query(
      `SELECT u.email, u.name FROM user_companies uc JOIN users u ON u.id = uc.user_id WHERE uc.company_id = $1`,
      [companyId],
    );
    for (const row of users.rows) out.push({ email: row.email, name: row.name, kind: 'user' });
  }
  return out;
}

const EVENT_TITLES: Record<AlertEvent, string> = {
  onDueSoon: 'تذكير: اقتراب موعد استحقاق فاتورة',
  onOverdue: 'فاتورة متأخرة عن السداد',
  onPaid: 'تم استلام دفعة على فاتورة',
};

async function dispatchAlert(
  companyId: string,
  event: AlertEvent,
  invoice: { id: string; number: string; client_id: string; total: string; due_date: string | null },
  settings: AlertSettings,
) {
  const already = await pool.query(
    `SELECT 1 FROM invoice_alert_log WHERE invoice_id = $1 AND event = $2
       AND sent_at > NOW() - ($3 || ' days')::interval`,
    [invoice.id, event, event === 'onOverdue' ? settings.events.onOverdue.repeatEveryDays : 36500],
  );
  if (already.rowCount) return;

  const recipients = await recipientsFor(companyId, invoice.client_id, settings.audience);
  const company = (await pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId])).rows[0];
  const publicIdRow = await pool.query(`SELECT public_id FROM invoices WHERE id = $1`, [invoice.id]);
  const publicUrl = `${env.APP_URL}/invoice/${publicIdRow.rows[0]?.public_id}`;
  const dueDateStr = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('ar-SA') : null;
  const title = EVENT_TITLES[event];
  const bodyByEvent: Record<AlertEvent, string> = {
    onDueSoon: `<p>الفاتورة رقم <strong>${invoice.number}</strong> بمبلغ ${invoice.total} تستحق قريبًا${dueDateStr ? ` بتاريخ ${dueDateStr}` : ''}.</p>`,
    onOverdue: `<p>الفاتورة رقم <strong>${invoice.number}</strong> بمبلغ ${invoice.total} متأخرة عن موعد السداد${dueDateStr ? ` (${dueDateStr})` : ''}.</p>`,
    onPaid: `<p>تم تأكيد استلام دفعة على الفاتورة رقم <strong>${invoice.number}</strong>. شكرًا لتعاملكم معنا.</p>`,
  };

  if (settings.channels.email) {
    const branding = await getCompanyBranding(pool, companyId);
    for (const r of recipients) {
      if (!r.email) continue;
      await sendEmail({
        to: r.email,
        subject: `${title} — ${invoice.number}`,
        html: renderEmail({
          ...branding,
          title,
          previewText: `${company?.name ?? ''} — فاتورة ${invoice.number}`,
          bodyHtml: bodyByEvent[event],
          ctaLabel: 'عرض الفاتورة',
          ctaUrl: publicUrl,
        }),
      });
    }
  }

  if (settings.channels.inApp) {
    const notificationKind = internalKindSchema.parse('invoice_email');
    const primary = recipients[0];
    await pool.query(
      `INSERT INTO notifications (company_id, user_id, title, body, kind) VALUES ($1, NULL, $2, $3, $4)`,
      [
        companyId,
        `${title} — ${invoice.number}`,
        JSON.stringify({
          event,
          channel: 'email',
          recipientKind: primary?.kind ?? 'client',
          recipientId: invoice.client_id,
          recipientName: primary?.name ?? '—',
          recipientContact: primary?.email ?? '',
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          amount: Number(invoice.total),
        }),
        notificationKind,
      ],
    );
  }

  await pool.query(`INSERT INTO invoice_alert_log (company_id, invoice_id, event) VALUES ($1, $2, $3)`, [companyId, invoice.id, event]);
}

async function processCompany(companyId: string, settings: AlertSettings, now: Date) {
  if (!settings.enabled) return;
  if (withinQuietHours(settings, now)) return;
  if (!scheduleDue(settings, now)) return;

  if (settings.events.onDueSoon.enabled) {
    const rs = await pool.query(
      `SELECT id, number, client_id, total, due_date FROM invoices
       WHERE company_id = $1 AND status IN ('sent','partial') AND remaining > 0
         AND due_date IS NOT NULL
         AND due_date::date <= (CURRENT_DATE + ($2 || ' days')::interval)::date
         AND due_date::date >= CURRENT_DATE`,
      [companyId, settings.events.onDueSoon.daysBefore],
    );
    for (const inv of rs.rows) await dispatchAlert(companyId, 'onDueSoon', inv, settings);
  }

  if (settings.events.onOverdue.enabled) {
    const rs = await pool.query(
      `SELECT id, number, client_id, total, due_date FROM invoices
       WHERE company_id = $1 AND status = 'overdue' AND remaining > 0
         AND due_date IS NOT NULL
         AND due_date::date <= (CURRENT_DATE - ($2 || ' days')::interval)::date`,
      [companyId, settings.events.onOverdue.daysAfter],
    );
    for (const inv of rs.rows) await dispatchAlert(companyId, 'onOverdue', inv, settings);
  }

  if (settings.events.onPaid) {
    const rs = await pool.query(
      `SELECT id, number, client_id, total, due_date FROM invoices
       WHERE company_id = $1 AND status = 'paid'`,
      [companyId],
    );
    for (const inv of rs.rows) await dispatchAlert(companyId, 'onPaid', inv, settings);
  }
}

export async function tickInvoiceAlerts() {
  try {
    const now = new Date();
    const rs = await pool.query(`SELECT company_id, settings FROM invoice_alert_settings`);
    for (const row of rs.rows) {
      try {
        await processCompany(row.company_id, row.settings as AlertSettings, now);
      } catch (e) {
        console.error(`[jobs] invoice alerts failed for company ${row.company_id}:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error('[jobs] invoice alerts tick failed:', (e as Error).message);
  }
}
