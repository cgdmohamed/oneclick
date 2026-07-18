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

const toNumber = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => toNumber(value).toFixed(2);

function dateRange(query: Record<string, unknown>) {
  const from = typeof query.from === 'string' && query.from ? query.from : null;
  const to = typeof query.to === 'string' && query.to ? query.to : null;
  return { from, to };
}

function previousRange(from: string | null, to: string | null) {
  if (!from || !to) return { previousFrom: null, previousTo: null };
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { previousFrom: null, previousTo: null };
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return {
    previousFrom: previousStart.toISOString().slice(0, 10),
    previousTo: previousEnd.toISOString().slice(0, 10),
  };
}

function operationalFilters(
  companyId: string,
  query: Record<string, unknown>,
  dateColumn: string,
  alias = 'doc',
  options: { branch?: boolean; costCenter?: boolean } = { branch: true, costCenter: true },
) {
  const params: unknown[] = [companyId];
  const where = [`${alias}.company_id = $1`];
  const { from, to } = dateRange(query);
  const branchId = typeof query.branch_id === 'string' ? query.branch_id : '';
  const costCenterId = typeof query.cost_center_id === 'string' ? query.cost_center_id : '';
  const categoryId = typeof query.category_id === 'string' ? query.category_id : '';
  const subcategoryId = typeof query.subcategory_id === 'string' ? query.subcategory_id : '';
  if (from) { params.push(from); where.push(`${dateColumn} >= $${params.length}::date`); }
  if (to) { params.push(to); where.push(`${dateColumn} < ($${params.length}::date + interval '1 day')`); }
  if (options.branch !== false && branchId) { params.push(branchId); where.push(`${alias}.branch_id = $${params.length}`); }
  if (options.costCenter !== false && costCenterId) { params.push(costCenterId); where.push(`item.cost_center_id = $${params.length}`); }
  if (subcategoryId) { params.push(subcategoryId); where.push(`p.category_id = $${params.length}`); }
  else if (categoryId) { params.push(categoryId); where.push(`(p.category_id = $${params.length} OR pc.parent_id = $${params.length})`); }
  return { params, where };
}

function ledgerFilters(companyId: string, query: Record<string, unknown>) {
  const params: unknown[] = [companyId];
  const where = [`je.company_id = $1`, `je.status = 'posted'`];
  const { from, to } = dateRange(query);
  const branchId = typeof query.branch_id === 'string' ? query.branch_id : '';
  const costCenterId = typeof query.cost_center_id === 'string' ? query.cost_center_id : '';
  if (from) { params.push(from); where.push(`je.entry_date >= $${params.length}::date`); }
  if (to) { params.push(to); where.push(`je.entry_date <= $${params.length}::date`); }
  if (branchId) { params.push(branchId); where.push(`COALESCE(jel.branch_id, je.branch_id) = $${params.length}`); }
  if (costCenterId) { params.push(costCenterId); where.push(`jel.cost_center_id = $${params.length}`); }
  return { params, where };
}

async function categoryRows(db: any, companyId: string) {
  const rs = await db.query(
    `SELECT id, name, parent_id FROM product_categories WHERE company_id = $1 ORDER BY parent_id NULLS FIRST, name`,
    [companyId],
  );
  return rs.rows;
}

