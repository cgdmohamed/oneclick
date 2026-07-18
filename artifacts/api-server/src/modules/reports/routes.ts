import { Router } from 'express';

const router = Router();

const requiredAccountingSettings = [
  'accounts_receivable_account_id',
  'accounts_payable_account_id',
  'sales_revenue_account_id',
  'sales_vat_account_id',
  'purchase_vat_account_id',
  'inventory_account_id',
  'cogs_account_id',
  'cash_account_id',
  'bank_account_id',
  'wallet_account_id',
  'general_expenses_account_id',
  'retained_earnings_account_id',
  'inventory_adjustment_account_id',
];

async function reportMeta(db: any, companyId: string, query: Record<string, unknown>) {
  const from = typeof query.from === 'string' ? query.from : null;
  const to = typeof query.to === 'string' ? query.to : null;
  const settings = await db.query(`SELECT * FROM accounting_settings WHERE company_id = $1`, [companyId]);
  const settingsRow = settings.rows[0] ?? {};
  const missingSettings = requiredAccountingSettings.filter((key) => !settingsRow[key]);
  const params: unknown[] = [companyId];
  const draftWhere = [`company_id = $1`, `status = 'draft'`];
  if (from) { params.push(from); draftWhere.push(`entry_date >= $${params.length}`); }
  if (to) { params.push(to); draftWhere.push(`entry_date <= $${params.length}`); }
  const drafts = await db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE ${draftWhere.join(' AND ')}`, params);
  const periodParams: unknown[] = [companyId];
  const periodWhere = [`company_id = $1`, `is_locked = FALSE`];
  if (from && to) {
    periodParams.push(from, to);
    periodWhere.push(`starts_on <= $3::date AND ends_on >= $2::date`);
  } else if (to) {
    periodParams.push(to);
    periodWhere.push(`starts_on <= $2::date`);
  }
  const periods = await db.query(`SELECT COUNT(*)::int AS count FROM accounting_periods WHERE ${periodWhere.join(' AND ')}`, periodParams);
  const warnings: string[] = [];
  if (missingSettings.length) warnings.push(`Accounting settings incomplete: ${missingSettings.join(', ')}`);
  if (Number(drafts.rows[0].count) > 0) warnings.push(`${drafts.rows[0].count} unposted draft journal(s) in the selected range`);
  if (Number(periods.rows[0].count) > 0) warnings.push(`${periods.rows[0].count} accounting period(s) in scope are not locked/closed`);
  return { settings: settingsRow, warnings, missing_settings: missingSettings, draft_journals: drafts.rows[0].count, unlocked_periods: periods.rows[0].count };
}

router.get('/overview', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const totals = await t.db.query(`
      SELECT
        COALESCE(SUM(total),0)     AS total_sales,
        COALESCE(SUM(paid),0)      AS total_paid,
        COALESCE(SUM(remaining),0) AS total_remaining,
        COUNT(*)                   AS invoices_count
      FROM invoices WHERE company_id = $1 AND status != 'cancelled'
    `, [t.companyId]);
    const payoutTotals = await t.db.query(`
      SELECT COALESCE(SUM(amount),0) AS total_payouts FROM payouts WHERE company_id = $1
    `, [t.companyId]);
    const lowStock = await t.db.query(`SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1 AND quantity <= alert_level`, [t.companyId]);
    const clients  = await t.db.query(`SELECT COUNT(*)::int AS n FROM clients WHERE company_id = $1`, [t.companyId]);
    const monthly = await t.db.query(`
      SELECT to_char(date_trunc('month', issue_date), 'YYYY-MM') AS month,
             COALESCE(SUM(total),0) AS total
      FROM invoices
      WHERE company_id = $1 AND issue_date >= now() - interval '6 months'
        AND status != 'cancelled'
      GROUP BY 1 ORDER BY 1
    `, [t.companyId]);
    const recentInvoices = await t.db.query(`
      SELECT i.id, i.number, i.issue_date, i.total, i.remaining, i.status,
             c.name AS client_name
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.company_id = $1
      ORDER BY i.created_at DESC
      LIMIT 6
    `, [t.companyId]);
    const recentCollections = await t.db.query(`
      SELECT p.id, p.amount, p.paid_at, p.method,
             a.name AS account_name,
             i.number AS invoice_number, c.name AS client_name
      FROM payments p
      LEFT JOIN accounts a ON a.id = p.account_id
      LEFT JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE p.company_id = $1
      ORDER BY p.paid_at DESC LIMIT 5
    `, [t.companyId]);
    const recentPayouts = await t.db.query(`
      SELECT py.id, py.amount, py.paid_at, py.method,
             a.name AS account_name,
             s.name AS supplier_name, ec.name AS category_name
      FROM payouts py
      LEFT JOIN accounts a ON a.id = py.account_id
      LEFT JOIN suppliers s ON s.id = py.supplier_id
      LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
      WHERE py.company_id = $1
      ORDER BY py.paid_at DESC LIMIT 5
    `, [t.companyId]);
    const accountBalances = await t.db.query(`
      SELECT id, name, type, balance FROM accounts WHERE company_id = $1 AND is_active = TRUE ORDER BY name ASC
    `, [t.companyId]);

    const totalPaid    = Number(totals.rows[0]?.total_paid    ?? 0);
    const totalPayouts = Number(payoutTotals.rows[0]?.total_payouts ?? 0);

    res.json({
      data: {
        totals: {
          ...totals.rows[0],
          total_payouts: totalPayouts.toFixed(2),
          net_cash: (totalPaid - totalPayouts).toFixed(2),
        },
        low_stock:           lowStock.rows[0].n,
        clients:             clients.rows[0].n,
        monthly_sales:       monthly.rows,
        recent_invoices:     recentInvoices.rows,
        recent_collections:  recentCollections.rows,
        recent_payouts:      recentPayouts.rows,
        account_balances:    accountBalances.rows,
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
      FROM invoices WHERE company_id = $1 AND remaining > 0 AND status != 'cancelled'
    `, [t.companyId]);
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.get('/payouts', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const { from, to, branch_id, cost_center_id } = req.query as Record<string, string>;
    const params: unknown[] = [t.companyId];
    let where = `WHERE py.company_id = $1`;
    if (from) { params.push(from); where += ` AND py.paid_at >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND py.paid_at <= $${params.length}`; }
    if (branch_id) { params.push(branch_id); where += ` AND py.branch_id = $${params.length}`; }
    if (cost_center_id) { params.push(cost_center_id); where += ` AND py.cost_center_id = $${params.length}`; }

    const rs = await t.db.query(`
      SELECT py.id, py.amount, py.method, py.paid_at, py.reference, py.notes,
             s.name AS supplier_name, ec.name AS category_name, a.name AS account_name,
             b.name AS branch_name, cc.name AS cost_center_name
      FROM payouts py
      LEFT JOIN suppliers s ON s.id = py.supplier_id
      LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
      LEFT JOIN accounts a ON a.id = py.account_id
      LEFT JOIN branches b ON b.id = py.branch_id
      LEFT JOIN cost_centers cc ON cc.id = py.cost_center_id
      ${where}
      ORDER BY py.paid_at DESC
    `, params);

    const total = rs.rows.reduce((s: number, r: { amount: string }) => s + Number(r.amount), 0);
    res.json({ data: rs.rows, summary: { total: total.toFixed(2), count: rs.rows.length } });
  } catch (e) { next(e); }
});

