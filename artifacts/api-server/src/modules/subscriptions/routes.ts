import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';
import { parsePagination } from '../../utils/pagination.js';
import { notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';

const router = Router();

router.get('/features', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT fa.feature_key
      FROM subscriptions s
      JOIN feature_access fa ON fa.plan_id = s.plan_id
      WHERE s.company_id = $1
        AND s.status IN ('active', 'trialing')
        AND fa.enabled = true
      ORDER BY s.created_at DESC
    `, [t.companyId]);
    res.json({ data: rs.rows.map((r: { feature_key: string }) => r.feature_key) });
  } catch (e) { next(e); }
});

router.get('/me', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT s.*,
             s.started_at  AS start_date,
             s.expires_at  AS end_date,
             p.code AS plan_code,
             p.name AS plan_name
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1 ORDER BY s.created_at DESC LIMIT 1
    `, [t.companyId]);
    res.json({ data: rs.rows[0] ?? null });
  } catch (e) { next(e); }
});

// Returns current seat usage (active user count) vs the plan's max_users limit.
router.get('/me/seat-usage', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT
        (SELECT count(*)::int FROM user_companies WHERE company_id = $1) AS used,
        COALESCE(p.max_users, 0) AS seat_limit
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1
        AND s.status IN ('active', 'trialing', 'past_due')
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [t.companyId]);
    const row = rs.rows[0];
    if (!row) return res.json({ data: { used: 0, limit: 0 } });
    res.json({ data: { used: Number(row.used), limit: Number(row.seat_limit) } });
  } catch (e) { next(e); }
});

// Subscription invoice/payment history for the current company.
router.get('/me/payments', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`
      SELECT sp.id, sp.amount, sp.method, sp.paid_at, sp.reference, sp.notes,
             p.name AS plan_name, s.started_at, s.expires_at
      FROM subscription_payments sp
      JOIN subscriptions s ON s.id = sp.subscription_id
      JOIN plans p         ON p.id = s.plan_id
      WHERE s.company_id = $1
      ORDER BY sp.paid_at DESC
    `, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

// Request a plan change. Manual billing → records a confirmation for the requester
// and an admin-targeted system notification for super-admins to act on.
router.post('/me/request-change', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const targetPlanId = String((req.body as { plan_id?: string }).plan_id ?? '');
    if (!targetPlanId) return res.status(400).json({ error: 'plan_id required' });
    const plan = await t.db.query(`SELECT id, name FROM plans WHERE id = $1`, [targetPlanId]);
    if (!plan.rowCount) return res.status(404).json({ error: 'Plan not found' });

    const company = await t.db.query(`SELECT name FROM companies WHERE id = $1`, [t.companyId]);
    const companyName: string = company.rows[0]?.name ?? t.companyId;
    const planName: string = plan.rows[0].name;

    // 1. Confirmation notification for the requester's own tray
    await t.db.query(
      `INSERT INTO notifications (company_id, kind, title, body)
       VALUES ($1, 'info', $2, $3)`,
      [t.companyId, 'طلب تغيير الباقة',
        'تم إرسال طلبك، سيتم مراجعته قريباً.'],
    );

    // 2. Admin-targeted system notification so super-admins can act on it
    await t.db.query(
      `INSERT INTO system_notifications (title, body, audience)
       VALUES ($1, $2, 'admin')`,
      [
        `طلب تغيير باقة — ${companyName}`,
        `طلبت الشركة "${companyName}" الترقية إلى الباقة "${planName}". يرجى مراجعة الاشتراكات واتخاذ الإجراء المناسب.`,
      ],
    );

    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM subscriptions s WHERE s.status != 'cancelled'`);
    const a = p.applyTo(`
      SELECT s.*, c.name AS company_name, p.name AS plan_name
      FROM subscriptions s
      JOIN companies c ON c.id = s.company_id
      JOIN plans p ON p.id = s.plan_id
      WHERE s.status != 'cancelled'
      ORDER BY s.created_at DESC
    `);
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

const changePlanSchema = z.object({
  plan_id:    z.string().uuid(),
  cycle:      z.enum(['monthly', 'yearly', 'trial']),
  trial_days: z.coerce.number().int().min(1).max(365).optional().default(14),
  amount:     z.coerce.number().min(0).optional().default(0),
});

router.patch('/:id/plan', requireSuperAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = changePlanSchema.parse(req.body);

    await client.query('BEGIN');

    const sub = await client.query(
      `SELECT id, company_id FROM subscriptions WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!sub.rowCount) { await client.query('ROLLBACK'); throw notFound('Subscription not found'); }

    const companyId: string = sub.rows[0].company_id;

    const plan = await client.query(`SELECT id FROM plans WHERE id = $1`, [body.plan_id]);
    if (!plan.rowCount) { await client.query('ROLLBACK'); throw notFound('Plan not found'); }

    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE company_id = $1 AND status IN ('active', 'trialing', 'past_due')`,
      [companyId],
    );

    const daysMap: Record<string, number> = { monthly: 30, yearly: 365, trial: body.trial_days };
    const days = daysMap[body.cycle];
    const subStatus = body.cycle === 'trial' ? 'trialing' : 'active';
    const expiresAt = new Date(Date.now() + days * 86400 * 1000);

    const newSub = await client.query(
      `INSERT INTO subscriptions (company_id, plan_id, status, amount, started_at, expires_at)
       VALUES ($1, $2, $3, $4, now(), $5) RETURNING *`,
      [companyId, body.plan_id, subStatus, body.amount, expiresAt],
    );

    await client.query('COMMIT');

    await audit(pool, {
      companyId, userId: req.auth!.userId,
      action: 'subscription.plan_change', entity: 'subscription',
      entityId: newSub.rows[0].id,
      data: { old_subscription_id: req.params.id, plan_id: body.plan_id, cycle: body.cycle, amount: body.amount },
    });

    const result = await pool.query(
      `SELECT s.*, c.name AS company_name, p.name AS plan_name
       FROM subscriptions s
       JOIN companies c ON c.id = s.company_id
       JOIN plans p ON p.id = s.plan_id
       WHERE s.id = $1`,
      [newSub.rows[0].id],
    );

    res.json({ data: result.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

export default router;
