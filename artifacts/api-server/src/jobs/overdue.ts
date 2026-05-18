/** Periodically marks overdue invoices and expires stale subscriptions. */
import { pool } from '../db/client.js';
import { audit } from '../utils/audit.js';
import { sendEmail } from '../utils/email.js';
import { renderEmail } from '../utils/emailTemplate.js';
import { getPlatformBranding } from '../utils/platformBranding.js';

let started = false;

async function tickOverdue() {
  try {
    const r = await pool.query(`
      UPDATE invoices SET status = 'overdue'
      WHERE due_date IS NOT NULL
        AND due_date < now()
        AND remaining > 0
        AND status IN ('sent','partial')
    `);
    if (r.rowCount && r.rowCount > 0) {
      console.log(`[jobs] marked ${r.rowCount} invoices overdue`);
    }
  } catch (e) {
    console.error('[jobs] overdue tick failed:', (e as Error).message);
  }
}

async function tickSubscriptionExpiry() {
  try {
    const r = await pool.query<{ id: string; company_id: string; expires_at: Date }>(`
      UPDATE subscriptions SET status = 'expired'
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < now()
      RETURNING id, company_id, expires_at
    `);
    if (!r.rowCount || r.rowCount === 0) return;

    console.log(`[jobs] expired ${r.rowCount} subscriptions`);

    // Write one audit entry per expired subscription
    await Promise.all(
      r.rows.map((sub) =>
        audit(pool, {
          companyId: sub.company_id,
          userId: null,
          action: 'subscription.expired',
          entity: 'subscription',
          entityId: sub.id,
          data: { expires_at: sub.expires_at },
        }),
      ),
    );

    // Send expiry emails to each company owner
    const subIds = r.rows.map((s) => s.id);
    const ownerRows = await pool.query<{
      subscription_id: string;
      company_name: string;
      plan_name: string;
      owner_email: string;
      owner_name: string;
    }>(
      `SELECT s.id AS subscription_id,
              c.name AS company_name,
              p.name AS plan_name,
              u.email AS owner_email,
              u.name  AS owner_name
         FROM subscriptions s
         JOIN companies c ON c.id = s.company_id
         JOIN plans     p ON p.id = s.plan_id
         JOIN user_companies uc ON uc.company_id = c.id AND uc.is_default = true
         JOIN users u ON u.id = uc.user_id
        WHERE s.id = ANY($1)`,
      [subIds],
    );

    const branding = await getPlatformBranding();
    const renewUrl = `${process.env['APP_URL'] ?? ''}/subscription`;
    await Promise.all(
      ownerRows.rows.map((row) =>
        sendEmail({
          to: row.owner_email,
          subject: `انتهت صلاحية اشتراكك في ${branding.brandName}`,
          html: renderEmail({
            ...branding,
            title: 'انتهت صلاحية الاشتراك',
            previewText: `اشتراك ${row.company_name} في باقة ${row.plan_name} قد انتهى`,
            bodyHtml: `<p>مرحباً ${row.owner_name || row.owner_email}،</p>
                       <p>نودّ إعلامك بأن اشتراك شركتك <strong>${row.company_name}</strong> في باقة <strong>${row.plan_name}</strong> قد انتهت صلاحيته.</p>
                       <p>لاستعادة الوصول الكامل إلى المنصة، يُرجى تجديد الاشتراك من خلال الضغط على الزر أدناه.</p>
                       <p>إذا كان لديك أي استفسار، لا تتردد في التواصل مع فريق الدعم.</p>`,
            ctaLabel: 'تجديد الاشتراك',
            ctaUrl: renewUrl,
          }),
        }).catch((err: unknown) =>
          console.error(`[jobs] failed to send expiry email to ${row.owner_email}:`, (err as Error).message),
        ),
      ),
    );

    // Create a single admin-targeted system notification summarising the batch
    const count = r.rowCount;
    const title = count === 1
      ? 'Subscription auto-expired'
      : `${count} subscriptions auto-expired`;
    const body = count === 1
      ? `Subscription ${r.rows[0].id} for company ${r.rows[0].company_id} was automatically expired on ${new Date(r.rows[0].expires_at).toISOString().slice(0, 10)}.`
      : `${count} subscriptions reached their expiry date and were automatically set to expired. Check the audit log for details.`;

    await pool.query(
      `INSERT INTO system_notifications (title, body, audience) VALUES ($1, $2, 'admin')`,
      [title, body],
    );
  } catch (e) {
    console.error('[jobs] subscription expiry tick failed:', (e as Error).message);
  }
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

export function startJobs() {
  if (started) return;
  started = true;
  // overdue invoices: first check after 30s, then hourly
  setTimeout(tickOverdue, 30_000);
  setInterval(tickOverdue, HOUR_MS);
  // subscription expiry: first check after 60s, then daily
  setTimeout(tickSubscriptionExpiry, 60_000);
  setInterval(tickSubscriptionExpiry, DAY_MS);
}
