import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { parsePagination } from '../../utils/pagination.js';
import { round2, lte2 } from '../../utils/money.js';

const router = Router();

const createSchema = z.object({
  invoice_id: z.string().uuid(),
  account_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paid_at: z.string().datetime().optional(),
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
      // Filter payments by client via the invoices join
      const totalQ = await t.db.query(
        `SELECT count(p.*)::int AS count
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         WHERE p.company_id = $1 AND i.client_id = $2`,
        [t.companyId, clientId],
      );
      const a = p.applyTo(
        `SELECT p.*, i.number AS invoice_number, a.name AS account_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN accounts a ON a.id = p.account_id
         WHERE p.company_id = $1 AND i.client_id = $2
         ORDER BY p.paid_at DESC`,
        [t.companyId, clientId],
      );
      const rs = await t.db.query(a.sql, a.params);
      return res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
    }

    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM payments WHERE company_id = $1`, [t.companyId]);
    const a = p.applyTo(`
      SELECT p.*, i.number AS invoice_number, a.name AS account_name
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      JOIN accounts a ON a.id = p.account_id
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

    const inv = await t.db.query(`SELECT total, paid FROM invoices WHERE id = $1 FOR UPDATE`, [body.invoice_id]);
    if (!inv.rowCount) throw notFound('Invoice not found');
    const total = round2(Number(inv.rows[0].total));
    const alreadyPaid = round2(Number(inv.rows[0].paid));
    const amount = round2(body.amount);
    if (!lte2(alreadyPaid + amount, total)) throw badRequest('Payment exceeds remaining amount');

    const payRes = await t.db.query(`
      INSERT INTO payments (company_id, invoice_id, account_id, amount, paid_at, method, reference, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [t.companyId, body.invoice_id, body.account_id, amount,
        body.paid_at ?? new Date(), body.method, body.reference ?? null, body.notes ?? null, req.auth!.userId]);

    const newPaid = round2(alreadyPaid + amount);
    const remaining = round2(Math.max(0, total - newPaid));
    const status = remaining <= 0.005 ? 'paid' : 'partial';
    await t.db.query(
      `UPDATE invoices SET paid = $1, remaining = $2, status = $3 WHERE id = $4`,
      [newPaid, remaining, status, body.invoice_id],
    );

    await t.db.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id = $2`,
      [amount, body.account_id],
    );

    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'payment.create', entity: 'payment', entityId: payRes.rows[0].id,
      data: { invoice_id: body.invoice_id, amount, account_id: body.account_id, method: body.method },
    });
    res.status(201).json({ data: payRes.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = await t.db.query(`SELECT * FROM payments WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
    if (!p.rowCount) throw notFound();
    const pay = p.rows[0];
    await t.db.query(`DELETE FROM payments WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    await t.db.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [pay.amount, pay.account_id]);
    const sums = await t.db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoice_id = $1`, [pay.invoice_id]);
    const inv = await t.db.query(`SELECT total FROM invoices WHERE id = $1`, [pay.invoice_id]);
    const total = Number(inv.rows[0].total);
    const paid = Number(sums.rows[0].s);
    const remaining = Math.max(0, total - paid);
    const status = paid <= 0.0001 ? 'sent' : remaining <= 0.0001 ? 'paid' : 'partial';
    await t.db.query(`UPDATE invoices SET paid=$1, remaining=$2, status=$3 WHERE id=$4`, [paid, remaining, status, pay.invoice_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
