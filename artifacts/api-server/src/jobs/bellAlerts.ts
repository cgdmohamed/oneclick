/** Pushes a brief, once-a-day-per-company bell notification summarising
 *  overdue (uncollected) invoices and low/out-of-stock products — the two
 *  states a company should notice without having to open the dashboard.
 *  Uses `kind = 'warning'`, which (unlike 'invoice_email') is not excluded
 *  from the regular notification bell. */
import { pool } from '../db/client.js';

interface OverdueRow { company_id: string; cnt: number; total: string }
interface StockRow { company_id: string; low: number; out: number }

async function tickOverdueInvoiceAlerts() {
  try {
    const rs = await pool.query<OverdueRow>(`
      SELECT company_id, COUNT(*)::int AS cnt, COALESCE(SUM(remaining),0) AS total
      FROM invoices
      WHERE status != 'cancelled' AND remaining > 0
        AND due_date IS NOT NULL AND due_date < now()
      GROUP BY company_id
    `);

    for (const row of rs.rows) {
      if (row.cnt <= 0) continue;
      const logged = await pool.query(
        `INSERT INTO bell_alert_log (company_id, alert_type) VALUES ($1, 'overdue_invoices')
         ON CONFLICT (company_id, alert_type, alert_date) DO NOTHING RETURNING id`,
        [row.company_id],
      );
      if (!logged.rowCount) continue;

      const total = Number(row.total).toFixed(2);
      await pool.query(
        `INSERT INTO notifications (company_id, user_id, title, body, kind) VALUES ($1, NULL, $2, $3, 'warning')`,
        [
          row.company_id,
          'فواتير متأخرة التحصيل',
          `لديك ${row.cnt} فاتورة متأخرة التحصيل بإجمالي ${total} ج.م — راجعها من شاشة الفواتير.`,
        ],
      );
    }
  } catch (e) {
    console.error('[jobs] overdue invoice bell alert tick failed:', (e as Error).message);
  }
}

async function tickLowStockAlerts() {
  try {
    const rs = await pool.query<StockRow>(`
      SELECT company_id,
        COUNT(*) FILTER (WHERE quantity <= alert_level)::int AS low,
        COUNT(*) FILTER (WHERE quantity <= 0)::int AS out
      FROM products
      WHERE product_type = 'stock'
      GROUP BY company_id
      HAVING COUNT(*) FILTER (WHERE quantity <= alert_level) > 0
    `);

    for (const row of rs.rows) {
      const logged = await pool.query(
        `INSERT INTO bell_alert_log (company_id, alert_type) VALUES ($1, 'low_stock')
         ON CONFLICT (company_id, alert_type, alert_date) DO NOTHING RETURNING id`,
        [row.company_id],
      );
      if (!logged.rowCount) continue;

      const outSuffix = row.out > 0 ? `، منها ${row.out} نفد بالكامل` : '';
      await pool.query(
        `INSERT INTO notifications (company_id, user_id, title, body, kind) VALUES ($1, NULL, $2, $3, 'warning')`,
        [
          row.company_id,
          'تنبيه مخزون',
          `${row.low} صنف قارب على النفاد${outSuffix} — راجع المخزون من شاشة المنتجات.`,
        ],
      );
    }
  } catch (e) {
    console.error('[jobs] low stock bell alert tick failed:', (e as Error).message);
  }
}

export async function tickBellAlerts() {
  await tickOverdueInvoiceAlerts();
  await tickLowStockAlerts();
}
