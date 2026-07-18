import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  parent_id: z.string().uuid().optional().nullable(),
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

async function assertParent(db: any, companyId: string, categoryId: string | undefined, parentId: string | null | undefined) {
  if (!parentId) return { ok: true };
  if (categoryId && categoryId === parentId) return { ok: false, message: 'لا يمكن أن يكون التصنيف تابعاً لنفسه' };
  const rs = await db.query(
    `SELECT id, parent_id FROM product_categories WHERE id = $1 AND company_id = $2`,
    [parentId, companyId],
  );
  if (!rs.rowCount) return { ok: false, message: 'التصنيف الرئيسي غير صالح' };
  if (rs.rows[0].parent_id) return { ok: false, message: 'يدعم النظام مستويين فقط: تصنيف وتصنيف فرعي' };
  if (categoryId) {
    const children = await db.query(
      `SELECT 1 FROM product_categories WHERE parent_id = $1 AND company_id = $2 LIMIT 1`,
      [categoryId, companyId],
    );
    if (children.rowCount) return { ok: false, message: 'لا يمكن تحويل تصنيف رئيسي يحتوي على تصنيفات فرعية إلى تصنيف فرعي' };
  }
  return { ok: true };
}

const selectCategories = `
  SELECT pc.id, pc.name, pc.parent_id, parent.name AS parent_name, pc.created_at,
    pc.sales_account_id, pc.sales_returns_account_id, pc.inventory_account_id,
    pc.cogs_account_id, pc.purchase_expense_account_id, pc.inventory_adjustment_account_id,
    (SELECT count(*)::int FROM products WHERE category_id = pc.id AND products.company_id = $1) AS product_count,
    (SELECT count(*)::int FROM product_categories child WHERE child.parent_id = pc.id AND child.company_id = $1) AS subcategory_count
  FROM product_categories pc
  LEFT JOIN product_categories parent ON parent.id = pc.parent_id AND parent.company_id = pc.company_id
  WHERE pc.company_id = $1
`;

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `${selectCategories}
       ORDER BY COALESCE(parent.name, pc.name) ASC, pc.parent_id NULLS FIRST, pc.name ASC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

router.get('/tree', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `${selectCategories}
       ORDER BY COALESCE(parent.name, pc.name) ASC, pc.parent_id NULLS FIRST, pc.name ASC`,
      [t.companyId],
    );
    const main = rs.rows.filter((row) => !row.parent_id);
    const subcategories = rs.rows.filter((row) => row.parent_id);
    res.json({
      data: main.map((cat) => ({
        ...cat,
        subcategories: subcategories.filter((sub) => sub.parent_id === cat.id),
      })),
    });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);
    if (!await assertAccounts(t.db, t.companyId, body)) {
      return res.status(422).json({ error: 'invalid_account', message: 'الحساب المحاسبي غير صالح' });
    }
    const parent = await assertParent(t.db, t.companyId, undefined, body.parent_id);
    if (!parent.ok) return res.status(422).json({ error: 'invalid_parent_category', message: parent.message });
    const columns = ['company_id', 'name', 'parent_id', ...accountFields];
    const values = [t.companyId, body.name, body.parent_id ?? null, ...accountFields.map((field) => body[field] ?? null)];
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
    const parent = await assertParent(t.db, t.companyId, req.params.id, body.parent_id);
    if (!parent.ok) return res.status(422).json({ error: 'invalid_parent_category', message: parent.message });
    const entries = Object.entries(body).filter(([key]) => key === 'name' || key === 'parent_id' || (accountFields as readonly string[]).includes(key));
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
      `SELECT
         (SELECT count(*)::int FROM products WHERE category_id = $1 AND company_id = $2) AS product_count,
         (SELECT count(*)::int FROM product_categories WHERE parent_id = $1 AND company_id = $2) AS subcategory_count`,
      [req.params.id, t.companyId],
    );
    if (Number(check.rows[0]?.product_count) > 0) {
      return res.status(409).json({ error: 'category_in_use', message: 'لا يمكن حذف تصنيف مستخدم في منتجات' });
    }
    if (Number(check.rows[0]?.subcategory_count) > 0) {
      return res.status(409).json({ error: 'category_has_children', message: 'لا يمكن حذف تصنيف يحتوي على تصنيفات فرعية' });
    }
    const rs = await t.db.query(
      `DELETE FROM product_categories WHERE id = $1 AND company_id = $2`,
      [req.params.id, t.companyId],
    );
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default router;
