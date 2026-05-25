import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';

const schema = z.object({
  product_id:  z.string().uuid(),
  supplier_id: z.string().uuid().optional().nullable(),
  type:        z.enum(['in', 'out', 'adjustment']),
  quantity:    z.coerce.number().positive(),
  reason:      z.string().optional().nullable(),
});

const r = Router();

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const params: unknown[] = [t.companyId];
    let where = `WHERE sm.company_id = $1`;

    const productId = req.query.product_id as string | undefined;
    if (productId) {
      params.push(productId);
      where += ` AND sm.product_id = $${params.length}`;
    }

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM stock_movements sm ${where}`, params,
    );
    const total = Number(totalQ.rows[0]?.count ?? 0);

    const applied = p.applyTo(
      `SELECT sm.*, p.name AS product_name, s.name AS supplier_name
       FROM stock_movements sm
       LEFT JOIN products p ON p.id = sm.product_id
       LEFT JOIN suppliers s ON s.id = sm.supplier_id
       ${where}
       ORDER BY sm.created_at DESC`,
      params,
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, total));
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.parse(req.body);

    const prodRs = await t.db.query(`SELECT * FROM products WHERE id = $1 AND company_id = $2`, [body.product_id, t.companyId]);
    if (!prodRs.rowCount) return res.status(422).json({ error: 'invalid_product', message: 'المنتج غير صالح' });

    if (body.supplier_id) {
      const sRs = await t.db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [body.supplier_id, t.companyId]);
      if (!sRs.rowCount) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    }

    await t.db.query('BEGIN');
    try {
      const ins = await t.db.query(
        `INSERT INTO stock_movements (company_id, product_id, supplier_id, type, quantity, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [t.companyId, body.product_id, body.supplier_id ?? null, body.type, body.quantity, body.reason ?? null, req.user!.id],
      );

      const delta = body.type === 'out' ? -body.quantity : body.quantity;
      await t.db.query(
        `UPDATE products SET quantity = GREATEST(0, quantity + $1) WHERE id = $2`,
        [delta, body.product_id],
      );
      await t.db.query('COMMIT');
      res.status(201).json({ data: ins.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
