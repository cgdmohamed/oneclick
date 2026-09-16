import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { parsePagination } from '../../utils/pagination.js';
import { round2, lte2 } from '../../utils/money.js';
import { assertPeriodOpen, postCustomerPayment, recomputeInvoiceBalance, reverseJournalEntry } from '../accounting/posting.js';
import { assertBranch } from '../../utils/dimensions.js';

const router = Router();

const createSchema = z.object({
  collection_type: z.enum(['invoice_collection', 'general_receipt']).default('invoice_collection'),
  invoice_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  account_id: z.string().uuid(),
  credit_account_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  paid_at: z.string().datetime().optional(),
  branch_id: z.string().uuid().optional().nullable(),
  method: z.string().default('cash'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : null;

    if (clientId) {
      const totalQ = await t.db.query(
        `SELECT count(p.*)::int AS count
         FROM payments p
         LEFT JOIN invoices i ON i.id = p.invoice_id
         WHERE p.company_id = $1 AND COALESCE(p.client_id, i.client_id) = $2`,
        [t.companyId, clientId],
      );
      const a = p.applyTo(
        `SELECT p.*, i.number AS invoice_number, a.name AS account_name, ca.name AS credit_account_name
         FROM payments p
         LEFT JOIN invoices i ON i.id = p.invoice_id
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN chart_accounts ca ON ca.id = p.credit_account_id
         WHERE p.company_id = $1 AND COALESCE(p.client_id, i.client_id) = $2
         ORDER BY p.paid_at DESC`,
        [t.companyId, clientId],
      );
      const rs = await t.db.query(a.sql, a.params);
      return res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
    }

    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM payments WHERE company_id = $1`, [t.companyId]);
    const a = p.applyTo(`
      SELECT p.*, i.number AS invoice_number, a.name AS account_name, ca.name AS credit_account_name
      FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      JOIN accounts a ON a.id = p.account_id
      LEFT JOIN chart_accounts ca ON ca.id = p.credit_account_id
      WHERE p.company_id = $1
      ORDER BY p.paid_at DESC
    `, [t.companyId]);
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);
    const paidAt = body.paid_at ?? new Date().toISOString();
    await assertPeriodOpen(t.db, t.companyId, paidAt);
    await assertBranch(t.db, t.companyId, body.branch_id);

    const account = await t.db.query(`SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [body.account_id, t.companyId]);
    if (!account.rowCount) throw badRequest('Active payment account not found');
    const amount = round2(body.amount);
    if (body.collection_type === 'invoice_collection' && !body.invoice_id) throw badRequest('Invoice is required for invoice collection');
    if (body.collection_type === 'general_receipt' && !body.credit_account_id) throw badRequest('Credit account is required for general receipt');
    if (body.client_id) {
      const client = await t.db.query(`SELECT 1 FROM clients WHERE id = $1 AND company_id = $2`, [body.client_id, t.companyId]);
      if (!client.rowCount) throw badRequest('Client not found');
    }
    if (body.credit_account_id) {
      const credit = await t.db.query(`SELECT 1 FROM chart_accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [body.credit_account_id, t.companyId]);
      if (!credit.rowCount) throw badRequest('Active credit account not found');
    }

    await t.db.query('BEGIN');
    try {
      let invoiceClientId: string | null = null;
      if (body.collection_type === 'invoice_collection') {
        const inv = await t.db.query(`SELECT total, paid, client_id FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`, [body.invoice_id, t.companyId]);
        if (!inv.rowCount) throw notFound('Invoice not found');
        const total = round2(Number(inv.rows[0].total));
        const alreadyPaid = round2(Number(inv.rows[0].paid));
        if (!lte2(alreadyPaid + amount, total)) throw badRequest('Payment exceeds remaining amount');
        invoiceClientId = inv.rows[0].client_id;
      }

      const payRes = await t.db.query(`
        INSERT INTO payments (company_id, invoice_id, client_id, collection_type, credit_account_id, account_id, amount, paid_at, method, reference, notes, branch_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
      `, [t.companyId, body.invoice_id ?? null, body.collection_type === 'invoice_collection' ? invoiceClientId : body.client_id ?? null,
          body.collection_type, body.collection_type === 'general_receipt' ? body.credit_account_id : null, body.account_id, amount,
          paidAt, body.method, body.reference ?? null, body.notes ?? null, body.branch_id ?? null, req.auth!.userId]);

      if (body.collection_type === 'invoice_collection' && body.invoice_id) {
        await recomputeInvoiceBalance(t.db, t.companyId, body.invoice_id);
      }

      await t.db.query(
        `UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND company_id = $3`,
        [amount, body.account_id, t.companyId],
      );
      await postCustomerPayment(t.db, t.companyId, payRes.rows[0].id, req.auth!.userId);

      await audit(t.db, {
        companyId: t.companyId, userId: req.auth!.userId,
        action: 'payment.create', entity: 'payment', entityId: payRes.rows[0].id,
        data: { invoice_id: body.invoice_id ?? null, collection_type: body.collection_type, amount, account_id: body.account_id, method: body.method },
      });
      await t.db.query('COMMIT');
      res.status(201).json({ data: payRes.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const p = await t.db.query(`SELECT * FROM payments WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!p.rowCount) throw notFound();
      const pay = p.rows[0];
      await assertPeriodOpen(t.db, t.companyId, pay.paid_at);

      // Every payment is posted synchronously on creation, so a payment
      // almost always has a journal_entry_id — reverse it (a new offsetting
      // entry, not a silent delete of the original) rather than refusing to
      // let a mistaken payment ever be corrected.
      if (pay.journal_entry_id) {
        await reverseJournalEntry(t.db, t.companyId, pay.journal_entry_id, req.auth!.userId);
      }

      await t.db.query(`DELETE FROM payments WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      await t.db.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND company_id = $3`, [pay.amount, pay.account_id, t.companyId]);
      if (pay.invoice_id) await recomputeInvoiceBalance(t.db, t.companyId, pay.invoice_id);

      await audit(t.db, {
        companyId: t.companyId, userId: req.auth!.userId,
        action: 'payment.delete', entity: 'payment', entityId: req.params.id,
        data: { invoice_id: pay.invoice_id ?? null, amount: pay.amount, account_id: pay.account_id },
      });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default router;