router.get('/summary', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const q = req.query as Record<string, unknown>;
    const { from, to } = dateRange(q);
    const { previousFrom, previousTo } = previousRange(from, to);

    const salesFilter = operationalFilters(t.companyId, q, 'i.issue_date', 'i');
    salesFilter.where.push(`i.status NOT IN ('draft','cancelled')`);
    const salesWhere = salesFilter.where.join(' AND ');
    const previousQuery = { ...q, from: previousFrom ?? undefined, to: previousTo ?? undefined };
    const previousSalesFilter = previousFrom && previousTo
      ? operationalFilters(t.companyId, previousQuery, 'i.issue_date', 'i')
      : null;
    previousSalesFilter?.where.push(`i.status NOT IN ('draft','cancelled')`);

    const returnsFilter = operationalFilters(t.companyId, q, 'cn.credit_note_date', 'cn', { branch: false, costCenter: false });
    returnsFilter.where.push(`cn.status = 'posted'`);
    const returnsWhere = returnsFilter.where.join(' AND ');

    const purchasesFilter = operationalFilters(t.companyId, q, 'pi.invoice_date', 'pi');
    purchasesFilter.where.push(`pi.status NOT IN ('draft','cancelled')`);
    const purchasesWhere = purchasesFilter.where.join(' AND ');

    const payoutParams: unknown[] = [t.companyId];
    const payoutWhere = [`py.company_id = $1`];
    if (from) { payoutParams.push(from); payoutWhere.push(`py.paid_at >= $${payoutParams.length}::date`); }
    if (to) { payoutParams.push(to); payoutWhere.push(`py.paid_at < ($${payoutParams.length}::date + interval '1 day')`); }
    if (typeof q.branch_id === 'string' && q.branch_id) { payoutParams.push(q.branch_id); payoutWhere.push(`py.branch_id = $${payoutParams.length}`); }
    if (typeof q.cost_center_id === 'string' && q.cost_center_id) { payoutParams.push(q.cost_center_id); payoutWhere.push(`py.cost_center_id = $${payoutParams.length}`); }

    const collectionParams: unknown[] = [t.companyId];
    const collectionWhere = [`p.company_id = $1`];
    if (from) { collectionParams.push(from); collectionWhere.push(`p.paid_at >= $${collectionParams.length}::date`); }
    if (to) { collectionParams.push(to); collectionWhere.push(`p.paid_at < ($${collectionParams.length}::date + interval '1 day')`); }
    if (typeof q.branch_id === 'string' && q.branch_id) { collectionParams.push(q.branch_id); collectionWhere.push(`p.branch_id = $${collectionParams.length}`); }

    const branchId = typeof q.branch_id === 'string' ? q.branch_id : '';
    const invoiceScopeParams: unknown[] = [t.companyId];
    const invoiceScopeWhere = [`company_id = $1`, `status != 'cancelled'`];
    if (branchId) { invoiceScopeParams.push(branchId); invoiceScopeWhere.push(`branch_id = $${invoiceScopeParams.length}`); }
    const purchaseScopeParams: unknown[] = [t.companyId];
    const purchaseScopeWhere = [`company_id = $1`, `status != 'cancelled'`];
    if (branchId) { purchaseScopeParams.push(branchId); purchaseScopeWhere.push(`branch_id = $${purchaseScopeParams.length}`); }

    const ledger = ledgerFilters(t.companyId, q);
    const ledgerWhere = ledger.where.join(' AND ');

    const [
      categories,
      salesKpi,
      returnsKpi,
      collectionsKpi,
      purchasesKpi,
      expensesKpi,
      accountingKpi,
      inventoryKpi,
      receivablesKpi,
      overdueKpi,
      cashKpi,
      previousSales,
      salesTrend,
      productStats,
      slowMoving,
      returnedProducts,
      writtenOffProducts,
      lowStockProducts,
      outOfStockProducts,
      recentWriteOffs,
      topOverdueCustomers,
      upcomingReceivables,
      topSupplierPayables,
      upcomingPayables,
      health,
      settings,
    ] = await Promise.all([
      categoryRows(t.db, t.companyId),
      t.db.query(
        `SELECT COALESCE(SUM(item.quantity * item.unit_price),0) AS total_sales,
                COALESCE(SUM(item.quantity),0) AS quantity_sold
         FROM invoice_items item
         JOIN invoices i ON i.id = item.invoice_id AND i.company_id = item.company_id
         LEFT JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         WHERE ${salesWhere}`,
        salesFilter.params,
      ),
      t.db.query(
        `SELECT COALESCE(SUM(item.line_total),0) AS total_returns,
                COALESCE(SUM(item.quantity),0) AS returned_quantity
         FROM credit_note_items item
         JOIN credit_notes cn ON cn.id = item.credit_note_id AND cn.company_id = item.company_id
         LEFT JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         WHERE ${returnsWhere}`,
        returnsFilter.params,
      ),
      t.db.query(
        `SELECT COALESCE(SUM(p.amount),0) AS total_collections
         FROM payments p
         WHERE ${collectionWhere.join(' AND ')}`,
        collectionParams,
      ),
      t.db.query(
        `SELECT COALESCE(SUM(item.quantity * item.unit_cost),0) AS total_purchases
         FROM purchase_invoice_items item
         JOIN purchase_invoices pi ON pi.id = item.purchase_invoice_id AND pi.company_id = item.company_id
         LEFT JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         WHERE ${purchasesWhere}`,
        purchasesFilter.params,
      ),
      t.db.query(
        `SELECT COALESCE(SUM(py.amount),0) AS total_expenses FROM payouts py WHERE ${payoutWhere.join(' AND ')}`,
        payoutParams,
      ),
      t.db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN ca.type = 'revenue' THEN jel.credit - jel.debit ELSE 0 END),0) AS revenue,
           COALESCE(SUM(CASE WHEN ca.type = 'expense' THEN jel.debit - jel.credit ELSE 0 END),0) AS expenses,
           COALESCE(SUM(CASE WHEN ca.id = aset.sales_vat_account_id THEN jel.credit - jel.debit ELSE 0 END),0) AS output_vat,
           COALESCE(SUM(CASE WHEN ca.id = aset.purchase_vat_account_id THEN jel.debit - jel.credit ELSE 0 END),0) AS input_vat
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.company_id = jel.company_id
         JOIN chart_accounts ca ON ca.id = jel.account_id AND ca.company_id = jel.company_id
         LEFT JOIN accounting_settings aset ON aset.company_id = jel.company_id
         WHERE ${ledgerWhere}`,
        ledger.params,
      ),
      t.db.query(
        `SELECT COALESCE(SUM(CASE WHEN product_type = 'stock' THEN inventory_value ELSE 0 END),0) AS inventory_value,
                COUNT(*) FILTER (WHERE product_type = 'stock' AND quantity <= alert_level)::int AS low_stock_items,
                COUNT(*) FILTER (WHERE product_type = 'stock' AND quantity <= 0)::int AS out_of_stock_items
         FROM products
         WHERE company_id = $1`,
        [t.companyId],
      ),
      t.db.query(
        `SELECT COALESCE(SUM(remaining),0) AS outstanding_receivables
         FROM invoices WHERE ${invoiceScopeWhere.join(' AND ')}`,
        invoiceScopeParams,
      ),
      t.db.query(
        `SELECT COUNT(*)::int AS overdue_invoices
         FROM invoices
         WHERE ${invoiceScopeWhere.join(' AND ')} AND remaining > 0 AND due_date IS NOT NULL AND due_date < now()`,
        invoiceScopeParams,
      ),
      t.db.query(
        `SELECT COALESCE(SUM(balance),0) AS cash_bank_balance
         FROM accounts WHERE company_id = $1 AND is_active = TRUE AND type IN ('cash','bank','wallet')`,
        [t.companyId],
      ),
      previousSalesFilter ? t.db.query(
        `SELECT COALESCE(SUM(item.quantity * item.unit_price),0) AS total_sales
         FROM invoice_items item
         JOIN invoices i ON i.id = item.invoice_id AND i.company_id = item.company_id
         LEFT JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         WHERE ${previousSalesFilter.where.join(' AND ')}`,
        previousSalesFilter.params,
      ) : Promise.resolve({ rows: [{ total_sales: 0 }] }),
      t.db.query(
        `SELECT to_char(i.issue_date::date, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(item.quantity * item.unit_price),0) AS sales
         FROM invoice_items item
         JOIN invoices i ON i.id = item.invoice_id AND i.company_id = item.company_id
         LEFT JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         WHERE ${salesWhere}
         GROUP BY i.issue_date::date
         ORDER BY i.issue_date::date ASC
         LIMIT 370`,
        salesFilter.params,
      ),
      t.db.query(
        `WITH sales AS (
           SELECT p.id, p.name, p.sku, p.barcode, p.quantity AS current_stock, p.alert_level,
                  CASE WHEN pc.parent_id IS NULL THEN pc.name ELSE parent_pc.name END AS category_name,
                  CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.name END AS subcategory_name,
                  COALESCE(SUM(item.quantity),0) AS quantity_sold,
                  COALESCE(SUM(item.quantity * item.unit_price),0) AS gross_sales,
                  COALESCE(SUM(item.quantity * COALESCE(NULLIF(p.average_cost,0), p.cost, 0)),0) AS cogs_amount
           FROM invoice_items item
           JOIN invoices i ON i.id = item.invoice_id AND i.company_id = item.company_id
           JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
           LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
           LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
           WHERE ${salesWhere}
           GROUP BY p.id, p.name, p.sku, p.barcode, p.quantity, p.alert_level, pc.parent_id, pc.name, parent_pc.name
         ),
         returns AS (
           SELECT item.product_id,
                  COALESCE(SUM(item.quantity),0) AS quantity_returned,
                  COALESCE(SUM(item.line_total),0) AS sales_returns
           FROM credit_note_items item
           JOIN credit_notes cn ON cn.id = item.credit_note_id AND cn.company_id = item.company_id
           WHERE cn.company_id = $1 AND cn.status = 'posted'
           GROUP BY item.product_id
         )
         SELECT sales.*,
                COALESCE(returns.quantity_returned,0) AS quantity_returned,
                COALESCE(returns.sales_returns,0) AS sales_returns,
                sales.quantity_sold - COALESCE(returns.quantity_returned,0) AS net_quantity_sold,
                sales.gross_sales - COALESCE(returns.sales_returns,0) AS sales_amount,
                sales.gross_sales - COALESCE(returns.sales_returns,0) AS net_sales,
                sales.gross_sales - COALESCE(returns.sales_returns,0) - cogs_amount AS gross_profit,
                CASE WHEN (sales.gross_sales - COALESCE(returns.sales_returns,0)) > 0
                  THEN ROUND(((sales.gross_sales - COALESCE(returns.sales_returns,0) - cogs_amount) / (sales.gross_sales - COALESCE(returns.sales_returns,0))) * 100, 2)
                  ELSE 0
                END AS margin_pct
         FROM sales
         LEFT JOIN returns ON returns.product_id = sales.id`,
        salesFilter.params,
      ),
      t.db.query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.quantity AS current_stock,
                COALESCE(NULLIF(p.inventory_value,0), p.quantity * COALESCE(NULLIF(p.average_cost,0), p.cost, 0)) AS inventory_value,
                CASE WHEN pc.parent_id IS NULL THEN pc.name ELSE parent_pc.name END AS category_name,
                CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.name END AS subcategory_name,
                MAX(i.issue_date) AS last_sale_at,
                COALESCE(SUM(item.quantity),0) AS quantity_sold
         FROM products p
         LEFT JOIN invoice_items item ON item.product_id = p.id AND item.company_id = p.company_id
         LEFT JOIN invoices i ON i.id = item.invoice_id AND i.company_id = item.company_id AND i.status NOT IN ('draft','cancelled')
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
         WHERE p.company_id = $1 AND p.product_type = 'stock'
         GROUP BY p.id, p.name, p.sku, p.barcode, p.quantity, p.inventory_value, p.average_cost, p.cost, pc.parent_id, pc.name, parent_pc.name
         ORDER BY MAX(i.issue_date) ASC NULLS FIRST, p.quantity DESC
         LIMIT 10`,
        [t.companyId],
      ),
      t.db.query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.quantity AS current_stock,
                CASE WHEN pc.parent_id IS NULL THEN pc.name ELSE parent_pc.name END AS category_name,
                CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.name END AS subcategory_name,
                COALESCE(SUM(item.quantity),0) AS returned_quantity,
                COALESCE(SUM(item.line_total),0) AS returned_amount
         FROM credit_note_items item
         JOIN credit_notes cn ON cn.id = item.credit_note_id AND cn.company_id = item.company_id
         JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
         WHERE ${returnsWhere}
         GROUP BY p.id, p.name, p.sku, p.barcode, p.quantity, pc.parent_id, pc.name, parent_pc.name
         ORDER BY returned_quantity DESC, returned_amount DESC
         LIMIT 10`,
        returnsFilter.params,
      ),
      t.db.query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.quantity AS current_stock,
                CASE WHEN pc.parent_id IS NULL THEN pc.name ELSE parent_pc.name END AS category_name,
                CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.name END AS subcategory_name,
                COALESCE(SUM(item.quantity),0) AS written_off_quantity,
                COALESCE(SUM(item.total_cost),0) AS written_off_amount
         FROM inventory_write_off_items item
         JOIN inventory_write_offs iwo ON iwo.id = item.write_off_id AND iwo.company_id = item.company_id
         JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
         WHERE iwo.company_id = $1 AND iwo.status = 'posted'
         GROUP BY p.id, p.name, p.sku, p.barcode, p.quantity, pc.parent_id, pc.name, parent_pc.name
         ORDER BY written_off_amount DESC, written_off_quantity DESC
         LIMIT 10`,
        [t.companyId],
      ),
      t.db.query(`SELECT id, name, sku, barcode, quantity AS current_stock, alert_level FROM products WHERE company_id = $1 AND product_type = 'stock' AND quantity <= alert_level ORDER BY quantity ASC, name LIMIT 10`, [t.companyId]),
      t.db.query(`SELECT id, name, sku, barcode, quantity AS current_stock, alert_level FROM products WHERE company_id = $1 AND product_type = 'stock' AND quantity <= 0 ORDER BY name LIMIT 10`, [t.companyId]),
      t.db.query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.quantity AS current_stock, item.quantity AS written_off_quantity, item.total_cost AS written_off_amount, iwo.write_off_date
         FROM inventory_write_off_items item
         JOIN inventory_write_offs iwo ON iwo.id = item.write_off_id AND iwo.company_id = item.company_id
         JOIN products p ON p.id = item.product_id AND p.company_id = item.company_id
         WHERE iwo.company_id = $1 AND iwo.status = 'posted'
         ORDER BY iwo.write_off_date DESC, iwo.created_at DESC
         LIMIT 10`,
        [t.companyId],
      ),
      t.db.query(
        `SELECT c.id, c.name, COUNT(i.id)::int AS invoice_count, COALESCE(SUM(i.remaining),0) AS overdue_amount, MIN(i.due_date) AS oldest_due_date
         FROM invoices i JOIN clients c ON c.id = i.client_id
         WHERE i.${invoiceScopeWhere.join(' AND i.')} AND i.remaining > 0 AND i.due_date < now()
         GROUP BY c.id, c.name ORDER BY overdue_amount DESC LIMIT 10`,
        invoiceScopeParams,
      ),
      t.db.query(
        `SELECT i.id, i.number, i.due_date, i.remaining, c.name AS customer_name
         FROM invoices i JOIN clients c ON c.id = i.client_id
         WHERE i.${invoiceScopeWhere.join(' AND i.')} AND i.remaining > 0 AND i.due_date >= now()
         ORDER BY i.due_date ASC LIMIT 10`,
        invoiceScopeParams,
      ),
      t.db.query(
        `SELECT s.id, s.name, COUNT(pi.id)::int AS invoice_count, COALESCE(SUM(pi.remaining),0) AS payable_amount, MIN(pi.due_date) AS oldest_due_date
         FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pi.${purchaseScopeWhere.join(' AND pi.')} AND pi.remaining > 0
         GROUP BY s.id, s.name ORDER BY payable_amount DESC LIMIT 10`,
        purchaseScopeParams,
      ),
      t.db.query(
        `SELECT pi.id, pi.number, pi.due_date, pi.remaining, s.name AS supplier_name
         FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pi.${purchaseScopeWhere.join(' AND pi.')} AND pi.remaining > 0 AND pi.due_date >= now()
         ORDER BY pi.due_date ASC LIMIT 10`,
        purchaseScopeParams,
      ),
      t.db.query(
        `SELECT
          (SELECT COUNT(*)::int FROM journal_entries WHERE company_id = $1 AND status = 'draft') AS draft_journals,
          (SELECT COUNT(*)::int FROM (
            SELECT je.id FROM journal_entries je
            LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
            WHERE je.company_id = $1 AND je.status = 'posted'
            GROUP BY je.id HAVING ROUND(COALESCE(SUM(jel.debit),0) - COALESCE(SUM(jel.credit),0), 2) <> 0
          ) x) AS unbalanced_journals,
          (SELECT COUNT(*)::int FROM invoices WHERE company_id = $1 AND status != 'cancelled' AND journal_entry_id IS NULL) AS unposted_invoices,
          (SELECT COUNT(*)::int FROM payments WHERE company_id = $1 AND journal_entry_id IS NULL) AS unposted_payments,
          (SELECT COUNT(*)::int FROM purchase_invoices WHERE company_id = $1 AND status != 'cancelled' AND journal_entry_id IS NULL) AS unposted_purchases,
          (SELECT COUNT(*)::int FROM accounting_periods WHERE company_id = $1 AND is_locked = FALSE) AS open_periods,
          (SELECT COUNT(*)::int FROM accounting_periods WHERE company_id = $1 AND is_locked = TRUE) AS locked_periods`,
        [t.companyId],
      ),
      t.db.query(`SELECT * FROM accounting_settings WHERE company_id = $1`, [t.companyId]),
    ]);

    const productRows = productStats.rows.map((row: any) => ({
      ...row,
      sales_amount: money(row.sales_amount),
      gross_profit: money(row.gross_profit),
      margin_pct: Number(row.margin_pct ?? 0),
      quantity_sold: Number(row.quantity_sold ?? 0),
      current_stock: Number(row.current_stock ?? 0),
    }));
    const byRevenue = [...productRows].sort((a, b) => toNumber(b.sales_amount) - toNumber(a.sales_amount)).slice(0, 10);
    const byQuantity = [...productRows].sort((a, b) => toNumber(b.quantity_sold) - toNumber(a.quantity_sold)).slice(0, 10);
    const byProfit = [...productRows].sort((a, b) => toNumber(b.gross_profit) - toNumber(a.gross_profit)).slice(0, 10);
    const lowStockBestSellers = productRows
      .filter((row) => toNumber(row.current_stock) <= toNumber(row.alert_level))
      .sort((a, b) => toNumber(b.quantity_sold) - toNumber(a.quantity_sold))
      .slice(0, 10);

    const totalSales = toNumber(salesKpi.rows[0]?.total_sales);
    const totalReturns = toNumber(returnsKpi.rows[0]?.total_returns);
    const netSales = totalSales - totalReturns;
    const previousSalesValue = toNumber(previousSales.rows[0]?.total_sales);
    const change = previousSalesValue > 0 ? ((totalSales - previousSalesValue) / previousSalesValue) * 100 : 0;
    const accounting = accountingKpi.rows[0] ?? {};
    const settingsRow = settings.rows[0] ?? {};
    const missingSettings = requiredAccountingSettings.filter((key) => !settingsRow[key]);

    res.json({
      data: {
        filters: { from, to, previousFrom, previousTo, categories },
        kpis: {
          totalSales: money(totalSales),
          netSales: money(netSales),
          totalCollections: money(collectionsKpi.rows[0]?.total_collections),
          outstandingReceivables: money(receivablesKpi.rows[0]?.outstanding_receivables),
          totalPurchases: money(purchasesKpi.rows[0]?.total_purchases),
          totalExpenses: money(expensesKpi.rows[0]?.total_expenses),
          netProfit: money(toNumber(accounting.revenue) - toNumber(accounting.expenses)),
          inventoryValue: money(inventoryKpi.rows[0]?.inventory_value),
          vatPayable: money(toNumber(accounting.output_vat) - toNumber(accounting.input_vat)),
          overdueInvoices: Number(overdueKpi.rows[0]?.overdue_invoices ?? 0),
          lowStockItems: Number(inventoryKpi.rows[0]?.low_stock_items ?? 0),
          outOfStockItems: Number(inventoryKpi.rows[0]?.out_of_stock_items ?? 0),
          cashBankBalance: money(cashKpi.rows[0]?.cash_bank_balance),
          salesChangePct: Number(change.toFixed(2)),
        },
        salesTrend: salesTrend.rows.map((row: any) => ({ date: row.date, sales: money(row.sales) })),
        topProductsByRevenue: byRevenue,
        topProductsByQuantity: byQuantity,
        topProductsByProfit: byProfit,
        lowStockBestSellers,
        slowMovingProducts: slowMoving.rows,
        mostReturnedProducts: returnedProducts.rows,
        mostWrittenOffProducts: writtenOffProducts.rows,
        inventoryAlerts: {
          lowStockProducts: lowStockProducts.rows,
          outOfStockProducts: outOfStockProducts.rows,
          overstockSlowMovingProducts: slowMoving.rows.filter((row: any) => toNumber(row.current_stock) > 0).slice(0, 10),
          highValueSlowMovingProducts: slowMoving.rows.filter((row: any) => toNumber(row.current_stock) > 0 && toNumber(row.inventory_value) >= 10000).slice(0, 10),
          productsWithRecentWriteOffs: recentWriteOffs.rows,
          productsWithHighReturnRate: returnedProducts.rows.slice(0, 10),
        },
        receivables: {
          topOverdueCustomers: topOverdueCustomers.rows,
          upcomingReceivables: upcomingReceivables.rows,
        },
        payables: {
          topSupplierPayables: topSupplierPayables.rows,
          upcomingSupplierPayments: upcomingPayables.rows,
        },
        accountingHealth: {
          ...health.rows[0],
          incomplete_settings_count: missingSettings.length,
          missing_settings: missingSettings,
        },
      },
    });
  } catch (e) { next(e); }
});

export default router;
