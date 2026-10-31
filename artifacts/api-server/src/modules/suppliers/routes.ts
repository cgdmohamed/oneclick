import { Router } from 'express';
import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';
import { ensureAccountingSetup, ensurePartySubAccount, getSettings } from '../accounting/posting.js';

const schema = z.object({
  name:       z.string().min(1),
  phone:      z.string().optional().nullable(),
  email:      z.string().email().optional().nullable(),
  address:    z.string().optional().nullable(),
  tax_number: z.string().regex(/^\d*$/, 'Tax number must contain digits only').optional().nullable(),
  notes:      z.string().optional().nullable(),
  is_active:  z.boolean().optional().default(true),
});

const base = crudRouter({
  table:       'suppliers',
  fields:      ['name', 'phone', 'email', 'address', 'tax_number', 'notes', 'is_active'],
  schema,
  patchSchema: schema.partial(),
  list:        { orderBy: 'name ASC', searchable: ['name', 'phone', 'email'] },
});

const r = Router();

/** GET /api/suppliers/:id/statement */
r.get('/:id/statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const { id } = req.params;

    const supplierRs = await t.db.query(
      `SELECT * FROM suppliers WHERE id = $1 AND company_id = $2`,
      [id, t.companyId],
    );
    if (!supplierRs.rowCount) return res.status(404).json({ error: 'not_found' });
    const supplier = supplierRs.rows[0];

    const productsRs = await t.db.query(
      `SELECT p.id, p.name, p.sku, p.price, p.quantity, p.unit
       FROM products p
       WHERE p.supplier_id = $1 AND p.company_id = $2
       ORDER BY p.name ASC`,
      [id, t.companyId],
    );

    const payoutsRs = await t.db.query(
      `SELECT py.id, py.amount, py.method, py.paid_at, py.reference, py.notes,
              a.name AS account_name,
              ec.name AS category_name,
              'payout' AS source,
              NULL::text AS purchase_invoice_number
       FROM payouts py
       LEFT JOIN accounts a ON a.id = py.account_id
       LEFT JOIN expense_categories ec ON ec.id = py.expense_category_id
       WHERE py.supplier_id = $1 AND py.company_id = $2
       ORDER BY py.paid_at DESC`,
      [id, t.companyId],
    );

    // Real "pay a purchase invoice" payments land in supplier_payments, a
    // table entirely separate from payouts — without this query they were
    // completely invisible on the supplier statement even though they
    // correctly decrement purchase_invoices.remaining.
    const supplierPaymentsRs = await t.db.query(
      `SELECT sp.id, sp.amount, sp.method, sp.paid_at, sp.reference, sp.notes,
              a.name AS account_name,
              NULL::text AS category_name,
              'supplier_payment' AS source,
              pi.number AS purchase_invoice_number
       FROM supplier_payments sp
       LEFT JOIN accounts a ON a.id = sp.account_id
       LEFT JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id
       WHERE sp.supplier_id = $1 AND sp.company_id = $2
       ORDER BY sp.paid_at DESC`,
      [id, t.companyId],
    );

    const payments = [...payoutsRs.rows, ...supplierPaymentsRs.rows].sort(
      (a: { paid_at: string }, b: { paid_at: string }) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime(),
    );

    // Purchase invoices — without these the statement only ever showed money
    // paid out, never what was owed in the first place, so it could never
    // show a real outstanding balance for the supplier (unlike the client
    // statement, which already includes sales invoices). Draft/cancelled
    // invoices are excluded — they haven't posted to the ledger yet (or no
    // longer count), so they must not inflate the outstanding balance, same
    // as the client unified-statement's invoice filter.
    const invoicesRs = await t.db.query(
      `SELECT pi.id, pi.number, pi.invoice_date, pi.total, pi.paid, pi.remaining, pi.status
       FROM purchase_invoices pi
       WHERE pi.supplier_id = $1 AND pi.company_id = $2 AND pi.status NOT IN ('draft', 'cancelled')
       ORDER BY pi.invoice_date DESC`,
      [id, t.companyId],
    );

    // Purchase returns are already netted into purchase_invoices.remaining
    // (so outstanding_balance above is numerically correct), but weren't
    // shown anywhere as their own line — the balance would drop with no
    // visible reason why. Only posted returns count, matching the invoice
    // filter above.
    const returnsRs = await t.db.query(
      `SELECT pr.id, pr.return_number, pr.return_date, pr.subtotal, pr.vat_amount, pr.total, pr.status,
              pi.number AS purchase_invoice_number
       FROM purchase_returns pr
       LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_invoice_id
       WHERE pr.supplier_id = $1 AND pr.company_id = $2 AND pr.status = 'posted'
       ORDER BY pr.return_date DESC`,
      [id, t.companyId],
    );

    const totalPurchases = invoicesRs.rows.reduce((sum: number, i: { total: string }) => sum + parseFloat(i.total || '0'), 0);
    const totalPayouts = payments.reduce((sum: number, p: { amount: string }) => sum + parseFloat(p.amount || '0'), 0);
    const outstanding = invoicesRs.rows.reduce((sum: number, i: { remaining: string }) => sum + parseFloat(i.remaining || '0'), 0);
    const lastPayout = payments[0]?.paid_at ?? null;

    res.json({
      data: {
        supplier,
        products:         productsRs.rows,
        invoices:         invoicesRs.rows,
        purchase_returns: returnsRs.rows,
        payouts:          payoutsRs.rows,
        supplier_payments: supplierPaymentsRs.rows,
        payments,
        total_purchases:  totalPurchases.toFixed(2),
        total_payouts:    totalPayouts.toFixed(2),
        outstanding_balance: outstanding.toFixed(2),
        last_payout:      lastPayout,
      },
    });
  } catch (e) { next(e); }
});

