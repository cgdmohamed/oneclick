/**
 * Platform-level (super-admin) endpoints.
 * - /wallets             : add / rename / toggle / delete platform wallets
 * - /subscription-payments : record a manual payment into a wallet
 * - /signups             : company registration review (pending / approve / decline)
 * - /users               : all users across all companies (super-admin view)
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { adminSettingsRouter } from './settingsRoutes.js';
import { parsePagination } from '../../utils/pagination.js';
import { sendEmail } from '../../utils/email.js';
import { env } from '../../config/env.js';

const router = Router();
router.use(requireSuperAdmin);

/* ---- Platform settings (branding / landing_content / tracking) ---- */
router.use('/settings', adminSettingsRouter);

/* ---- Plans health (returns whether any active plans are seeded) ---- */
router.get('/plans/health', async (_req, res, next) => {
  try {
    const rs = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM plans WHERE is_active = true) AS has_plans`,
    );
    res.json({ hasPlans: rs.rows[0].has_plans });
  } catch (e) { next(e); }
});

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
        `UPDATE subscriptions SET status = 'active', updated_at = now() WHERE id = $1`,
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

/* ---------------- Audit Log (super-admin) ---------------- */
router.get('/audit-log', async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const p = parsePagination(req);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.company_id) { conditions.push(`a.company_id = $${idx++}`); params.push(q.company_id); }
    if (q.entity) { conditions.push(`a.entity = $${idx++}`); params.push(q.entity); }
    if (q.action) { conditions.push(`a.action = $${idx++}`); params.push(q.action); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalQ = await pool.query(
      `SELECT count(*)::int AS count FROM audit_log a ${where}`,
      params,
    );
    const a = p.applyTo(
      `SELECT a.*, u.name AS user_name, u.email AS user_email, c.name AS company_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN companies c ON c.id = a.company_id
       ${where}
       ORDER BY a.created_at DESC`,
      params,
    );
    const rs = await pool.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

/* ---- SMTP health (returns whether system SMTP is configured) ---- */
router.get('/settings/smtp-status', (_req, res) => {
  res.json({ configured: Boolean(env.SMTP_HOST) });
});

/* ---------------- Companies (super-admin) ---------------- */
router.get('/companies', async (_req, res, next) => {
  try {
    const rs = await pool.query(`
      SELECT c.id, c.name, c.email, c.phone, c.is_active, c.review_status, c.created_at,
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

/* ---------------- Analytics (super-admin) ---------------- */
router.get('/analytics', async (_req, res, next) => {
  try {
    const [seriesRs, kpisRs, planRs, statusRs, topRs] = await Promise.all([
      /* Monthly time-series — last 12 months.
         MRR per month = sum of amounts for subscriptions that were active
         during that calendar month (started before month end, not yet
         cancelled/expired before month start). This reflects recurring
         subscription value, not cash collected. */
      pool.query(`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now() - INTERVAL '11 months'),
            date_trunc('month', now()),
            INTERVAL '1 month'
          ) AS month_start
        )
        SELECT
          to_char(mo.month_start, 'YYYY-MM') AS key,

          /* New company signups that month */
          (SELECT COUNT(*)::int FROM companies c
           WHERE date_trunc('month', c.created_at) = mo.month_start
          ) AS signups,

          /* MRR: active subscription amounts for that month.
             A subscription is "active in month M" when:
               started_at  < end of M
               AND (expires_at  IS NULL OR expires_at  >= start of M)
               AND (cancelled_at IS NULL OR cancelled_at >= start of M) */
          (SELECT COALESCE(SUM(s.amount), 0)::float FROM subscriptions s
           WHERE s.started_at  <  mo.month_start + INTERVAL '1 month'
             AND (s.expires_at   IS NULL OR s.expires_at   >= mo.month_start)
             AND (s.cancelled_at IS NULL OR s.cancelled_at >= mo.month_start)
          ) AS mrr,

          /* Churn: subscriptions that ended (cancelled or expired) that month */
          (SELECT COUNT(*)::int FROM subscriptions s
           WHERE s.status IN ('cancelled', 'expired')
             AND COALESCE(s.cancelled_at, s.expires_at) IS NOT NULL
             AND date_trunc('month', COALESCE(s.cancelled_at, s.expires_at)) = mo.month_start
          ) AS churn

        FROM months mo
        ORDER BY mo.month_start
      `),

      /* Current KPI aggregates */
      pool.query(`
        SELECT
          (SELECT COALESCE(SUM(amount), 0)::float  FROM subscriptions WHERE status = 'active')  AS mrr,
          (SELECT COUNT(*)::int                     FROM subscriptions WHERE status = 'active')  AS active_subs,
          (SELECT COUNT(*)::int                     FROM companies)                              AS total_companies,
          (SELECT COUNT(*)::int                     FROM users)                                  AS total_users,
          (SELECT COUNT(*)::int FROM subscriptions
           WHERE status IN ('cancelled','expired')
             AND COALESCE(cancelled_at, expires_at) >= now() - INTERVAL '30 days')              AS churn_30d,
          (SELECT COUNT(*)::int FROM subscriptions)                                              AS total_subs
      `),

      /* Plan distribution — all subscription rows, all statuses.
         Use DISTINCT to avoid inflating count when a subscription has
         multiple payment rows. Revenue is still the real sum of payments. */
      pool.query(`
        SELECT
          p.name,
          COUNT(DISTINCT s.id)::int                     AS count,
          COALESCE(SUM(sp.amount)::float, 0)            AS revenue
        FROM plans p
        LEFT JOIN subscriptions s
          ON s.plan_id = p.id
        LEFT JOIN subscription_payments sp
          ON sp.subscription_id = s.id
        GROUP BY p.id, p.name
        HAVING COUNT(DISTINCT s.id) > 0
        ORDER BY count DESC
      `),

      /* Subscription status distribution */
      pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM subscriptions
        GROUP BY status
      `),

      /* Top 6 companies by revenue collected */
      pool.query(`
        SELECT
          c.name,
          COALESCE(SUM(sp.amount)::float, 0) AS revenue
        FROM companies c
        LEFT JOIN subscriptions s  ON s.company_id = c.id
        LEFT JOIN subscription_payments sp ON sp.subscription_id = s.id
        GROUP BY c.id, c.name
        HAVING COALESCE(SUM(sp.amount)::float, 0) > 0
        ORDER BY revenue DESC
        LIMIT 6
      `),
    ]);

    const kpis = kpisRs.rows[0];
    const mrr  = Number(kpis.mrr) || 0;
    const activeSubs = Number(kpis.active_subs) || 0;
    const totalSubs  = Number(kpis.total_subs)  || 0;

    res.json({
      data: {
        series: seriesRs.rows.map(r => ({
          key:     r.key,
          signups: Number(r.signups),
          mrr:     Number(r.mrr),
          churn:   Number(r.churn),
        })),
        kpis: {
          mrr,
          arr:             mrr * 12,
          arpu:            activeSubs ? mrr / activeSubs : 0,
          churn_rate:      totalSubs  ? (Number(kpis.churn_30d) / totalSubs) * 100 : 0,
          total_companies: Number(kpis.total_companies),
          active_subs:     activeSubs,
          total_users:     Number(kpis.total_users),
        },
        plan_dist: planRs.rows.map(r => ({
          name:    r.name,
          count:   Number(r.count),
          revenue: Number(r.revenue),
        })),
        status_dist: statusRs.rows.map(r => ({
          status: r.status,
          count:  Number(r.count),
        })),
        top_companies: topRs.rows.map(r => ({
          name:    r.name.length > 18 ? r.name.slice(0, 18) + '…' : r.name,
          revenue: Number(r.revenue),
        })),
      },
    });
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

/* ------------------------------------------------------------------ */
/* ---------------- Platform Custom Roles ---------------------------- */
/* ------------------------------------------------------------------ */

const customRoleSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.string()).default([]),
  color:       z.string().max(20).optional().nullable(),
  scope:       z.enum(['company', 'platform']).default('company'),
  enabled:     z.boolean().default(true),
});

router.get('/custom-roles', async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT * FROM platform_custom_roles ORDER BY created_at DESC`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.post('/custom-roles', async (req, res, next) => {
  try {
    const body = customRoleSchema.parse(req.body);
    const rs = await pool.query(
      `INSERT INTO platform_custom_roles (name, description, permissions, color, scope, enabled)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6) RETURNING *`,
      [body.name, body.description ?? null, JSON.stringify(body.permissions),
       body.color ?? null, body.scope, body.enabled],
    );
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'custom_role.create', entity: 'platform_custom_role', entityId: rs.rows[0].id,
      data: { name: body.name },
    });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/custom-roles/:id', async (req, res, next) => {
  try {
    const body = customRoleSchema.partial().parse(req.body);
    const fields = Object.keys(body) as Array<keyof typeof body>;
    if (!fields.length) return res.json({ data: null });
    const sets = fields.map((f, i) =>
      f === 'permissions' ? `permissions = $${i + 1}::jsonb` : `${f} = $${i + 1}`,
    ).join(', ');
    const values = fields.map(f =>
      f === 'permissions' ? JSON.stringify((body as Record<string,unknown>)[f]) : (body as Record<string,unknown>)[f],
    );
    const rs = await pool.query(
      `UPDATE platform_custom_roles SET ${sets}, updated_at = now()
       WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, req.params.id],
    );
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/custom-roles/:id', async (req, res, next) => {
  try {
    const rs = await pool.query(
      `DELETE FROM platform_custom_roles WHERE id = $1 RETURNING id`, [req.params.id],
    );
    if (!rs.rowCount) throw notFound();
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'custom_role.delete', entity: 'platform_custom_role', entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* ---------------- Company Signups / Registration Review ------------ */
/* ------------------------------------------------------------------ */

const SIGNUP_COLS = `
  c.id, c.name, c.email, c.phone, c.is_active,
  c.review_status, c.review_notes, c.reviewed_at, c.reviewed_by,
  (SELECT u.name FROM users u WHERE u.id = c.reviewed_by LIMIT 1) AS reviewed_by_name,
  c.created_at,
  (SELECT u.name FROM users u
   JOIN user_companies uc ON uc.user_id = u.id
   WHERE uc.company_id = c.id AND uc.is_default = true LIMIT 1) AS owner_name,
  (SELECT u.email_verified_at FROM users u
   JOIN user_companies uc ON uc.user_id = u.id
   WHERE uc.company_id = c.id AND uc.is_default = true LIMIT 1) AS email_verified_at,
  (SELECT p.name FROM subscriptions s
   JOIN plans p ON p.id = s.plan_id
   WHERE s.company_id = c.id ORDER BY s.created_at DESC LIMIT 1) AS plan_name,
  (SELECT s.plan_id FROM subscriptions s
   WHERE s.company_id = c.id ORDER BY s.created_at DESC LIMIT 1) AS plan_id,
  (SELECT s.status FROM subscriptions s
   WHERE s.company_id = c.id ORDER BY s.created_at DESC LIMIT 1) AS sub_status
`;

router.get('/signups', async (req, res, next) => {
  try {
    const status = (req.query as Record<string, string>).status;
    const p = parsePagination(req);
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE c.review_status = $1`;
    }
    const totalQ = await pool.query(
      `SELECT count(*)::int AS count FROM companies c ${where}`,
      params,
    );
    const a = p.applyTo(
      `SELECT ${SIGNUP_COLS} FROM companies c ${where} ORDER BY c.created_at DESC`,
      params,
    );
    const rs = await pool.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

const approveSchema = z.object({
  plan_id:    z.string().uuid(),
  cycle:      z.enum(['monthly', 'yearly', 'trial']),
  trial_days: z.coerce.number().int().min(1).max(365).optional().default(14),
  amount:     z.coerce.number().min(0).optional().default(0),
});

router.patch('/signups/:id/approve', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = approveSchema.parse(req.body);
    await client.query('BEGIN');

    const co = await client.query(
      `SELECT id FROM companies WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!co.rowCount) { await client.query('ROLLBACK'); throw notFound('Company not found'); }

    const reviewedBy = req.auth!.userId;
    await client.query(
      `UPDATE companies
         SET is_active = true, review_status = 'approved',
             reviewed_at = now(), reviewed_by = $1, updated_at = now()
       WHERE id = $2`,
      [reviewedBy, req.params.id],
    );

    const daysMap = { monthly: 30, yearly: 365, trial: body.trial_days };
    const days = daysMap[body.cycle];
    const subStatus = body.cycle === 'trial' ? 'trialing' : 'active';
    const expiresAt = new Date(Date.now() + days * 86400 * 1000);

    // Cancel any existing active/trialing subscriptions so re-approvals
    // don't accumulate duplicate rows.
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE company_id = $1 AND status IN ('active', 'trialing')`,
      [req.params.id],
    );

    await client.query(
      `INSERT INTO subscriptions (company_id, plan_id, status, amount, started_at, expires_at)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [req.params.id, body.plan_id, subStatus, body.amount, expiresAt],
    );

    await client.query('COMMIT');
    await audit(pool, {
      companyId: req.params.id, userId: reviewedBy,
      action: 'company.approve', entity: 'company', entityId: req.params.id,
      data: { plan_id: body.plan_id, cycle: body.cycle, trial_days: body.trial_days },
    });

    const updated = await pool.query(
      `SELECT ${SIGNUP_COLS} FROM companies c WHERE c.id = $1`,
      [req.params.id],
    );

    const approvedCompany = updated.rows[0];
    if (approvedCompany?.email) {
      const loginUrl = `${env.APP_URL}/login`;
      sendEmail({
        to: approvedCompany.email,
        subject: 'تمت الموافقة على حسابك في ون كليك',
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
            <h2 style="color:#2563eb;margin-bottom:8px">مرحباً بك في ون كليك!</h2>
            <p>تمت مراجعة طلب تسجيل شركتك <strong>${approvedCompany.name ?? ''}</strong> والموافقة عليه.</p>
            <p>يمكنك الآن تسجيل الدخول والبدء في استخدام جميع مميزات المنصة.</p>
            <p style="margin:32px 0">
              <a href="${loginUrl}"
                 style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:16px">
                تسجيل الدخول
              </a>
            </p>
            <p style="color:#6b7280;font-size:13px">إذا لم تطلب هذا الحساب، يمكنك تجاهل هذه الرسالة.</p>
          </div>`,
      }).catch((e: unknown) => console.error('[platform] approval email failed:', (e as Error).message));
    }

    res.json({ data: approvedCompany });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { client.release(); }
});

const declineSchema = z.object({
  reason: z.string().min(1).max(500).optional().default('بدون سبب محدد'),
});

router.patch('/signups/:id/decline', async (req, res, next) => {
  try {
    const body = declineSchema.parse(req.body);
    const reviewedBy = req.auth!.userId;
    const rs = await pool.query(
      `UPDATE companies
         SET is_active = false, review_status = 'declined',
             review_notes = $1, reviewed_at = now(), reviewed_by = $2, updated_at = now()
       WHERE id = $3 RETURNING id`,
      [body.reason, reviewedBy, req.params.id],
    );
    if (!rs.rowCount) throw notFound('Company not found');
    await audit(pool, {
      companyId: req.params.id, userId: reviewedBy,
      action: 'company.decline', entity: 'company', entityId: req.params.id,
      data: { reason: body.reason },
    });
    const updated = await pool.query(
      `SELECT ${SIGNUP_COLS} FROM companies c WHERE c.id = $1`,
      [req.params.id],
    );

    const co = updated.rows[0];
    if (co?.email) {
      sendEmail({
        to: co.email,
        subject: 'بشأن طلب تسجيلك في ون كليك',
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
            <h2 style="color:#1a1a1a;margin-bottom:8px">بشأن طلب تسجيلك</h2>
            <p>شكراً لاهتمامك بمنصة ون كليك.</p>
            <p>بعد مراجعة طلب تسجيل شركتك <strong>${co.name ?? ''}</strong>، نأسف لإبلاغك بأننا لن نتمكن من قبول الطلب في الوقت الحالي.</p>
            ${body.reason && body.reason !== 'بدون سبب محدد'
              ? `<p style="background:#f9fafb;border-right:4px solid #e5e7eb;padding:12px 16px;border-radius:4px"><strong>السبب:</strong> ${body.reason}</p>`
              : ''}
            <p>إذا كانت لديك أسئلة أو تريد الاستفسار، لا تتردد في
              <a href="${env.APP_URL}/contact" style="color:#2563eb;text-decoration:none">التواصل معنا</a>.
            </p>
            <p style="color:#6b7280;font-size:13px;margin-top:32px">فريق ون كليك</p>
          </div>`,
      }).catch((e: unknown) => console.error('[platform] decline email failed:', (e as Error).message));
    }

    res.json({ data: co });
  } catch (e) { next(e); }
});

router.patch('/signups/:id/reset', async (req, res, next) => {
  try {
    const reviewedBy = req.auth!.userId;
    const rs = await pool.query(
      `UPDATE companies
         SET is_active = false, review_status = 'pending',
             review_notes = null, reviewed_at = null, reviewed_by = null, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!rs.rowCount) throw notFound('Company not found');
    await audit(pool, {
      companyId: req.params.id, userId: reviewedBy,
      action: 'company.reset_review', entity: 'company', entityId: req.params.id,
    });
    const updated = await pool.query(
      `SELECT ${SIGNUP_COLS} FROM companies c WHERE c.id = $1`,
      [req.params.id],
    );
    res.json({ data: updated.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/signups/:id', async (req, res, next) => {
  try {
    const company = await pool.query(
      `SELECT id, review_status FROM companies WHERE id = $1`,
      [req.params.id],
    );
    if (!company.rowCount) throw notFound('Company not found');

    if (company.rows[0].review_status !== 'pending') {
      throw badRequest('Only pending signups can be removed. Decline the company first.');
    }

    // Block deletion if the company has any operational data.
    const hasData = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM invoices WHERE company_id = $1) AS has_invoices`,
      [req.params.id],
    );
    if (hasData.rows[0].has_invoices) {
      throw badRequest('This company has existing invoices and cannot be deleted. Decline it instead.');
    }

    await pool.query(`DELETE FROM companies WHERE id = $1`, [req.params.id]);
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'company.delete', entity: 'company', entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/* ---------------- Platform-wide Users (super-admin view) ----------- */
/* ------------------------------------------------------------------ */

router.get('/users', async (req, res, next) => {
  try {
    const p = parsePagination(req);
    const q = (req.query as Record<string, string>).q ?? '';
    const params: unknown[] = [];
    let where = '';
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where = `WHERE lower(u.name) LIKE $1 OR lower(u.email) LIKE $1`;
    }
    const totalQ = await pool.query(
      `SELECT count(*)::int AS count FROM users u ${where}`,
      params,
    );
    const a = p.applyTo(`
      SELECT
        u.id, u.email, u.name, u.is_super_admin, u.created_at,
        json_agg(
          json_build_object(
            'company_id', uc.company_id,
            'company_name', c.name,
            'role', COALESCE(
              (SELECT ur.role FROM user_roles ur
               WHERE ur.user_id = u.id AND ur.company_id = uc.company_id LIMIT 1),
              'viewer'
            )
          )
        ) FILTER (WHERE uc.company_id IS NOT NULL) AS companies
      FROM users u
      LEFT JOIN user_companies uc ON uc.user_id = u.id
      LEFT JOIN companies c ON c.id = uc.company_id
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `, params);
    const rs = await pool.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

const userRoleSchema = z.object({
  company_id: z.string().uuid(),
  role: z.enum(['super_admin', 'company_admin', 'accountant', 'sales', 'viewer']),
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const body = userRoleSchema.parse(req.body);
    const existing = await pool.query(
      `SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [req.params.id, body.company_id],
    );
    if (!existing.rowCount) throw notFound('User not in this company');
    await pool.query(
      `INSERT INTO user_roles (user_id, company_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, company_id, role) DO NOTHING`,
      [req.params.id, body.company_id, body.role],
    );
    await pool.query(
      `DELETE FROM user_roles
       WHERE user_id = $1 AND company_id = $2 AND role != $3`,
      [req.params.id, body.company_id, body.role],
    );
    await audit(pool, {
      companyId: body.company_id, userId: req.auth!.userId,
      action: 'user.role_change', entity: 'user', entityId: req.params.id,
      data: { role: body.role },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;

