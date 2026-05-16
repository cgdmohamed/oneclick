/**
 * Plans module is mounted in TWO places (see app.ts):
 *   - publicPlansRouter  → GET /api/plans         (pricing page, unauthenticated)
 *   - adminPlansRouter   → POST/PATCH/DELETE /api/plans/*  inside the
 *                          authenticated /api group so `requireSuperAdmin`
 *                          can actually see `req.tenant.isSuperAdmin`. (BUG-03)
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';

const ALLOWED_UPDATE_FIELDS = [
  'code', 'name', 'price_monthly', 'price_yearly',
  'max_users', 'max_invoices_monthly', 'features', 'is_active',
] as const;

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  price_monthly: z.coerce.number().nonnegative(),
  price_yearly: z.coerce.number().nonnegative(),
  max_users: z.coerce.number().int().positive(),
  max_invoices_monthly: z.coerce.number().int().positive(),
  features: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});
const updateSchema = createSchema.partial();

/* ----------------------- PUBLIC (no auth) ----------------------- */
export const publicPlansRouter = Router();

// SCL-08: tiny in-process TTL cache for the public pricing page.
// Plans rarely change; even a 60s cache drops sustained Postgres load to
// effectively zero on a busy /pricing route. Invalidated on admin write below.
let plansCache: { at: number; data: unknown[] } | null = null;
const PLANS_TTL_MS = 60_000;
const invalidatePlansCache = () => { plansCache = null; };

publicPlansRouter.get('/', async (_req, res, next) => {
  try {
    if (plansCache && Date.now() - plansCache.at < PLANS_TTL_MS) {
      return res.json({ data: plansCache.data, cached: true });
    }
    const rs = await pool.query(`SELECT * FROM plans WHERE is_active = true ORDER BY price_monthly`);
    plansCache = { at: Date.now(), data: rs.rows };
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

/* ----------------------- ADMIN (super_admin) ----------------------- */
export const adminPlansRouter = Router();

adminPlansRouter.get('/all', requireSuperAdmin, async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT * FROM plans ORDER BY price_monthly`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

adminPlansRouter.post('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body);
    const rs = await pool.query(
      `INSERT INTO plans (code,name,price_monthly,price_yearly,max_users,max_invoices_monthly,features,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.code, b.name, b.price_monthly, b.price_yearly, b.max_users,
       b.max_invoices_monthly, b.features, b.is_active],
    );
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'plan.create', entity: 'plan', entityId: rs.rows[0].id, data: b,
    });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

adminPlansRouter.patch('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    // SEC-09: only allow known column names — never trust the field list.
    const fields = (Object.keys(body) as Array<keyof typeof body>)
      .filter((k) => (ALLOWED_UPDATE_FIELDS as readonly string[]).includes(k as string));
    if (fields.length === 0) return res.json({ data: null });
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...fields.map((f) => (body as Record<string, unknown>)[f as string]), req.params.id];
    const rs = await pool.query(
      `UPDATE plans SET ${set} WHERE id = $${values.length} RETURNING *`, values,
    );
    if (!rs.rowCount) throw notFound();
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'plan.update', entity: 'plan', entityId: req.params.id, data: body,
    });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

adminPlansRouter.delete('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const rs = await pool.query(
      `UPDATE plans SET is_active = false WHERE id = $1 RETURNING id`, [req.params.id],
    );
    if (!rs.rowCount) throw notFound();
    await audit(pool, {
      companyId: null, userId: req.auth!.userId,
      action: 'plan.deactivate', entity: 'plan', entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Default export kept for backwards compatibility in case other code imports it.
export default publicPlansRouter;
