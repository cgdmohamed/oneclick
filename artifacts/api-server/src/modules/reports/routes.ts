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
    const { from, to } = req.query as Record<string, string>;
    const params: unknown[] = [t.companyId];
    let where = `WHERE py.company_id = $1`;
    if (from) { params.push(from); where += ` AND py.paid_at >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND py.paid_at <= $${params.length}`; }

    const rs = await t.db.query(`
      SELECT py.id, py.amount, py.method, py.paid_at, py.reference, py.notes,
             s.name AS supplier_name, ec.name AS category_name, a.name AS account_name
      FROM payouts py
      LEFT JOIN suppliers s ON s.id = py.supplier_id
      LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
      LEFT JOIN accounts a ON a.id = py.account_id
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
      SELECT p.id, p.name, p.sku, p.quantity, p.alert_level, p.price, p.cost, p.unit,
             p.is_active,
             pc.name AS category_name,
             s.name  AS supplier_name,
             (p.quantity * p.cost) AS stock_value
      FROM products p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.company_id = $1
      ORDER BY p.name ASC
    `, [t.companyId]);

    const totalValue  = rs.rows.reduce((s: number, r: { stock_value: string }) => s + Number(r.stock_value), 0);
    const lowStockCnt = rs.rows.filter((r: { quantity: number; alert_level: number }) => r.quantity <= r.alert_level).length;
    res.json({ data: rs.rows, summary: { total_value: totalValue.toFixed(2), low_stock_count: lowStockCnt } });
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

function dateFilters(query: Record<string, unknown>, column = 'je.entry_date') {
  const params: unknown[] = [];
  const where: string[] = [];
  const from = typeof query.from === 'string' ? query.from : null;
  const to = typeof query.to === 'string' ? query.to : null;
  if (from) { params.push(from); where.push(`${column} >= $${params.length}`); }
  if (to) { params.push(to); where.push(`${column} <= $${params.length}`); }
  return { params, where };
}

router.get('/general-ledger', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const accountId = typeof req.query.account_id === 'string' ? req.query.account_id : null;
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, ...f.params];
    const where = [`je.company_id = $1`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`))];
    if (accountId) { params.push(accountId); where.push(`jel.account_id = $${params.length}`); }
    const rs = await t.db.query(
      `SELECT je.entry_date, je.number, je.source_type, je.source_id, je.memo,
              ca.code AS account_code, ca.name AS account_name, ca.type,
              jel.description, jel.debit, jel.credit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_accounts ca ON ca.id = jel.account_id
       WHERE ${where.join(' AND ')}
       ORDER BY je.entry_date, je.number, jel.line_no`,
      params,
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/account-statement/:accountId', async (req, res, next) => {
  try {
    const t = req.tenant!;
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
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/trial-balance', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, ...f.params];
    const where = [`ca.company_id = $1`, `je.status IN ('posted','reversed')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`))];
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
    res.json({ data: rs.rows, summary: { debit: debit.toFixed(2), credit: credit.toFixed(2), difference: (debit - credit).toFixed(2) } });
  } catch (e) { next(e); }
});

router.get('/income-statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const f = dateFilters(req.query);
    const params: unknown[] = [t.companyId, ...f.params];
    const where = [`ca.company_id = $1`, `je.status IN ('posted','reversed')`, `ca.type IN ('revenue','expense')`, ...f.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`))];
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
    res.json({ data: rs.rows, summary: { revenue: revenue.toFixed(2), expenses: expenses.toFixed(2), net_income: (revenue - expenses).toFixed(2) } });
  } catch (e) { next(e); }
});

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const to = typeof req.query.to === 'string' ? req.query.to : new Date().toISOString().slice(0, 10);
    const rs = await t.db.query(
      `SELECT ca.code, ca.name, ca.type,
              COALESCE(SUM(jel.debit - jel.credit),0) AS debit_balance,
              COALESCE(SUM(jel.credit - jel.debit),0) AS credit_balance
       FROM chart_accounts ca
       LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status IN ('posted','reversed') AND je.entry_date <= $2
       WHERE ca.company_id = $1 AND ca.type IN ('asset','liability','equity')
       GROUP BY ca.code, ca.name, ca.type ORDER BY ca.code`,
      [t.companyId, to],
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
    res.json({ data: rs.rows, summary: { assets: assets.toFixed(2), liabilities: liabilities.toFixed(2), equity: equity.toFixed(2), liabilities_and_equity: (liabilities + equity).toFixed(2) } });
  } catch (e) { next(e); }
});

router.get('/customer-ledger', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT c.id, c.name,
              COALESCE(SUM(i.total),0) AS invoiced,
              COALESCE(SUM(i.paid),0) AS paid,
              COALESCE(SUM(i.remaining),0) AS outstanding
       FROM clients c
       LEFT JOIN invoices i ON i.client_id = c.id AND i.company_id = c.company_id AND i.status != 'cancelled'
       WHERE c.company_id = $1
       GROUP BY c.id, c.name ORDER BY c.name`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/supplier-ledger', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT s.id, s.name,
              COALESCE(SUM(pi.total),0) AS purchased,
              COALESCE(SUM(pi.paid),0) AS paid,
              COALESCE(SUM(pi.remaining),0) AS outstanding
       FROM suppliers s
       LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.company_id = s.company_id AND pi.status != 'cancelled'
       WHERE s.company_id = $1
       GROUP BY s.id, s.name ORDER BY s.name`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/vat', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const sales = await t.db.query(`SELECT COALESCE(SUM(vat_amount),0) AS vat FROM invoices WHERE company_id = $1 AND status != 'cancelled'`, [t.companyId]);
    const purchases = await t.db.query(`SELECT COALESCE(SUM(vat_amount),0) AS vat FROM purchase_invoices WHERE company_id = $1 AND status != 'cancelled'`, [t.companyId]);
    const outputVat = Number(sales.rows[0].vat);
    const inputVat = Number(purchases.rows[0].vat);
    res.json({ data: { output_vat: outputVat.toFixed(2), input_vat: inputVat.toFixed(2), net_vat_payable: (outputVat - inputVat).toFixed(2) } });
  } catch (e) { next(e); }
});

export default router;
