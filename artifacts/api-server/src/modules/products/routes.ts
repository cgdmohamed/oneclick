import { Router } from 'express';
import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  sku: z.string().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.coerce.number().nonnegative(),
  cost: z.coerce.number().nonnegative().default(0),
  quantity: z.coerce.number().int().default(0),
  alert_level: z.coerce.number().int().default(0),
  unit: z.string().default('قطعة'),
  image_url: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  category_id: z.string().uuid().optional().nullable(),
});

async function assertCategoryOwnership(
  db: import('pg').PoolClient,
  companyId: string,
  categoryId: string | null | undefined,
): Promise<boolean> {
  if (!categoryId) return true;
  const rs = await db.query(
    `SELECT 1 FROM product_categories WHERE id = $1 AND company_id = $2`,
    [categoryId, companyId],
  );
  return (rs.rowCount ?? 0) > 0;
}

const base = crudRouter({
  table: 'products',
  fields: ['sku','name','description','price','cost','quantity','alert_level','unit','image_url','is_active','category_id'],
  schema,
  patchSchema: schema.partial(),
  list: {
    selectExtra: `(SELECT pc.name FROM product_categories pc WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS category_name`,
  },
});

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = schema.parse(req.body);
    const ok = await assertCategoryOwnership(t.db, t.companyId, parsed.category_id);
    if (!ok) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    next();
  } catch (e) { next(e); }
}, base);

router.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = schema.partial().parse(req.body);
    if ('category_id' in parsed) {
      const ok = await assertCategoryOwnership(t.db, t.companyId, parsed.category_id);
      if (!ok) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    }
    next();
  } catch (e) { next(e); }
}, base);

router.use(base);

export default router;
