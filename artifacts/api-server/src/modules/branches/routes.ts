import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { notFound, conflict } from '../../utils/errors.js';

// All FKs from these tables to branches are ON DELETE SET NULL (migrations
// 031/036/037/040) — without a guard, deleting a branch in use would
// silently strip it off historical journal entries/invoices/payroll/etc.
const DELETE_GUARD_TABLES: { table: string; column: string }[] = [
  { table: 'journal_entries', column: 'branch_id' },
  { table: 'journal_entry_lines', column: 'branch_id' },
  { table: 'invoices', column: 'branch_id' },
  { table: 'payments', column: 'branch_id' },
  { table: 'payouts', column: 'branch_id' },
  { table: 'purchase_invoices', column: 'branch_id' },
  { table: 'supplier_payments', column: 'branch_id' },
  { table: 'payroll_run_lines', column: 'branch_id' },
  { table: 'fixed_assets', column: 'branch_id' },
  { table: 'inventory_write_offs', column: 'branch_id' },
];

const r = Router();

const schema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  is_active: z.boolean().default(true),
});

// Branch code is generated here, never accepted from the client — same
// sequential "PREFIX-00001" convention already used for inventory write-off
// numbers (see inventory-write-offs/routes.ts nextNumber()).
async function nextBranchCode(db: any, companyId: string) {
  const row = await db.query(
    `SELECT COUNT(*)::int + 1 AS seq FROM branches WHERE company_id = $1`,
    [companyId],
  );
  return `BR-${String(row.rows[0].seq).padStart(5, '0')}`;
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const params: unknown[] = [t.companyId];
    let where = `WHERE company_id = $1`;
    const q = (req.query.q as string | undefined)?.trim();
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (code ILIKE $${params.length} OR name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }
    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM branches ${where}`, params);
    const total = Number(totalQ.rows[0]?.count ?? 0);
    const applied = p.applyTo(`SELECT * FROM branches ${where} ORDER BY name ASC`, params);
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, total));
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT * FROM branches WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!rs.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.parse(req.body);
    const code = await nextBranchCode(t.db, t.companyId);
    const rs = await t.db.query(
      `INSERT INTO branches (company_id, code, name, address, phone, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [t.companyId, code, body.name, body.address ?? null, body.phone ?? null, body.is_active],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    // `code` isn't in this schema at all, so a client-supplied value is
    // simply ignored here — the branch code is immutable after creation.
    const body = schema.partial().parse(req.body);
    const fields = Object.keys(body);
    if (!fields.length) return res.json({ data: null });
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...Object.values(body), req.params.id, t.companyId];
    const rs = await t.db.query(
      `UPDATE branches SET ${set} WHERE id = $${values.length - 1} AND company_id = $${values.length} RETURNING *`,
      values,
    );
    if (!rs.rowCount) throw notFound('Branch not found');
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    for (const g of DELETE_GUARD_TABLES) {
      const used = await t.db.query(
        `SELECT 1 FROM ${g.table} WHERE company_id = $1 AND ${g.column} = $2 LIMIT 1`,
        [t.companyId, req.params.id],
      );
      if (used.rowCount) {
        throw conflict('Cannot delete — it is used by existing transactions. Deactivate it instead.');
      }
    }
    const rs = await t.db.query(`DELETE FROM branches WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default r;
