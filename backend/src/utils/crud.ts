import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from './pagination.js';

/** Tiny CRUD factory for tenant-scoped tables to keep modules concise. */
export function crudRouter(opts: {
  table: string;
  fields: string[];                 // columns allowed in INSERT/UPDATE
  schema: z.ZodTypeAny;             // body validation
  patchSchema?: z.ZodTypeAny;
  defaults?: Record<string, unknown>;
  list?: { orderBy?: string; searchable?: string[] };
}) {
  const r = Router();
  void opts.fields;

  r.get('/', async (req, res, next) => {
    try {
      const t = req.tenant!;
      const order = opts.list?.orderBy ?? 'created_at DESC';
      const p = parsePagination(req);

      // SCL-05: optional ?q=... ILIKE search across whitelisted columns only.
      const q = (req.query.q as string | undefined)?.trim();
      const searchable = opts.list?.searchable ?? [];
      let where = '';
      const params: unknown[] = [];
      if (q && searchable.length) {
        const idx = params.length + 1;
        params.push(`%${q}%`);
        where = `WHERE ${searchable.map((c) => `${c} ILIKE $${idx}`).join(' OR ')}`;
      }

      const totalQ = await t.db.query(
        `SELECT count(*)::int AS count FROM ${opts.table} ${where}`, params,
      );
      const total = Number(totalQ.rows[0]?.count ?? 0);

      const applied = p.applyTo(
        `SELECT * FROM ${opts.table} ${where} ORDER BY ${order}`, params,
      );
      const rs = await t.db.query(applied.sql, applied.params);
      res.json(p.respond(rs.rows, total));
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
      const parsed = opts.schema.parse(req.body) as Record<string, unknown>;
      // SEC-09: enforce field whitelist on create too.
      const allowed = new Set(opts.fields);
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) if (allowed.has(k)) body[k] = v;
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
      const parsed = (opts.patchSchema ?? opts.schema.partial?.() ?? opts.schema).parse(req.body) as Record<string, unknown>;
      // SEC-09: hard whitelist — only opts.fields can be mutated, even if the
      // zod schema accidentally lets extra keys through.
      const allowed = new Set(opts.fields);
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) if (allowed.has(k)) body[k] = v;
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