// Overrides crudRouter's generic POST / so a real sub-account under
// "الموردون" (2100) can be created right after the supplier row, same
// reasoning as ensurePartySubAccount's own doc comment in posting.ts.
// Registered before `r.use('/', base)` below, so Express matches this
// instead of the generic handler for POST /.
r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.parse(req.body);
    const rs = await t.db.query(
      `INSERT INTO suppliers (company_id, name, phone, email, address, tax_number, notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [t.companyId, body.name, body.phone ?? null, body.email ?? null, body.address ?? null, body.tax_number ?? null, body.notes ?? null, body.is_active],
    );
    await ensureAccountingSetup(t.db, t.companyId);
    const settings = await getSettings(t.db, t.companyId);
    const chartAccountId = await ensurePartySubAccount(t.db, t.companyId, settings.accounts_payable_account_id, rs.rows[0].name);
    if (chartAccountId) {
      await t.db.query(`UPDATE suppliers SET chart_account_id = $1 WHERE id = $2`, [chartAccountId, rs.rows[0].id]);
      rs.rows[0].chart_account_id = chartAccountId;
    }
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

// Overrides crudRouter's generic PATCH /:id so a rename also keeps the
// supplier's linked chart_accounts sub-account name in sync — otherwise it
// goes stale and the supplier shows under its old name in the chart of
// accounts/ledger reports after being renamed here.
r.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.partial().parse(req.body);
    const keys = (['name', 'phone', 'email', 'address', 'tax_number', 'notes', 'is_active'] as const).filter((f) => f in body);
    if (!keys.length) return res.json({ data: null });
    const values = keys.map((f) => (body as Record<string, unknown>)[f]);
    const set = keys.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const rs = await t.db.query(
      `UPDATE suppliers SET ${set} WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, ...values],
    );
    if (!rs.rowCount) return res.status(404).json({ error: 'not_found' });
    if ('name' in body && rs.rows[0].chart_account_id) {
      await t.db.query(`UPDATE chart_accounts SET name = $1 WHERE id = $2 AND company_id = $3`, [body.name, rs.rows[0].chart_account_id, t.companyId]);
    }
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.use('/', base);
export default r;
