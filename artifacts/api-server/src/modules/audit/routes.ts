import { Router } from 'express';
import { requireRole } from '../../middleware/rbac.js';
import { parsePagination } from '../../utils/pagination.js';

const router = Router();

router.get('/', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const q = req.query as Record<string, string | undefined>;

    const conditions = ['a.company_id = $1'];
    const params: unknown[] = [t.companyId];
    let idx = 2;

    if (q.entity) { conditions.push(`a.entity = $${idx++}`); params.push(q.entity); }
    if (q.action) { conditions.push(`a.action = $${idx++}`); params.push(q.action); }

    const where = conditions.join(' AND ');
    const p = parsePagination(req);

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM audit_log a WHERE ${where}`,
      params,
    );
    const a = p.applyTo(
      `SELECT a.*, u.name AS user_name, u.email AS user_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${where}
       ORDER BY a.created_at DESC`,
      params,
    );
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

export default router;
