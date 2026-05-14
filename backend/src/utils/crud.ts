import { Router } from 'express';
import { z } from 'zod';

/** Tiny CRUD factory for tenant-scoped tables to keep modules concise. */
export function crudRouter(opts: {
  table: string;
  fields: string[];                 // columns allowed in INSERT/UPDATE
  schema: z.ZodTypeAny;             // body validation
  patchSchema?: z.ZodTypeAny;
  defaults?: Record<string, unknown>;
  list?: { orderBy?: string };
}) {
  const r = Router();
  const cols = opts.fields.join(', ');

  r.get('/', async (req, res, next) => {
    try {
      const t = req.tenant!;
      const order = opts.list?.orderBy ?? 'created_at DESC';
      const rs = await t.db.query(`SELECT * FROM ${opts.table} ORDER BY ${order}`);
      res.json({ data: rs.rows });
    } catch (e) { next(e); }
  });

  r.get('/:id', async (req, res, next) => {
    try {
      const t = req.tenant!;
      const rs = await t.db.query(`SELECT * FROM ${opts.table} WHERE id = $1`, [req.params.id]);
      if (!rs.rowCount) return res.status(404).json({ error: 'not_found' });
      res.json({ data: rs.rows[0] });
    } catch (e) { next(e); }
  });

  r.post('/', async (req, res, next) => {
    try {
      const t = req.tenant!;
      const body = opts.schema.parse(req.body) as Record<string, unknown>;
      const merged = { ...(opts.defaults ?? {}), ...body, company_id: t.companyId };
      const fields = Object.keys(merged);
      const values = Object.values(merged);
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
      const rs = await t.db.query(
        `INSERT INTO ${opts.table} (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`,
        values,
      );
      res.status(201).json({ data: rs.rows[0] });
    } catch (e) { next(e); }
  });

  r.patch('/:id', async (req, res, next) => {
    try {
      const t = req.tenant!;
      const body = (opts.patchSchema ?? opts.schema.partial?.() ?? opts.schema).parse(req.body) as Record<string, unknown>;
      const fields = Object.keys(body);
      if (fields.length === 0) return res.json({ data: null });
      const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
      const values = [...Object.values(body), req.params.id];
      const rs = await t.db.query(
        `UPDATE ${opts.table} SET ${set} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      if (!rs.rowCount) return res.status(404).json({ error: 'not_found' });
      res.json({ data: rs.rows[0] });
    } catch (e) { next(e); }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const t = req.tenant!;
      const rs = await t.db.query(`DELETE FROM ${opts.table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true, deleted: rs.rowCount });
    } catch (e) { next(e); }
  });

  return r;
}