router.get('/suppliers', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT s.id, s.name, s.phone, s.email, s.is_active,
             COUNT(DISTINCT p.id)::int  AS product_count,
             COUNT(DISTINCT py.id)::int AS payout_count,
             COALESCE(SUM(py.amount),0) AS total_payouts,
             MAX(py.paid_at)            AS last_payout_at
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id AND p.company_id = s.company_id
      LEFT JOIN payouts py ON py.supplier_id = s.id AND py.company_id = s.company_id
      WHERE s.company_id = $1
      GROUP BY s.id, s.name, s.phone, s.email, s.is_active
      ORDER BY total_payouts DESC
    `, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/inventory', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT p.id, p.name, p.sku, p.product_type, p.quantity, p.alert_level, p.price, p.cost,
             COALESCE(NULLIF(p.average_cost, 0), p.cost, 0) AS average_cost,
             p.unit, p.is_active,
             pc.name AS category_name,
             s.name  AS supplier_name,
             COALESCE(NULLIF(p.inventory_value, 0), p.quantity * COALESCE(NULLIF(p.average_cost, 0), p.cost, 0)) AS stock_value
      FROM products p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.company_id = $1 AND p.product_type = 'stock'
      ORDER BY p.name ASC
    `, [t.companyId]);

    const totalValue  = rs.rows.reduce((s: number, r: { stock_value: string }) => s + Number(r.stock_value), 0);
    const lowStockCnt = rs.rows.filter((r: { quantity: number; alert_level: number }) => r.quantity <= r.alert_level).length;
    res.json({ data: rs.rows, summary: { total_value: totalValue.toFixed(2), low_stock_count: lowStockCnt } });
  } catch (e) { next(e); }
});

