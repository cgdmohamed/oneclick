import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { env } from '../../config/env.js';
import { badRequest, unauthorized } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { sendEmail } from '../../utils/email.js';
import { audit } from '../../utils/audit.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  companyName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signAccess(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '15m' });
}
function signRefresh(userId: string) {
  return jwt.sign({ sub: userId, t: 'r' }, env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const exists = await c.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
      if (exists.rowCount) throw badRequest('Email already registered');

      const hash = await bcrypt.hash(body.password, 12);
      const userRes = await c.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
        [body.email, hash, body.name],
      );
      const userId = userRes.rows[0].id;

      const compRes = await c.query(
        `INSERT INTO companies (name, email) VALUES ($1,$2) RETURNING id`,
        [body.companyName, body.email],
      );
      const companyId = compRes.rows[0].id;

      await c.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)`, [userId, companyId]);
      await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,'company_admin')`, [userId, companyId]);

      // free plan trial
      await c.query(`
        INSERT INTO subscriptions (company_id, plan_id, status, expires_at)
        SELECT $1, id, 'trialing', now() + interval '14 days' FROM plans WHERE code='free' LIMIT 1
      `, [companyId]);

      await c.query('COMMIT');

      const access = signAccess(userId);
      const refresh = signRefresh(userId);
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 days')`,
        [userId, sha(refresh)],
      );
      await audit(pool, {
        companyId, userId,
        action: 'auth.register', entity: 'user', entityId: userId,
        data: { email: body.email, companyName: body.companyName },
      });
      res.json({ access_token: access, refresh_token: refresh, user: { id: userId, email: body.email, name: body.name }, company: { id: companyId, name: body.companyName } });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const u = await pool.query(`SELECT id, password_hash, name, is_super_admin FROM users WHERE email = $1`, [body.email]);
    if (!u.rowCount) throw unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(body.password, u.rows[0].password_hash);
    if (!ok) throw unauthorized('Invalid credentials');

    const userId = u.rows[0].id;
    const access = signAccess(userId);
    const refresh = signRefresh(userId);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 days')`,
      [userId, sha(refresh)],
    );

    const comp = await pool.query(
      `SELECT c.id, c.name FROM user_companies uc JOIN companies c ON c.id = uc.company_id
       WHERE uc.user_id = $1 ORDER BY uc.is_default DESC LIMIT 1`,
      [userId],
    );
    const roles = await pool.query(
      `SELECT role, company_id FROM user_roles WHERE user_id = $1`, [userId],
    );

    await audit(pool, {
      companyId: comp.rows[0]?.id ?? null, userId,
      action: 'auth.login', entity: 'user', entityId: userId,
      data: { email: body.email, ip: req.ip },
    });
    res.json({
      access_token: access,
      refresh_token: refresh,
      user: { id: userId, email: body.email, name: u.rows[0].name, isSuperAdmin: u.rows[0].is_super_admin },
      company: comp.rows[0] ?? null,
      roles: roles.rows,
    });
  } catch (e) { next(e); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = z.object({ refresh_token: z.string() }).parse(req.body);
    let payload: { sub: string };
    try { payload = jwt.verify(refresh_token, env.JWT_REFRESH_SECRET) as { sub: string }; }
    catch { throw unauthorized('Invalid refresh token'); }
    const row = await pool.query(
      `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [sha(refresh_token)],
    );
    if (!row.rowCount) throw unauthorized('Refresh token revoked');
    res.json({ access_token: signAccess(payload.sub) });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refresh_token } = z.object({ refresh_token: z.string().optional() }).parse(req.body ?? {});
    if (refresh_token) {
      await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, [sha(refresh_token)]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const u = await pool.query(`SELECT id, email, name, is_super_admin FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount) throw unauthorized();
    const comps = await pool.query(
      `SELECT c.id, c.name, uc.is_default FROM user_companies uc JOIN companies c ON c.id = uc.company_id WHERE uc.user_id = $1`,
      [userId],
    );
    const roles = await pool.query(`SELECT role, company_id FROM user_roles WHERE user_id = $1`, [userId]);
    res.json({ user: u.rows[0], companies: comps.rows, roles: roles.rows });
  } catch (e) { next(e); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const u = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (u.rowCount) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
        [u.rows[0].id, sha(token)],
      );
      const link = `${env.APP_URL}/reset-password?token=${token}`;
      await sendEmail({
        to: email,
        subject: 'Reset your Hesabat password',
        html: `<p>Click the link below to reset your password (valid for 1 hour):</p>
               <p><a href="${link}">${link}</a></p>
               <p>If you did not request this, ignore this email.</p>`,
      });
      await audit(pool, {
        companyId: null, userId: u.rows[0].id,
        action: 'auth.password_reset_request', entity: 'user', entityId: u.rows[0].id,
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = z.object({ token: z.string().min(10), password: z.string().min(8) }).parse(req.body);
    const r = await pool.query(
      `SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha(token)],
    );
    if (!r.rowCount) throw badRequest('Invalid or expired token');
    const hash = await bcrypt.hash(password, 12);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, r.rows[0].user_id]);
      await c.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [r.rows[0].id]);
      await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [r.rows[0].user_id]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    await audit(pool, {
      companyId: null, userId: r.rows[0].user_id,
      action: 'auth.password_reset', entity: 'user', entityId: r.rows[0].user_id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
