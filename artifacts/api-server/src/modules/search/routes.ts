import { Router } from 'express';

const router = Router();

const LIMIT = 5;

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
      return res.json({
        data: {
          clients: [], products: [], invoices: [], suppliers: [],
          purchaseInvoices: [], creditNotes: [], debitNotes: [],
          journalEntries: [], employees: [], fixedAssets: [], inventoryWriteOffs: [],
        },
      });
    }
    const like = `%${q}%`;

    const [
      clients, products, invoices, suppliers,
      purchaseInvoices, creditNotes, debitNotes,
      journalEntries, employees, fixedAssets, inventoryWriteOffs,
    ] = await Promise.all([
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
      t.db.query(
        `SELECT pi.id, pi.number, pi.status, pi.total, s.name AS supplier_name
         FROM purchase_invoices pi
         LEFT JOIN suppliers s ON s.id = pi.supplier_id AND s.company_id = pi.company_id
         WHERE pi.company_id = $1 AND (pi.number ILIKE $2 OR pi.supplier_number ILIKE $2 OR s.name ILIKE $2)
         ORDER BY pi.created_at DESC LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT cn.id, cn.credit_note_number AS number, cn.status, cn.total, c.name AS customer_name
         FROM credit_notes cn
         LEFT JOIN clients c ON c.id = cn.customer_id AND c.company_id = cn.company_id
         WHERE cn.company_id = $1 AND (cn.credit_note_number ILIKE $2 OR c.name ILIKE $2)
         ORDER BY cn.created_at DESC LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT dn.id, dn.debit_note_number AS number, dn.status, dn.total, c.name AS customer_name
         FROM debit_notes dn
         LEFT JOIN clients c ON c.id = dn.customer_id AND c.company_id = dn.company_id
         WHERE dn.company_id = $1 AND (dn.debit_note_number ILIKE $2 OR c.name ILIKE $2)
         ORDER BY dn.created_at DESC LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT id, number, status, memo FROM journal_entries
         WHERE company_id = $1 AND (number ILIKE $2 OR memo ILIKE $2)
         ORDER BY entry_date DESC LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT id, employee_code, name, status FROM employees
         WHERE company_id = $1 AND (name ILIKE $2 OR employee_code ILIKE $2)
         ORDER BY name LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT id, asset_code, name, status FROM fixed_assets
         WHERE company_id = $1 AND (name ILIKE $2 OR asset_code ILIKE $2)
         ORDER BY name LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
      t.db.query(
        `SELECT id, write_off_number AS number, status, total_cost FROM inventory_write_offs
         WHERE company_id = $1 AND write_off_number ILIKE $2
         ORDER BY created_at DESC LIMIT ${LIMIT}`,
        [t.companyId, like],
      ),
    ]);

    res.json({
      data: {
        clients: clients.rows,
        products: products.rows,
        invoices: invoices.rows,
        suppliers: suppliers.rows,
        purchaseInvoices: purchaseInvoices.rows,
        creditNotes: creditNotes.rows,
        debitNotes: debitNotes.rows,
        journalEntries: journalEntries.rows,
        employees: employees.rows,
        fixedAssets: fixedAssets.rows,
        inventoryWriteOffs: inventoryWriteOffs.rows,
      },
    });
  } catch (e) { next(e); }
});

export default router;