router.get('/inventory-write-offs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const params: unknown[] = [t.companyId];
    const where = [`iwo.company_id = $1`, `iwo.status = 'posted'`];
    const { from, to, product_id, category_id, branch_id, cost_center_id, reason } = req.query as Record<string, string>;
    if (from) { params.push(from); where.push(`iwo.write_off_date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`iwo.write_off_date < ($${params.length}::date + interval '1 day')`); }
    if (product_id) { params.push(product_id); where.push(`iwoi.product_id = $${params.length}`); }
    if (category_id) { params.push(category_id); where.push(`p.category_id = $${params.length}`); }
    if (branch_id) { params.push(branch_id); where.push(`iwo.branch_id = $${params.length}`); }
    if (cost_center_id) { params.push(cost_center_id); where.push(`iwo.cost_center_id = $${params.length}`); }
    if (reason) { params.push(reason); where.push(`COALESCE(iwoi.reason, iwo.reason) = $${params.length}`); }
    const rs = await t.db.query(
      `SELECT iwo.id, iwo.write_off_number, iwo.write_off_date, iwo.reason AS document_reason,
              COALESCE(iwoi.reason, iwo.reason) AS reason,
              p.id AS product_id, p.name AS product_name, p.sku, pc.name AS category_name,
              iwoi.quantity, iwoi.unit_cost, iwoi.total_cost,
              b.name AS branch_name, cc.name AS cost_center_name
       FROM inventory_write_off_items iwoi
       JOIN inventory_write_offs iwo ON iwo.id = iwoi.write_off_id AND iwo.company_id = iwoi.company_id
       JOIN products p ON p.id = iwoi.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN branches b ON b.id = iwo.branch_id
       LEFT JOIN cost_centers cc ON cc.id = iwo.cost_center_id
       WHERE ${where.join(' AND ')}
       ORDER BY iwo.write_off_date DESC, iwo.created_at DESC`,
      params,
    );
    const totalCost = rs.rows.reduce((sum: number, row: { total_cost: string }) => sum + Number(row.total_cost), 0);
    const quantity = rs.rows.reduce((sum: number, row: { quantity: string }) => sum + Number(row.quantity), 0);
    res.json({ data: rs.rows, summary: { total_cost: totalCost.toFixed(2), quantity: quantity.toFixed(3), count: rs.rows.length } });
  } catch (e) { next(e); }
});

router.get('/sales-returns', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const params: unknown[] = [t.companyId];
    const where = [`cn.company_id = $1`, `cn.status != 'cancelled'`];
    const { from, to, product_id, return_condition } = req.query as Record<string, string>;
    if (from) { params.push(from); where.push(`cn.credit_note_date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`cn.credit_note_date < ($${params.length}::date + interval '1 day')`); }
    if (product_id) { params.push(product_id); where.push(`cni.product_id = $${params.length}`); }
    if (return_condition) { params.push(return_condition); where.push(`cni.return_condition = $${params.length}`); }
    const rs = await t.db.query(
      `SELECT cn.id, cn.credit_note_number, cn.credit_note_date, cn.status,
              c.name AS customer_name, p.name AS product_name, p.sku,
              cni.description, cni.quantity, cni.unit_price, cni.vat_rate, cni.line_total,
              cni.return_condition, cni.return_to_stock
       FROM credit_note_items cni
       JOIN credit_notes cn ON cn.id = cni.credit_note_id AND cn.company_id = cni.company_id
       JOIN clients c ON c.id = cn.customer_id
       LEFT JOIN products p ON p.id = cni.product_id
       WHERE ${where.join(' AND ')}
       ORDER BY cn.credit_note_date DESC, cn.created_at DESC`,
      params,
    );
    const total = rs.rows.reduce((sum: number, row: { line_total: string }) => sum + Number(row.line_total), 0);
    const quantity = rs.rows.reduce((sum: number, row: { quantity: string }) => sum + Number(row.quantity), 0);
    res.json({ data: rs.rows, summary: { total: total.toFixed(2), quantity: quantity.toFixed(3), count: rs.rows.length } });
  } catch (e) { next(e); }
});

router.get('/accounts-summary', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const accounts = await t.db.query(`
      SELECT a.id, a.name, a.type, a.balance,
             COALESCE(SUM(p.amount),0)  AS total_collections,
             COALESCE(SUM(py.amount),0) AS total_payouts
      FROM accounts a
      LEFT JOIN payments p  ON p.account_id  = a.id AND p.company_id  = a.company_id
      LEFT JOIN payouts  py ON py.account_id = a.id AND py.company_id = a.company_id
      WHERE a.company_id = $1
      GROUP BY a.id, a.name, a.type, a.balance
      ORDER BY a.name ASC
    `, [t.companyId]);

    const totalBalance     = accounts.rows.reduce((s: number, r: { balance: string }) => s + Number(r.balance), 0);
    const totalCollections = accounts.rows.reduce((s: number, r: { total_collections: string }) => s + Number(r.total_collections), 0);
    const totalPayoutsVal  = accounts.rows.reduce((s: number, r: { total_payouts: string }) => s + Number(r.total_payouts), 0);

    res.json({
      data: accounts.rows,
      summary: {
        total_balance:     totalBalance.toFixed(2),
        total_collections: totalCollections.toFixed(2),
        total_payouts:     totalPayoutsVal.toFixed(2),
        net_cash:          (totalCollections - totalPayoutsVal).toFixed(2),
      },
    });
  } catch (e) { next(e); }
});

