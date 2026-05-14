import { Router } from 'express';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';

const router = Router();

router.get('/me', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await pool.query(`
      SELECT s.*, p.code AS plan_code, p.name AS plan_name
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1 ORDER BY s.created_at DESC LIMIT 1
    `, [t.companyId]);
    res.json({ data: rs.rows[0] ?? null });
  } catch (e) { next(e); }
});

router.get('/', requireSuperAdmin, async (_req, res, next) => {
  try {
    const rs = await pool.query(`
      SELECT s.*, c.name AS company_name, p.name AS plan_name
      FROM subscriptions s
      JOIN companies c ON c.id = s.company_id
      JOIN plans p ON p.id = s.plan_id
      ORDER BY s.created_at DESC
    `);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

export default router;
