/**
 * SCL-03: Durable background email queue powered by pg-boss.
 *
 * - Uses the same Postgres instance as the app (no extra infra).
 * - `enqueueEmail()` is what callers should use instead of awaiting SMTP
 *   inline. Falls back to a direct synchronous send if the queue can't be
 *   started (e.g. during unit tests with no DB).
 * - The worker (`startEmailWorker`) is started from `index.ts`.
 *
 * Retry policy: 5 attempts with exponential backoff (1m, 2m, 4m, …).
 * Failed jobs land in pg-boss's dead-letter queue (`__state__failed`) and
 * are logged for inspection.
 */
import PgBoss from 'pg-boss';
import { env } from '../config/env.js';
import { sendEmailNow, type EmailPayload } from './email.js';

const QUEUE_NAME = 'emails.send';

let boss: PgBoss | null = null;
let starting: Promise<PgBoss | null> | null = null;

async function getBoss(): Promise<PgBoss | null> {
  if (boss) return boss;
  if (starting) return starting;
  starting = (async () => {
    try {
      const instance = new PgBoss({
        connectionString: env.DATABASE_URL,
        // Keep pg-boss schema isolated from app tables
        schema: 'pgboss',
        retentionDays: 7,
      });
      instance.on('error', (e) => console.error('[email-queue] pg-boss error:', e));
      await instance.start();
      // Ensure the queue exists (pg-boss v10+)
      try { await instance.createQueue(QUEUE_NAME); } catch { /* exists */ }
      boss = instance;
      return instance;
    } catch (e) {
      console.error('[email-queue] failed to start pg-boss, falling back to sync send:', (e as Error).message);
      starting = null;
      return null;
    }
  })();
  return starting;
}

/**
 * Enqueue an email for background delivery. Returns the job id, or null if
 * the queue is unavailable and the message was sent (or attempted) inline.
 */
export async function enqueueEmail(payload: EmailPayload): Promise<string | null> {
  const b = await getBoss();
  if (!b) {
    // Fallback so we never silently drop mail when the queue is down.
    try { await sendEmailNow(payload); } catch (e) {
      console.error('[email-queue] inline send failed:', (e as Error).message);
    }
    return null;
  }
  const id = await b.send(QUEUE_NAME, payload, {
    retryLimit: 5,
    retryDelay: 60,      // 60s first retry
    retryBackoff: true,  // exponential
    expireInHours: 24,
  });
  return id;
}

export async function startEmailWorker(): Promise<void> {
  const b = await getBoss();
  if (!b) {
    console.warn('[email-queue] worker not started — pg-boss unavailable');
    return;
  }
  await b.work<EmailPayload>(QUEUE_NAME, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      try {
        await sendEmailNow(job.data);
      } catch (e) {
        // Let pg-boss handle the retry by re-throwing
        console.error(`[email-queue] job ${job.id} failed:`, (e as Error).message);
        throw e;
      }
    }
  });
  console.log(`[email-queue] worker listening on "${QUEUE_NAME}"`);
}

export async function stopEmailQueue(): Promise<void> {
  if (boss) {
    try { await boss.stop({ graceful: true, timeout: 5000 }); } catch { /* ignore */ }
    boss = null;
  }
}
