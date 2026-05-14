import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool } from '../../db/client.js';
import { requireRole } from '../../middleware/rbac.js';
import { badRequest } from '../../utils/errors.js';

const router = Router();

router.get('/', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await pool.query(`
      SELECT u.id, u.email, u.name, u.created_at, array_agg(ur.role) AS roles
      FROM user_companies uc
      JOIN users u ON u.id = uc.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.company_id = uc.company_id
      WHERE uc.company_id = $1
      GROUP BY u.id ORDER BY u.created_at DESC
    `, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(['company_admin','accountant','sales','viewer']),
});

router.post('/', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = inviteSchema.parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      let userId: string;
      const exists = await c.query(`SELECT id FROM users WHERE email = $1`, [body.email]);
      if (exists.rowCount) {
        userId = exists.rows[0].id;
      } else {
        const hash = await bcrypt.hash(body.password, 12);
        const u = await c.query(
          `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
          [body.email, hash, body.name],
        );
        userId = u.rows[0].id;
      }
      await c.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, t.companyId]);
      await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [userId, t.companyId, body.role]);
      await c.query('COMMIT');
      res.status(201).json({ data: { id: userId, email: body.email, name: body.name, role: body.role } });
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    if (req.params.id === req.auth!.userId) throw badRequest('Cannot remove yourself');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`DELETE FROM user_roles WHERE user_id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      await c.query(`DELETE FROM user_companies WHERE user_id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
