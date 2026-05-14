import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rs = await pool.query(`SELECT * FROM plans WHERE is_active = true ORDER BY price_monthly`);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  price_monthly: z.coerce.number().nonnegative(),
  price_yearly: z.coerce.number().nonnegative(),
  max_users: z.coerce.number().int().positive(),
  max_invoices_monthly: z.coerce.number().int().positive(),
  features: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});

router.post('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const b = schema.parse(req.body);
    const rs = await pool.query(
      `INSERT INTO plans (code,name,price_monthly,price_yearly,max_users,max_invoices_monthly,features,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.code, b.name, b.price_monthly, b.price_yearly, b.max_users, b.max_invoices_monthly, b.features, b.is_active],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

export default router;
