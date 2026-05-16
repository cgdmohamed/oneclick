import { Router } from 'express';

const router = Router();

router.get('/overview', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const totals = await t.db.query(`
      SELECT
        COALESCE(SUM(total),0)     AS total_sales,
        COALESCE(SUM(paid),0)      AS total_paid,
        COALESCE(SUM(remaining),0) AS total_remaining,
        COUNT(*)                   AS invoices_count
      FROM invoices WHERE company_id = $1
    `, [t.companyId]);
    const lowStock = await t.db.query(`SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1 AND quantity <= alert_level`, [t.companyId]);
    const clients  = await t.db.query(`SELECT COUNT(*)::int AS n FROM clients WHERE company_id = $1`, [t.companyId]);
    const monthly = await t.db.query(`
      SELECT to_char(date_trunc('month', issue_date), 'YYYY-MM') AS month,
             COALESCE(SUM(total),0) AS total
      FROM invoices
      WHERE company_id = $1 AND issue_date >= now() - interval '6 months'
      GROUP BY 1 ORDER BY 1
    `, [t.companyId]);
    res.json({
      data: {
        totals: totals.rows[0],
        low_stock: lowStock.rows[0].n,
        clients: clients.rows[0].n,
        monthly_sales: monthly.rows,
      },
    });
  } catch (e) { next(e); }
});

router.get('/aging', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT
        SUM(CASE WHEN due_date IS NULL OR due_date >= now() THEN remaining ELSE 0 END) AS not_due,
        SUM(CASE WHEN due_date < now() AND due_date >= now() - interval '30 days' THEN remaining ELSE 0 END) AS d_0_30,
        SUM(CASE WHEN due_date < now() - interval '30 days' AND due_date >= now() - interval '60 days' THEN remaining ELSE 0 END) AS d_30_60,
        SUM(CASE WHEN due_date < now() - interval '60 days' AND due_date >= now() - interval '90 days' THEN remaining ELSE 0 END) AS d_60_90,
        SUM(CASE WHEN due_date < now() - interval '90 days' THEN remaining ELSE 0 END) AS d_90_plus
      FROM invoices WHERE company_id = $1 AND remaining > 0
    `, [t.companyId]);
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

export default router;
