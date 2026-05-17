import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool } from '../../db/client.js';
import { requireRole } from '../../middleware/rbac.js';
import { badRequest } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { enforceUserLimit } from '../../middleware/planLimits.js';
import { parsePagination } from '../../utils/pagination.js';

const router = Router();

router.post('/me/onboarding-done', async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    await pool.query(`UPDATE users SET onboarding_done = true WHERE id = $1`, [userId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM user_companies WHERE company_id = $1`,
      [t.companyId],
    );
    const a = p.applyTo(`
      SELECT u.id, u.email, u.name, u.created_at, array_agg(ur.role) AS roles
      FROM user_companies uc
      JOIN users u ON u.id = uc.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.company_id = uc.company_id
      WHERE uc.company_id = $1
      GROUP BY u.id ORDER BY u.created_at DESC
    `, [t.companyId]);
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(['company_admin','accountant','sales','viewer']),
});

/**
 * SEC-05: Creating a brand-new user inside the tenant is allowed; *silently
 * attaching an existing user account to this tenant is NOT*. If the email
 * already belongs to a registered Hesabat user, the admin must use the
 * invitations flow (POST /api/invitations) so the existing user can accept
 * before being added to the company. Otherwise a malicious admin could pull
 * arbitrary accounts into their tenant just by guessing emails.
 */
router.post('/', requireRole('company_admin'), enforceUserLimit(), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = inviteSchema.parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const exists = await c.query(`SELECT id FROM users WHERE email = $1`, [body.email]);
      if (exists.rowCount) {
        await c.query('ROLLBACK');
        throw badRequest(
          'A user with this email already exists. Send them an invitation via /api/invitations instead.',
        );
      }
      const hash = await bcrypt.hash(body.password, 12);
      const u = await c.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
        [body.email, hash, body.name],
      );
      const userId: string = u.rows[0].id;
      await c.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, t.companyId]);
      await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [userId, t.companyId, body.role]);
      await c.query('COMMIT');
      await audit(pool, {
        companyId: t.companyId, userId: req.auth!.userId,
        action: 'user.invite', entity: 'user', entityId: userId,
        data: { email: body.email, role: body.role },
      });
      res.status(201).json({ data: { id: userId, email: body.email, name: body.name, role: body.role } });
    } catch (e) { try { await c.query('ROLLBACK'); } catch { /* ignore */ } throw e; } finally { c.release(); }
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
    await audit(pool, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'user.remove', entity: 'user', entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
