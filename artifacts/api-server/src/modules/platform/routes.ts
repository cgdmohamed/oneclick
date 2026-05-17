/**
 * Platform-level (super-admin) endpoints for MANUAL subscription billing.
 * - /wallets      : add / rename / toggle / delete platform wallets
 * - /subscription-payments : record a manual payment from a subscription
 *                             into a wallet, updating wallet balance.
 *
 * Intentionally no Stripe / Paddle here — billing is handled by a human.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { adminSettingsRouter } from './settingsRoutes.js';

const router = Router();
router.use(requireSuperAdmin);

/* ---- Platform settings (branding / landing_content / tracking) ---- */
router.use('/settings', adminSettingsRouter);

/* ---------------- Wallets ---------------- */
const walletSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['cash', 'bank', 'wallet']).default('cash'),
  balance: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
});

router.get('/wallets', async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT * FROM platform_wallets ORDER BY created_at DESC`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.post('/wallets', async (req, res, next) => {
  try {
    const body = walletSchema.parse(req.body);
    const rs = await pool.query(
      `INSERT INTO platform_wallets (name, type, balance, is_active)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [body.name, body.type, body.balance, body.is_active],
    );
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'platform_wallet.create', entity: 'platform_wallet',
      entityId: rs.rows[0].id, data: { name: body.name, type: body.type },
    });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/wallets/:id', async (req, res, next) => {
  try {
    const body = walletSchema.partial().parse(req.body);
    const fields = Object.keys(body);
    if (!fields.length) return res.json({ data: null });
    const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map((f) => (body as Record<string, unknown>)[f]);
    const rs = await pool.query(
      `UPDATE platform_wallets SET ${sets}, updated_at = now()
       WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, req.params.id],
    );
    if (!rs.rowCount) throw notFound();
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'platform_wallet.update', entity: 'platform_wallet',
      entityId: req.params.id, data: body as Record<string, unknown>,
    });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/wallets/:id', async (req, res, next) => {
  try {
    const used = await pool.query(
      `SELECT 1 FROM subscription_payments WHERE wallet_id = $1 LIMIT 1`,
      [req.params.id],
    );
    if (used.rowCount) throw badRequest('Wallet has recorded payments — deactivate it instead');
    await pool.query(`DELETE FROM platform_wallets WHERE id = $1`, [req.params.id]);
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'platform_wallet.delete', entity: 'platform_wallet',
      entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Wallet ledger — list payments received into a single wallet */
router.get('/wallets/:id/ledger', async (req, res, next) => {
  try {
    const rs = await pool.query(`
      SELECT sp.*, c.name AS company_name, p.name AS plan_name
      FROM subscription_payments sp
      JOIN subscriptions s ON s.id = sp.subscription_id
      JOIN companies c ON c.id = s.company_id
      JOIN plans p     ON p.id = s.plan_id
      WHERE sp.wallet_id = $1
      ORDER BY sp.paid_at DESC
    `, [req.params.id]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

/* ---------------- Subscription payments ---------------- */
const paymentSchema = z.object({
  subscription_id: z.string().uuid(),
  wallet_id:       z.string().uuid(),
  amount:          z.coerce.number().positive(),
  method:          z.enum(['cash', 'bank', 'wallet']).default('cash'),
  paid_at:         z.string().datetime().optional(),
  reference:       z.string().optional().nullable(),
  notes:           z.string().optional().nullable(),
});

router.get('/subscription-payments', async (_req, res, next) => {
  try {
    const rs = await pool.query(`
      SELECT sp.*, w.name AS wallet_name,
             c.name AS company_name, p.name AS plan_name
      FROM subscription_payments sp
      JOIN platform_wallets w ON w.id = sp.wallet_id
      JOIN subscriptions s ON s.id = sp.subscription_id
      JOIN companies c ON c.id = s.company_id
      JOIN plans p     ON p.id = s.plan_id
      ORDER BY sp.paid_at DESC
    `);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.post('/subscription-payments', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = paymentSchema.parse(req.body);
    await client.query('BEGIN');

    const sub = await client.query(
      `SELECT id, status FROM subscriptions WHERE id = $1 FOR UPDATE`,
      [body.subscription_id],
    );
    if (!sub.rowCount) throw notFound('Subscription not found');

    const wallet = await client.query(
      `SELECT id, is_active FROM platform_wallets WHERE id = $1 FOR UPDATE`,
      [body.wallet_id],
    );
    if (!wallet.rowCount) throw notFound('Wallet not found');
    if (!wallet.rows[0].is_active) throw badRequest('Wallet is inactive');

    const rs = await client.query(
      `INSERT INTO subscription_payments
        (subscription_id, wallet_id, amount, method, paid_at, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [body.subscription_id, body.wallet_id, body.amount, body.method,
       body.paid_at ?? new Date(), body.reference ?? null, body.notes ?? null,
       req.auth!.userId],
    );

    await client.query(
      `UPDATE platform_wallets SET balance = balance + $1, updated_at = now()
       WHERE id = $2`,
      [body.amount, body.wallet_id],
    );

    // Activate subscription on first qualifying payment
    if (sub.rows[0].status !== 'active') {
      await client.query(
        `UPDATE subscriptions SET status = 'active' WHERE id = $1`,
        [body.subscription_id],
      );
    }

    await client.query('COMMIT');

    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'subscription_payment.create', entity: 'subscription_payment',
      entityId: rs.rows[0].id,
      data: { subscription_id: body.subscription_id, wallet_id: body.wallet_id, amount: body.amount },
    });

    res.status(201).json({ data: rs.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.delete('/subscription-payments/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query(
      `SELECT amount, wallet_id FROM subscription_payments WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!p.rowCount) throw notFound();
    await client.query(`DELETE FROM subscription_payments WHERE id = $1`, [req.params.id]);
    await client.query(
      `UPDATE platform_wallets SET balance = balance - $1, updated_at = now() WHERE id = $2`,
      [p.rows[0].amount, p.rows[0].wallet_id],
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

/* ---------------- Companies (super-admin) ---------------- */
router.get('/companies', async (_req, res, next) => {
  try {
    const rs = await pool.query(`
      SELECT c.id, c.name, c.email, c.phone, c.is_active, c.created_at,
             (SELECT u.name FROM users u
              JOIN user_companies uc ON uc.user_id = u.id
              WHERE uc.company_id = c.id AND uc.is_default = true LIMIT 1) AS owner_name,
             (SELECT p.name FROM subscriptions s
              JOIN plans p ON p.id = s.plan_id
              WHERE s.company_id = c.id ORDER BY s.created_at DESC LIMIT 1) AS plan_name,
             (SELECT s.status FROM subscriptions s
              WHERE s.company_id = c.id ORDER BY s.created_at DESC LIMIT 1) AS sub_status
      FROM companies c ORDER BY c.created_at DESC
    `);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.patch('/companies/:id', async (req, res, next) => {
  try {
    const body = z.object({ is_active: z.boolean() }).parse(req.body);
    const rs = await pool.query(
      `UPDATE companies SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [body.is_active, req.params.id],
    );
    if (!rs.rowCount) throw notFound();
    await audit(pool, {
      companyId: req.params.id, userId: req.auth!.userId,
      action: body.is_active ? 'company.activate' : 'company.suspend',
      entity: 'company', entityId: req.params.id,
    });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

/* ---------------- Stats (super-admin overview) ---------------- */
router.get('/stats', async (_req, res, next) => {
  try {
    const [companies, subs, payments] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total,
                         SUM(CASE WHEN is_active THEN 1 ELSE 0 END)::int AS active,
                         SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END)::int AS suspended
                  FROM companies`),
      pool.query(`SELECT
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int AS active,
                    SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)::int AS expired,
                    SUM(CASE WHEN status = 'trialing' THEN 1 ELSE 0 END)::int AS trialing
                  FROM subscriptions`),
      pool.query(`SELECT COALESCE(SUM(amount),0)::float AS total FROM subscription_payments`),
    ]);
    res.json({
      data: {
        companies: companies.rows[0],
        subscriptions: subs.rows[0],
        revenue_total: payments.rows[0].total,
      },
    });
  } catch (e) { next(e); }
});

/* ---------------- Feature Access (per-plan toggle matrix) ---------------- */
router.get('/feature-access', async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT plan_id, feature_key, enabled FROM feature_access`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.put('/feature-access', async (req, res, next) => {
  try {
    const body = z.object({
      entries: z.array(z.object({
        plan_id: z.string().uuid(),
        feature_key: z.string().min(1).max(100),
        enabled: z.boolean(),
      })),
    }).parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const e of body.entries) {
        await c.query(
          `INSERT INTO feature_access (plan_id, feature_key, enabled)
           VALUES ($1,$2,$3)
           ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled`,
          [e.plan_id, e.feature_key, e.enabled],
        );
      }
      await c.query('COMMIT');
    } catch (err) { await c.query('ROLLBACK'); throw err; } finally { c.release(); }
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'feature_access.update', entity: 'feature_access', entityId: null,
      data: { count: body.entries.length },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------------- System Notifications (broadcast) ---------------- */
router.get('/system-notifications', async (_req, res, next) => {
  try {
    const rs = await pool.query(
      `SELECT * FROM system_notifications ORDER BY created_at DESC LIMIT 100`,
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.post('/system-notifications', async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1),
      audience: z.string().default('all'),  // 'all' or company uuid
    }).parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const sn = await c.query(
        `INSERT INTO system_notifications (title, body, audience) VALUES ($1,$2,$3) RETURNING *`,
        [body.title, body.body, body.audience],
      );
      // Fan-out to per-company notifications
      if (body.audience === 'all') {
        await c.query(
          `INSERT INTO notifications (company_id, title, body, kind)
           SELECT id, $1, $2, 'info' FROM companies WHERE is_active = true`,
          [body.title, body.body],
        );
      } else {
        await c.query(
          `INSERT INTO notifications (company_id, title, body, kind) VALUES ($1, $2, $3, 'info')`,
          [body.audience, body.title, body.body],
        );
      }
      await c.query('COMMIT');
      await audit(pool, {
        companyId: body.audience === 'all' ? null : body.audience,
        userId: req.auth!.userId,
        action: 'system_notification.send', entity: 'system_notification',
        entityId: sn.rows[0].id, data: { audience: body.audience },
      });
      res.status(201).json({ data: sn.rows[0] });
    } catch (err) { await c.query('ROLLBACK'); throw err; } finally { c.release(); }
  } catch (e) { next(e); }
});

export default router;

