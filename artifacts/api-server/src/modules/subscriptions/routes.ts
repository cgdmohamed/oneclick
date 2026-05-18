import { Router } from 'express';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';
import { parsePagination } from '../../utils/pagination.js';

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
      SELECT s.*, p.code AS plan_code, p.name AS plan_name
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1 ORDER BY s.created_at DESC LIMIT 1
    `, [t.companyId]);
    res.json({ data: rs.rows[0] ?? null });
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

// Request a plan change. Manual billing → records a notification for admins;
// the actual switch is performed by a super admin from the Subscriptions page.
router.post('/me/request-change', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const targetPlanId = String((req.body as { plan_id?: string }).plan_id ?? '');
    if (!targetPlanId) return res.status(400).json({ error: 'plan_id required' });
    const plan = await t.db.query(`SELECT id, name FROM plans WHERE id = $1`, [targetPlanId]);
    if (!plan.rowCount) return res.status(404).json({ error: 'Plan not found' });
    await t.db.query(
      `INSERT INTO notifications (company_id, kind, title, body)
       VALUES ($1, 'info', $2, $3)`,
      [t.companyId, 'طلب تغيير باقة',
        `تم طلب الترقية إلى الباقة "${plan.rows[0].name}". في انتظار تأكيد الإدارة.`],
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

export default router;
