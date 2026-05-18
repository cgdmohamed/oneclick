import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(200),
});

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT id, name, created_at,
        (SELECT count(*)::int FROM products WHERE category_id = pc.id AND products.company_id = $1) AS product_count
       FROM product_categories pc
       WHERE pc.company_id = $1
       ORDER BY name ASC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const { name } = createSchema.parse(req.body);
    const rs = await t.db.query(
      `INSERT INTO product_categories (company_id, name) VALUES ($1, $2) RETURNING *`,
      [t.companyId, name],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const check = await t.db.query(
      `SELECT count(*)::int AS count FROM products WHERE category_id = $1 AND company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (Number(check.rows[0]?.count) > 0) {
      return res.status(409).json({ error: 'category_in_use', message: 'لا يمكن حذف تصنيف مستخدم في منتجات' });
    }
    const rs = await t.db.query(
      `DELETE FROM product_categories WHERE id = $1 AND company_id = $2`,
      [req.params.id, t.companyId],
    );
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default router;
