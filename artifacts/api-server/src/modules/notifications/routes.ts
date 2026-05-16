import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM notifications
        WHERE company_id = $1 AND (user_id IS NULL OR user_id = $2)`,
      [t.companyId, req.auth!.userId],
    );
    const a = p.applyTo(
      `SELECT * FROM notifications
        WHERE company_id = $1 AND (user_id IS NULL OR user_id = $2)
        ORDER BY created_at DESC`,
      [t.companyId, req.auth!.userId],
    );
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const schema = z.object({
  user_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  body: z.string().optional().nullable(),
  kind: z.enum(['info','warning','success','error']).default('info'),
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
