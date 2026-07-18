import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  sales_account_id: z.string().uuid().optional().nullable(),
  sales_returns_account_id: z.string().uuid().optional().nullable(),
  inventory_account_id: z.string().uuid().optional().nullable(),
  cogs_account_id: z.string().uuid().optional().nullable(),
  purchase_expense_account_id: z.string().uuid().optional().nullable(),
  inventory_adjustment_account_id: z.string().uuid().optional().nullable(),
});

const accountFields = [
  'sales_account_id',
  'sales_returns_account_id',
  'inventory_account_id',
  'cogs_account_id',
  'purchase_expense_account_id',
  'inventory_adjustment_account_id',
] as const;

async function assertAccounts(db: any, companyId: string, body: Partial<z.infer<typeof createSchema>>) {
  const ids = accountFields.map((field) => body[field]).filter(Boolean);
  if (!ids.length) return true;
  const rs = await db.query(
    `SELECT id FROM chart_accounts WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active = TRUE`,
    [companyId, ids],
  );
  return rs.rows.length === new Set(ids).size;
}

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT id, name, created_at,
        sales_account_id, sales_returns_account_id, inventory_account_id,
        cogs_account_id, purchase_expense_account_id, inventory_adjustment_account_id,
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
    const body = createSchema.parse(req.body);
    if (!await assertAccounts(t.db, t.companyId, body)) {
      return res.status(422).json({ error: 'invalid_account', message: 'الحساب المحاسبي غير صالح' });
    }
    const columns = ['company_id', 'name', ...accountFields];
    const values = [t.companyId, body.name, ...accountFields.map((field) => body[field] ?? null)];
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
    const rs = await t.db.query(
      `INSERT INTO product_categories (${columns.join(',')}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.partial().parse(req.body);
    if (!await assertAccounts(t.db, t.companyId, body)) {
      return res.status(422).json({ error: 'invalid_account', message: 'الحساب المحاسبي غير صالح' });
    }
    const entries = Object.entries(body).filter(([key]) => key === 'name' || (accountFields as readonly string[]).includes(key));
    if (!entries.length) return res.json({ data: null });
    const set = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const rs = await t.db.query(
      `UPDATE product_categories SET ${set} WHERE id = $${entries.length + 1} AND company_id = $${entries.length + 2} RETURNING *`,
      [...entries.map(([, value]) => value), req.params.id, t.companyId],
    );
    if (!rs.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ data: rs.rows[0] });
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
