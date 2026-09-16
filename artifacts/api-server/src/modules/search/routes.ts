import { Router } from 'express';

const router = Router();

const LIMIT = 5;

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
      return res.json({ data: { clients: [], products: [], invoices: [], suppliers: [] } });
    }
    const like = `%${q}%`;

    const [clients, products, invoices, suppliers] = await Promise.all([
      t.db.query(
        `SELECT id, name, phone, code FROM clients
         WHERE company_id = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR code ILIKE $2)
         ORDER BY name LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT id, name, sku, barcode FROM products
         WHERE company_id = $1 AND (name ILIKE $2 OR sku ILIKE $2 OR barcode ILIKE $2)
         ORDER BY name LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT i.id, i.number, i.status, i.total, c.name AS client_name
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id AND c.company_id = i.company_id
         WHERE i.company_id = $1 AND (i.number ILIKE $2 OR c.name ILIKE $2)
         ORDER BY i.created_at DESC LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT id, name, phone FROM suppliers
         WHERE company_id = $1 AND (name ILIKE $2 OR phone ILIKE $2)
         ORDER BY name LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
    ]);

    res.json({
      data: {
        clients: clients.rows,
        products: products.rows,
        invoices: invoices.rows,
        suppliers: suppliers.rows,
      },
    });
  } catch (e) { next(e); }
});

export default router;
