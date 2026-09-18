import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { notFound } from '../../utils/errors.js';

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
    const rs = await t.db.query(`DELETE FROM branches WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default r;