router.get('/fixed-assets/register', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT fa.*, ac.name AS category_name,
              COALESCE(dep.accumulated,0) AS accumulated_depreciation,
              GREATEST(0, fa.acquisition_cost - fa.salvage_value - COALESCE(dep.accumulated,0)) AS net_book_value
       FROM fixed_assets fa
       JOIN asset_categories ac ON ac.id = fa.category_id
       LEFT JOIN (
         SELECT drl.asset_id, SUM(drl.depreciation_amount) AS accumulated
         FROM depreciation_run_lines drl JOIN depreciation_runs dr ON dr.id = drl.depreciation_run_id
         WHERE drl.company_id = $1 AND dr.status = 'posted'
         GROUP BY drl.asset_id
       ) dep ON dep.asset_id = fa.id
       WHERE fa.company_id = $1
       ORDER BY fa.asset_code`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/fixed-assets/depreciation-schedule', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT fa.id AS asset_id, fa.asset_code, fa.name AS asset_name,
              dr.run_date, ap.name AS period_name, drl.depreciation_amount,
              drl.accumulated_depreciation_after, dr.journal_entry_id
       FROM depreciation_run_lines drl
       JOIN fixed_assets fa ON fa.id = drl.asset_id
       JOIN depreciation_runs dr ON dr.id = drl.depreciation_run_id
       JOIN accounting_periods ap ON ap.id = dr.period_id
       WHERE drl.company_id = $1 AND dr.status = 'posted'
       ORDER BY fa.asset_code, dr.run_date`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/fixed-assets/accumulated-summary', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT ac.id, ac.name AS category_name,
              COUNT(fa.id)::int AS asset_count,
              COALESCE(SUM(fa.acquisition_cost),0) AS acquisition_cost,
              COALESCE(SUM(dep.accumulated),0) AS accumulated_depreciation,
              COALESCE(SUM(fa.acquisition_cost - fa.salvage_value - COALESCE(dep.accumulated,0)),0) AS net_book_value
       FROM asset_categories ac
       LEFT JOIN fixed_assets fa ON fa.category_id = ac.id AND fa.company_id = ac.company_id
       LEFT JOIN (
         SELECT drl.asset_id, SUM(drl.depreciation_amount) AS accumulated
         FROM depreciation_run_lines drl JOIN depreciation_runs dr ON dr.id = drl.depreciation_run_id
         WHERE drl.company_id = $1 AND dr.status = 'posted'
         GROUP BY drl.asset_id
       ) dep ON dep.asset_id = fa.id
       WHERE ac.company_id = $1
       GROUP BY ac.id, ac.name
       ORDER BY ac.name`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/payroll/summary', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT pr.period_year, pr.period_month, pr.status,
              COUNT(prl.id)::int AS employee_count,
              COALESCE(SUM(prl.total_earnings),0) AS total_earnings,
              COALESCE(SUM(prl.total_deductions),0) AS total_deductions,
              COALESCE(SUM(prl.net_salary),0) AS net_salary
       FROM payroll_runs pr
       LEFT JOIN payroll_run_lines prl ON prl.payroll_run_id = pr.id
       WHERE pr.company_id = $1 AND pr.status != 'cancelled'
       GROUP BY pr.period_year, pr.period_month, pr.status
       ORDER BY pr.period_year DESC, pr.period_month DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/payroll/by-employee', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT e.id, e.employee_code, e.name,
              COALESCE(SUM(CASE WHEN pr.id IS NULL THEN 0 ELSE prl.total_earnings END),0) AS total_earnings,
              COALESCE(SUM(CASE WHEN pr.id IS NULL THEN 0 ELSE prl.total_deductions END),0) AS total_deductions,
              COALESCE(SUM(CASE WHEN pr.id IS NULL THEN 0 ELSE prl.net_salary END),0) AS net_salary
       FROM employees e
       LEFT JOIN payroll_run_lines prl ON prl.employee_id = e.id
       LEFT JOIN payroll_runs pr ON pr.id = prl.payroll_run_id AND pr.status != 'cancelled'
       WHERE e.company_id = $1
       GROUP BY e.id, e.employee_code, e.name
       ORDER BY e.employee_code`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/payroll/by-dimension', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT b.name AS branch_name, cc.name AS cost_center_name,
              COUNT(prl.id)::int AS employee_lines,
              COALESCE(SUM(prl.total_earnings),0) AS total_earnings,
              COALESCE(SUM(prl.total_deductions),0) AS total_deductions,
              COALESCE(SUM(prl.net_salary),0) AS net_salary
       FROM payroll_run_lines prl
       JOIN payroll_runs pr ON pr.id = prl.payroll_run_id AND pr.status != 'cancelled'
       LEFT JOIN branches b ON b.id = prl.branch_id
       LEFT JOIN cost_centers cc ON cc.id = prl.cost_center_id
       WHERE prl.company_id = $1
       GROUP BY b.name, cc.name
       ORDER BY b.name NULLS LAST, cc.name NULLS LAST`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/ar-aging', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const customerId = typeof req.query.customer_id === 'string' ? req.query.customer_id : null;
    const branchId = typeof req.query.branch_id === 'string' ? req.query.branch_id : null;
    const asOf = typeof req.query.to === 'string' ? req.query.to : new Date().toISOString().slice(0, 10);
    const params: unknown[] = [t.companyId, asOf];
    const where = [`i.company_id = $1`, `i.status != 'cancelled'`, `i.remaining > 0`, `i.issue_date <= $2::date + interval '1 day'`];
    if (customerId) {
      params.push(customerId);
      where.push(`i.client_id = $${params.length}`);
    }
    if (branchId) {
      params.push(branchId);
      where.push(`i.branch_id = $${params.length}`);
    }
    const rs = await t.db.query(
      `SELECT c.id AS customer_id,
              c.name AS customer_name,
              i.id AS invoice_id,
              i.number AS invoice_number,
              i.issue_date,
              i.due_date,
              i.remaining,
              CASE
                WHEN i.due_date IS NULL OR i.due_date::date >= $2::date THEN i.remaining
                ELSE 0
              END AS current,
              CASE
                WHEN i.due_date::date < $2::date AND i.due_date::date >= $2::date - interval '30 days' THEN i.remaining
                ELSE 0
              END AS days_1_30,
              CASE
                WHEN i.due_date::date < $2::date - interval '30 days' AND i.due_date::date >= $2::date - interval '60 days' THEN i.remaining
                ELSE 0
              END AS days_31_60,
              CASE
                WHEN i.due_date::date < $2::date - interval '60 days' AND i.due_date::date >= $2::date - interval '90 days' THEN i.remaining
                ELSE 0
              END AS days_61_90,
              CASE
                WHEN i.due_date::date < $2::date - interval '90 days' THEN i.remaining
                ELSE 0
              END AS over_90
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.name, i.due_date NULLS FIRST, i.number`,
      params,
    );
    const summary = rs.rows.reduce((sum: Record<string, number>, row: Record<string, string>) => {
      for (const key of ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'over_90']) sum[key] += Number(row[key] ?? 0);
      sum.total += Number(row.remaining ?? 0);
      return sum;
    }, { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 });
    res.json({ data: rs.rows, summary });
  } catch (e) { next(e); }
});

function dateFilters(query: Record<string, unknown>, column = 'je.entry_date') {
  const params: unknown[] = [];
  const where: string[] = [];
  const from = typeof query.from === 'string' ? query.from : null;
  const to = typeof query.to === 'string' ? query.to : null;
  if (from) { params.push(from); where.push(`${column} >= $${params.length}`); }
  if (to) { params.push(to); where.push(`${column} <= $${params.length}`); }
  return { params, where };
}

function dimensionFilters(query: Record<string, unknown>, params: unknown[], where: string[]) {
  const branchId = typeof query.branch_id === 'string' ? query.branch_id : null;
  const costCenterId = typeof query.cost_center_id === 'string' ? query.cost_center_id : null;
  if (branchId) {
    params.push(branchId);
    where.push(`COALESCE(jel.branch_id, je.branch_id) = $${params.length}`);
  }
  if (costCenterId) {
    params.push(costCenterId);
    where.push(`jel.cost_center_id = $${params.length}`);
  }
}

function sourcePartyFilter(query: Record<string, unknown>, params: unknown[], where: string[], alias: string, paramName: string) {
  const value = typeof query[paramName] === 'string' ? query[paramName] : null;
  if (value) {
    params.push(value);
    where.push(`${alias}.id = $${params.length}`);
  }
}

router.get('/general-ledger', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const accountId = typeof req.query.account_id === 'string' ? req.query.account_id : null;
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, ...f.params];
    const where = [`je.company_id = $1`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`))];
    if (accountId) { params.push(accountId); where.push(`jel.account_id = $${params.length}`); }
    dimensionFilters(req.query, params, where);
    const rs = await t.db.query(
      `SELECT je.entry_date, je.number, je.source_type, je.source_id, je.memo,
              ca.code AS account_code, ca.name AS account_name, ca.type,
              jel.description, jel.debit, jel.credit,
              b.name AS branch_name, cc.name AS cost_center_name
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_accounts ca ON ca.id = jel.account_id
       LEFT JOIN branches b ON b.id = COALESCE(jel.branch_id, je.branch_id)
       LEFT JOIN cost_centers cc ON cc.id = jel.cost_center_id
       WHERE ${where.join(' AND ')}
       ORDER BY je.entry_date, je.number, jel.line_no`,
      params,
    );
    const debit = rs.rows.reduce((sum: number, row: { debit: string }) => sum + Number(row.debit), 0);
    const credit = rs.rows.reduce((sum: number, row: { credit: string }) => sum + Number(row.credit), 0);
    res.json({ data: rs.rows, summary: { debit: debit.toFixed(2), credit: credit.toFixed(2), difference: (debit - credit).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/account-statement/:accountId', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, req.params.accountId, ...f.params];
    const where = [`je.company_id = $1`, `jel.account_id = $2`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 2}`))];
    const rs = await t.db.query(
      `SELECT je.entry_date, je.number, je.memo, jel.description, jel.debit, jel.credit,
              SUM(jel.debit - jel.credit) OVER (ORDER BY je.entry_date, je.number, jel.line_no) AS running_balance
       FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE ${where.join(' AND ')}
       ORDER BY je.entry_date, je.number, jel.line_no`,
      params,
    );
    const debit = rs.rows.reduce((sum: number, row: { debit: string }) => sum + Number(row.debit), 0);
    const credit = rs.rows.reduce((sum: number, row: { credit: string }) => sum + Number(row.credit), 0);
    res.json({ data: rs.rows, summary: { debit: debit.toFixed(2), credit: credit.toFixed(2), closing_balance: (debit - credit).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/account-statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const accountId = typeof req.query.account_id === 'string' ? req.query.account_id : null;
    if (!accountId) return res.json({ data: [], summary: {}, warnings: ['Select an account to view the account statement'] });
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, accountId, ...f.params];
    const where = [`je.company_id = $1`, `jel.account_id = $2`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 2}`))];
    dimensionFilters(req.query, params, where);
    const rs = await t.db.query(
      `SELECT je.entry_date, je.number, je.memo, jel.id, jel.description, jel.debit, jel.credit,
              SUM(jel.debit - jel.credit) OVER (ORDER BY je.entry_date, je.number, jel.line_no) AS running_balance
       FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE ${where.join(' AND ')}
       ORDER BY je.entry_date, je.number, jel.line_no`,
      params,
    );
    const debit = rs.rows.reduce((sum: number, row: { debit: string }) => sum + Number(row.debit), 0);
    const credit = rs.rows.reduce((sum: number, row: { credit: string }) => sum + Number(row.credit), 0);
    res.json({ data: rs.rows, summary: { debit: debit.toFixed(2), credit: credit.toFixed(2), closing_balance: (debit - credit).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/trial-balance', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, ...f.params];
    const where = [`ca.company_id = $1`, `(je.id IS NULL OR je.status IN ('posted','reversed'))`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`))];
    dimensionFilters(req.query, params, where);
    const rs = await t.db.query(
      `SELECT ca.id, ca.code, ca.name, ca.type, ca.normal_balance,
              COALESCE(SUM(jel.debit),0) AS debit,
              COALESCE(SUM(jel.credit),0) AS credit,
              COALESCE(SUM(jel.debit - jel.credit),0) AS balance
       FROM chart_accounts ca
       LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE ${where.join(' AND ')}
       GROUP BY ca.id, ca.code, ca.name, ca.type, ca.normal_balance
       ORDER BY ca.code`,
      params,
    );
    const debit = rs.rows.reduce((sum: number, row: { debit: string }) => sum + Number(row.debit), 0);
    const credit = rs.rows.reduce((sum: number, row: { credit: string }) => sum + Number(row.credit), 0);
    res.json({ data: rs.rows, summary: { debit: debit.toFixed(2), credit: credit.toFixed(2), difference: (debit - credit).toFixed(2), is_balanced: Math.abs(debit - credit) <= 0.005 }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/income-statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, ...f.params];
    const where = [`ca.company_id = $1`, `(je.id IS NULL OR je.status IN ('posted','reversed'))`, `COALESCE(je.source_type, '') != 'year_end_closing'`, `ca.type IN ('revenue','expense')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`))];
    dimensionFilters(req.query, params, where);
    const rs = await t.db.query(
      `SELECT ca.code, ca.name, ca.type,
              COALESCE(SUM(jel.credit - jel.debit),0) AS amount
       FROM chart_accounts ca
       LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE ${where.join(' AND ')}
       GROUP BY ca.code, ca.name, ca.type ORDER BY ca.code`,
      params,
    );
    const revenue = rs.rows
      .filter((r: { type: string }) => r.type === 'revenue')
      .reduce((s: number, r: { amount: string }) => s + Number(r.amount), 0);
    const expenses = rs.rows
      .filter((r: { type: string }) => r.type === 'expense')
      .reduce((s: number, r: { amount: string }) => s - Number(r.amount), 0);
    res.json({ data: rs.rows, summary: { revenue: revenue.toFixed(2), expenses: expenses.toFixed(2), net_income: (revenue - expenses).toFixed(2), formula_check: (revenue - expenses).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const to = typeof req.query.to === 'string' ? req.query.to : new Date().toISOString().slice(0, 10);
    const branchId = typeof req.query.branch_id === 'string' ? req.query.branch_id : null;
    const params: unknown[] = branchId ? [t.companyId, to, branchId] : [t.companyId, to];
    const rs = await t.db.query(
      `SELECT ca.code, ca.name, ca.type,
              COALESCE(SUM(jel.debit - jel.credit),0) AS debit_balance,
              COALESCE(SUM(jel.credit - jel.debit),0) AS credit_balance
       FROM chart_accounts ca
       LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status IN ('posted','reversed') AND je.entry_date <= $2
       WHERE ca.company_id = $1 AND ca.type IN ('asset','liability','equity')
       ${branchId ? 'AND COALESCE(jel.branch_id, je.branch_id) = $3' : ''}
       GROUP BY ca.code, ca.name, ca.type ORDER BY ca.code`,
      params,
    );
    const assets = rs.rows
      .filter((r: { type: string }) => r.type === 'asset')
      .reduce((s: number, r: { debit_balance: string }) => s + Number(r.debit_balance), 0);
    const liabilities = rs.rows
      .filter((r: { type: string }) => r.type === 'liability')
      .reduce((s: number, r: { credit_balance: string }) => s + Number(r.credit_balance), 0);
    const equity = rs.rows
      .filter((r: { type: string }) => r.type === 'equity')
      .reduce((s: number, r: { credit_balance: string }) => s + Number(r.credit_balance), 0);
    res.json({ data: rs.rows, summary: { assets: assets.toFixed(2), liabilities: liabilities.toFixed(2), equity: equity.toFixed(2), liabilities_and_equity: (liabilities + equity).toFixed(2), difference: (assets - liabilities - equity).toFixed(2), is_balanced: Math.abs(assets - liabilities - equity) <= 0.005 }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/customer-ledger', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, meta.settings.accounts_receivable_account_id, ...f.params];
    const where = [`jel.company_id = $1`, `jel.account_id = $2`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 2}`))];
    dimensionFilters(req.query, params, where);
    const customerId = typeof req.query.customer_id === 'string' ? req.query.customer_id : null;
    if (customerId) params.push(customerId);
    const rs = await t.db.query(
      `WITH ar_lines AS (
         SELECT je.source_type, je.source_id, jel.debit, jel.credit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         WHERE ${where.join(' AND ')}
       ),
       party_lines AS (
         SELECT COALESCE(inv.client_id, pay_inv.client_id, cn.customer_id, bwo.customer_id, dda.customer_id) AS customer_id,
                debit, credit
         FROM ar_lines l
         LEFT JOIN invoices inv ON l.source_type = 'invoice' AND inv.id = l.source_id
         LEFT JOIN payments pay ON l.source_type = 'payment' AND pay.id = l.source_id
         LEFT JOIN invoices pay_inv ON pay_inv.id = pay.invoice_id
         LEFT JOIN credit_notes cn ON l.source_type = 'credit_note' AND cn.id = l.source_id
         LEFT JOIN bad_debt_write_offs bwo ON l.source_type = 'bad_debt_write_off' AND bwo.id = l.source_id
         LEFT JOIN doubtful_debt_allowances dda ON l.source_type = 'doubtful_debt_allowance' AND dda.id = l.source_id
       )
       SELECT c.id, c.name,
              COALESCE(SUM(pl.debit),0) AS ledger_debit,
              COALESCE(SUM(pl.credit),0) AS ledger_credit,
              COALESCE(SUM(pl.debit - pl.credit),0) AS outstanding
       FROM clients c
       LEFT JOIN party_lines pl ON pl.customer_id = c.id
       WHERE c.company_id = $1 ${customerId ? `AND c.id = $${params.length}` : ''}
       GROUP BY c.id, c.name
       ORDER BY c.name`,
      params,
    );
    const customerTotal = rs.rows.reduce((s: number, r: { outstanding: string }) => s + Number(r.outstanding), 0);
    const ledgerParams = customerId ? params.slice(0, -1) : params;
    const ledger = await t.db.query(`SELECT COALESCE(SUM(jel.debit - jel.credit),0) AS balance FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.journal_entry_id WHERE ${where.join(' AND ')}`, ledgerParams);
    const ledgerBalance = Number(ledger.rows[0].balance);
    res.json({ data: rs.rows, summary: { customer_total: customerTotal.toFixed(2), ar_ledger_balance: ledgerBalance.toFixed(2), reconciliation_difference: (customerTotal - ledgerBalance).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/supplier-ledger', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, meta.settings.accounts_payable_account_id, ...f.params];
    const where = [`jel.company_id = $1`, `jel.account_id = $2`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 2}`))];
    dimensionFilters(req.query, params, where);
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : null;
    if (supplierId) params.push(supplierId);
    const rs = await t.db.query(
      `WITH ap_lines AS (
         SELECT je.source_type, je.source_id, jel.debit, jel.credit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         WHERE ${where.join(' AND ')}
       ),
       party_lines AS (
         SELECT COALESCE(pi.supplier_id, sp.supplier_id, pr.supplier_id) AS supplier_id,
                debit, credit
         FROM ap_lines l
         LEFT JOIN purchase_invoices pi ON l.source_type = 'purchase_invoice' AND pi.id = l.source_id
         LEFT JOIN supplier_payments sp ON l.source_type = 'supplier_payment' AND sp.id = l.source_id
         LEFT JOIN purchase_returns pr ON l.source_type = 'purchase_return' AND pr.id = l.source_id
       )
       SELECT s.id, s.name,
              COALESCE(SUM(pl.credit),0) AS ledger_credit,
              COALESCE(SUM(pl.debit),0) AS ledger_debit,
              COALESCE(SUM(pl.credit - pl.debit),0) AS outstanding
       FROM suppliers s
       LEFT JOIN party_lines pl ON pl.supplier_id = s.id
       WHERE s.company_id = $1 ${supplierId ? `AND s.id = $${params.length}` : ''}
       GROUP BY s.id, s.name
       ORDER BY s.name`,
      params,
    );
    const supplierTotal = rs.rows.reduce((s: number, r: { outstanding: string }) => s + Number(r.outstanding), 0);
    const ledgerParams = supplierId ? params.slice(0, -1) : params;
    const ledger = await t.db.query(`SELECT COALESCE(SUM(jel.credit - jel.debit),0) AS balance FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.journal_entry_id WHERE ${where.join(' AND ')}`, ledgerParams);
    const ledgerBalance = Number(ledger.rows[0].balance);
    res.json({ data: rs.rows, summary: { supplier_total: supplierTotal.toFixed(2), ap_ledger_balance: ledgerBalance.toFixed(2), reconciliation_difference: (supplierTotal - ledgerBalance).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

router.get('/vat', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const meta = await reportMeta(t.db, t.companyId, req.query);
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, meta.settings.sales_vat_account_id, meta.settings.purchase_vat_account_id, ...f.params];
    const where = [`jel.company_id = $1`, `jel.account_id IN ($2,$3)`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 3}`))];
    dimensionFilters(req.query, params, where);
    const rs = await t.db.query(
      `SELECT ca.id, ca.code, ca.name,
              COALESCE(SUM(jel.debit),0) AS debit,
              COALESCE(SUM(jel.credit),0) AS credit,
              CASE
                WHEN ca.id = $2 THEN COALESCE(SUM(jel.credit - jel.debit),0)
                ELSE COALESCE(SUM(jel.debit - jel.credit),0)
              END AS vat_balance
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_accounts ca ON ca.id = jel.account_id
       WHERE ${where.join(' AND ')}
       GROUP BY ca.id, ca.code, ca.name
       ORDER BY ca.code`,
      params,
    );
    const outputVat = rs.rows.filter((r: { id: string }) => r.id === meta.settings.sales_vat_account_id).reduce((s: number, r: { vat_balance: string }) => s + Number(r.vat_balance), 0);
    const inputVat = rs.rows.filter((r: { id: string }) => r.id === meta.settings.purchase_vat_account_id).reduce((s: number, r: { vat_balance: string }) => s + Number(r.vat_balance), 0);
    res.json({ data: rs.rows, summary: { output_vat: outputVat.toFixed(2), input_vat: inputVat.toFixed(2), net_vat_payable: (outputVat - inputVat).toFixed(2), ledger_check: (outputVat - inputVat).toFixed(2) }, warnings: meta.warnings });
  } catch (e) { next(e); }
});

export default router;
