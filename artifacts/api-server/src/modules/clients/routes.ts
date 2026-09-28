import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { badRequest, notFound } from '../../utils/errors.js';

const r = Router();

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  // Optional link to a supplier record representing the same real-world
  // party (e.g. a wholesaler who is both a customer and a vendor), so a
  // combined statement can show one net balance for them. Does not affect
  // how invoices/purchase invoices post — AR and AP stay separate accounts.
  linked_supplier_id: z.string().uuid().optional().nullable(),
});

const FIELDS = ['name', 'email', 'phone', 'whatsapp', 'tax_number', 'address', 'notes', 'currency', 'linked_supplier_id'] as const;

async function assertLinkedSupplier(db: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }, companyId: string, supplierId?: string | null) {
  if (!supplierId) return;
  const rs = await db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [supplierId, companyId]);
  if (!rs.rowCount) throw badRequest('Invalid supplier link');
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM clients WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT * FROM clients WHERE company_id = $1 ORDER BY created_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0]?.count ?? 0)));
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT * FROM clients WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

/**
 * Combined statement for a client that is also linked to a supplier record
 * (same real-world party on both sides). Merges sales invoices/collections
 * with purchase invoices/payouts chronologically and computes a running net
 * balance (positive = the party owes the company; negative = the company
 * owes the party). Purely additive reporting — no journal entries are
 * created or changed, and AR/AP ledger accounts remain untouched.
 */
r.get('/:id/unified-statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const clientRs = await t.db.query(
      `SELECT id, name, linked_supplier_id FROM clients WHERE id = $1 AND company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!clientRs.rowCount) throw notFound();
    const client = clientRs.rows[0] as { id: string; name: string; linked_supplier_id: string | null };

    let supplierName: string | null = null;
    if (client.linked_supplier_id) {
      const supRs = await t.db.query(`SELECT name FROM suppliers WHERE id = $1 AND company_id = $2`, [client.linked_supplier_id, t.companyId]);
      supplierName = supRs.rows[0]?.name ?? null;
    }

    const rs = await t.db.query(
      `SELECT date, type, reference, amount, delta FROM (
         SELECT i.issue_date AS date, 'sales_invoice' AS type, i.number AS reference,
                i.total AS amount, i.total AS delta
         FROM invoices i
         WHERE i.client_id = $1 AND i.status NOT IN ('draft','cancelled')
         UNION ALL
         SELECT pay.paid_at, 'collection', COALESCE(inv.number, ''), pay.amount, -pay.amount
         FROM payments pay
         JOIN invoices inv ON inv.id = pay.invoice_id
         WHERE inv.client_id = $1
         UNION ALL
         SELECT pi.invoice_date, 'purchase_invoice', pi.number, pi.total, -pi.total
         FROM purchase_invoices pi
         WHERE $2::uuid IS NOT NULL AND pi.supplier_id = $2 AND pi.status NOT IN ('draft','cancelled')
         UNION ALL
         SELECT po.paid_at, 'payout', COALESCE(po.reference, ''), po.amount, po.amount
         FROM payouts po
         WHERE $2::uuid IS NOT NULL AND po.supplier_id = $2
       ) rows
       ORDER BY date ASC, type ASC`,
      [client.id, client.linked_supplier_id],
    );

    let running = 0;
    const lines = rs.rows.map((row) => {
      running += Number(row.delta);
      return {
        date: row.date,
        type: row.type as 'sales_invoice' | 'collection' | 'purchase_invoice' | 'payout',
        reference: row.reference,
        amount: Number(row.amount),
        delta: Number(row.delta),
        running_balance: running,
      };
    });

    res.json({
      data: {
        client: { id: client.id, name: client.name },
        linked_supplier: client.linked_supplier_id ? { id: client.linked_supplier_id, name: supplierName } : null,
        net_balance: running, // positive = party owes company, negative = company owes party
        lines,
      },
    });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = schema.parse(req.body) as Record<string, unknown>;
    await assertLinkedSupplier(t.db, t.companyId, parsed.linked_supplier_id as string | null | undefined);
    // Only insert fields the caller actually sent — passing an explicit NULL
    // for an omitted field (e.g. currency) would bypass its DB DEFAULT and
    // violate its NOT NULL constraint, unlike simply leaving it out.
    const keys = FIELDS.filter((f) => f in parsed);
    const values = keys.map((f) => parsed[f]);
    const rs = await t.db.query(
      `INSERT INTO clients (company_id, ${keys.join(',')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
      [t.companyId, ...values],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.partial().parse(req.body);
    if ('linked_supplier_id' in body) await assertLinkedSupplier(t.db, t.companyId, body.linked_supplier_id);
    const keys = FIELDS.filter((f) => f in body);
    if (!keys.length) return res.json({ data: null });
    const values = keys.map((f) => (body as Record<string, unknown>)[f]);
    const set = keys.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const rs = await t.db.query(
      `UPDATE clients SET ${set} WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, ...values],
    );
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`DELETE FROM clients WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default r;
