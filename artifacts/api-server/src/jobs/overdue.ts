/** Periodically marks overdue invoices and expires stale subscriptions. */
import { pool } from '../db/client.js';

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
    const r = await pool.query(`
      UPDATE subscriptions SET status = 'expired'
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < now()
    `);
    if (r.rowCount && r.rowCount > 0) {
      console.log(`[jobs] expired ${r.rowCount} subscriptions`);
    }
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
