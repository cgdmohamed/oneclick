import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { internalKindSchema } from './kinds.js';
export { ALL_KINDS, PUBLIC_KINDS } from './kinds.js';

const router = Router();

router.get('/count', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE read_at IS NULL)::int AS unread
       FROM notifications
       WHERE company_id = $1 AND (user_id IS NULL OR user_id = $2)
         AND kind <> 'invoice_email'`,
      [t.companyId, req.auth!.userId],
    );
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const q = req.query as Record<string, string | undefined>;
    const p = parsePagination(req);

    const conditions = [
      `company_id = $1`,
      `(user_id IS NULL OR user_id = $2)`,
    ];
    const params: unknown[] = [t.companyId, req.auth!.userId];
    let idx = 3;

    if (q.kind) {
      conditions.push(`kind = $${idx++}`);
      params.push(q.kind);
    } else if (q.exclude_kind) {
      conditions.push(`kind <> $${idx++}`);
      params.push(q.exclude_kind);
    }

    const where = conditions.join(' AND ');

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM notifications WHERE ${where}`,
      params,
    );
    const a = p.applyTo(
      `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC`,
      params,
    );
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = z.object({ kind: z.string().optional() }).parse(req.body ?? {});
    const conditions = [
      `company_id = $1`,
      `(user_id IS NULL OR user_id = $2)`,
      `read_at IS NULL`,
    ];
    const params: unknown[] = [t.companyId, req.auth!.userId];
    if (body.kind) {
      conditions.push(`kind = $3`);
      params.push(body.kind);
    }
    await t.db.query(
      `UPDATE notifications SET read_at = now() WHERE ${conditions.join(' AND ')}`,
      params,
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// External (frontend) callers use: 'info' | 'warning' | 'success' | 'error'
// Internal backend writers also use: 'invoice_email' (e.g. email notification logs)
const schema = z.object({
  user_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  body: z.string().optional().nullable(),
  kind: internalKindSchema.default('info'),
});

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = schema.parse(req.body);
    const rs = await t.db.query(
      `INSERT INTO notifications (company_id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [t.companyId, b.user_id ?? null, b.title, b.body ?? null, b.kind],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

export default router;
