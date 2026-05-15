import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT * FROM plans WHERE is_active = true ORDER BY price_monthly`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

// Super-admin: list ALL plans (including inactive)
router.get('/all', requireSuperAdmin, async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT * FROM plans ORDER BY price_monthly`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

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

router.post('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body);
    const rs = await pool.query(
      `INSERT INTO plans (code,name,price_monthly,price_yearly,max_users,max_invoices_monthly,features,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.code, b.name, b.price_monthly, b.price_yearly, b.max_users, b.max_invoices_monthly, b.features, b.is_active],
    );
    await audit(pool, { companyId: null, userId: req.user!.id, action: 'plan.create', entity: 'plan', entityId: rs.rows[0].id, meta: b });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const fields = Object.keys(body);
    if (fields.length === 0) return res.json({ data: null });
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...Object.values(body), req.params.id];
    const rs = await pool.query(`UPDATE plans SET ${set} WHERE id = $${values.length} RETURNING *`, values);
    if (!rs.rowCount) throw notFound();
    await audit(pool, { companyId: null, userId: req.user!.id, action: 'plan.update', entity: 'plan', entityId: req.params.id, meta: body });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    // soft-delete by deactivating to preserve subscription history
    const rs = await pool.query(`UPDATE plans SET is_active = false WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rs.rowCount) throw notFound();
    await audit(pool, { companyId: null, userId: req.user!.id, action: 'plan.deactivate', entity: 'plan', entityId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
