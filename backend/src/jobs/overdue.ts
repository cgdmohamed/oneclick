/** Periodically marks overdue invoices. Runs once per hour. */
import { pool } from '../db/client.js';

let started = false;

async function tick() {
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

export function startJobs() {
  if (started) return;
  started = true;
  // first tick after 30s, then hourly
  setTimeout(tick, 30_000);
  setInterval(tick, 60 * 60 * 1000);
}
