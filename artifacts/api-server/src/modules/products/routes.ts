import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { crudRouter } from '../../utils/crud.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { audit } from '../../utils/audit.js';
import { createJournalEntry, getSettings, type JournalLineInput } from '../accounting/posting.js';

const productTypes = ['stock', 'service', 'non_stock', 'expense'] as const;
const vatStatuses = ['taxable', 'exempt', 'zero_rated'] as const;
const accountFields = [
  'sales_account_id',
  'sales_returns_account_id',
  'inventory_account_id',
  'cogs_account_id',
  'purchase_expense_account_id',
  'inventory_adjustment_account_id',
] as const;

const schema = z.object({
  sku:         z.string().optional().nullable(),
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
  product_type: z.enum(productTypes).default('stock'),
  barcode:     z.string().trim().max(120).optional().nullable(),
  price:       z.coerce.number().nonnegative(),
  cost:        z.coerce.number().nonnegative().default(0),
  quantity:    z.coerce.number().int().default(0),
  alert_level: z.coerce.number().int().default(0),
  unit:        z.string().default('قطعة'),
  vat_status:  z.enum(vatStatuses).default('taxable'),
  vat_rate:    z.coerce.number().min(0).max(100).optional().nullable(),
  image_url:   z.string().optional().nullable(),
  is_active:   z.boolean().default(true),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  sales_account_id: z.string().uuid().optional().nullable(),
  sales_returns_account_id: z.string().uuid().optional().nullable(),
  inventory_account_id: z.string().uuid().optional().nullable(),
  cogs_account_id: z.string().uuid().optional().nullable(),
  purchase_expense_account_id: z.string().uuid().optional().nullable(),
  inventory_adjustment_account_id: z.string().uuid().optional().nullable(),
});

async function assertSupplierOwnership(
  db: import('pg').PoolClient,
  companyId: string,
  supplierId: string | null | undefined,
): Promise<boolean> {
  if (!supplierId) return true;
  const rs = await db.query(
    `SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`,
    [supplierId, companyId],
  );
  return (rs.rowCount ?? 0) > 0;
}

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

async function assertAccountOwnership(
  db: import('pg').PoolClient,
  companyId: string,
  body: Partial<z.infer<typeof schema>>,
): Promise<boolean> {
  const ids = accountFields.map((field) => body[field]).filter(Boolean);
  if (!ids.length) return true;
  const rs = await db.query(
    `SELECT id FROM chart_accounts WHERE id = ANY($1::uuid[]) AND company_id = $2 AND is_active = TRUE`,
    [ids, companyId],
  );
  return rs.rows.length === new Set(ids).size;
}

async function companyVatRate(db: import('pg').PoolClient, companyId: string): Promise<number> {
  const rs = await db.query(`SELECT vat_rate FROM companies WHERE id = $1`, [companyId]);
  return Number(rs.rows[0]?.vat_rate ?? 0);
}

async function normaliseProductBody(
  db: import('pg').PoolClient,
  companyId: string,
  body: z.infer<typeof schema>,
): Promise<z.infer<typeof schema>> {
  const barcode = body.barcode?.trim() || null;
  const defaultVat = await companyVatRate(db, companyId);
  const vatRate = body.vat_status === 'taxable'
    ? Number(body.vat_rate ?? defaultVat)
    : 0;
  return { ...body, barcode, vat_rate: vatRate };
}

const base = crudRouter({
  table: 'products',
  fields: [
    'sku','name','description','product_type','barcode','price','cost','quantity','alert_level','unit',
    'vat_status','vat_rate','image_url','is_active','category_id','supplier_id',
    ...accountFields,
  ],
  schema,
  patchSchema: schema.partial(),
  list: {
    selectExtra: `
      (SELECT pc.name FROM product_categories pc WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS category_name,
      (SELECT CASE WHEN pc.parent_id IS NULL THEN pc.id ELSE parent.id END
         FROM product_categories pc
         LEFT JOIN product_categories parent ON parent.id = pc.parent_id AND parent.company_id = pc.company_id
        WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS parent_category_id,
      (SELECT CASE WHEN pc.parent_id IS NULL THEN pc.name ELSE parent.name END
         FROM product_categories pc
         LEFT JOIN product_categories parent ON parent.id = pc.parent_id AND parent.company_id = pc.company_id
        WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS parent_category_name,
      (SELECT CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.id END
         FROM product_categories pc
        WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS subcategory_id,
      (SELECT CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.name END
         FROM product_categories pc
        WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS subcategory_name,
      (SELECT s.name  FROM suppliers s        WHERE s.id  = products.supplier_id  AND s.company_id  = products.company_id)  AS supplier_name
    `.trim(),
    searchable: ['name', 'sku', 'barcode'],
  },
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    if (!ok) return cb(new Error('يجب أن يكون الملف بصيغة CSV'));
    cb(null, true);
  },
});

/** Wrap csvUpload to convert Multer fileFilter/size errors into 4xx JSON responses. */
function csvUploadMiddleware(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) {
  csvUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'حجم الملف يتجاوز الحد المسموح به (5 ميجابايت)' });
      }
      return res.status(400).json({ message: `خطأ في رفع الملف: ${err.message}` });
    }
    // fileFilter rejection (wrong type, etc.)
    if (err instanceof Error) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  });
}

/** Strict nonnegative decimal: allows "0", "10", "10.5" — rejects "10abc", "-5", "". */
function parseNonnegDecimal(raw: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  return Number(raw);
}

/** Strict nonnegative integer: allows "0", "5" — rejects "5.5", "5abc", "-1". */
function parseNonnegInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

function escapeCsvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',');
}


const CSV_HEADERS = ['name','sku','barcode','product_type','description','price','cost','quantity','alert_level','unit','category','supplier','vat_status','vat_rate','status'];
const TEMPLATE_ROW = ['منتج تجريبي','SKU-001','6220000000000','stock','وصف المنتج','100','50','10','3','قطعة','إلكترونيات','مورد تجريبي','taxable','14','active'];

const router = Router();

const openingStockSchema = z.object({
  opening_quantity: z.coerce.number().nonnegative(),
  opening_unit_cost: z.coerce.number().nonnegative(),
  opening_date: z.string().optional(),
  notes: z.string().optional().nullable(),
});

function csvDate(value: unknown) {
  return value ? new Date(value as string).toISOString().slice(0, 10) : '';
}

async function productDetailPayload(db: import('pg').PoolClient, companyId: string, productId: string) {
  const product = await db.query(
    `SELECT p.*,
            pc.name AS category_name,
            CASE WHEN pc.parent_id IS NULL THEN pc.id ELSE parent_pc.id END AS parent_category_id,
            CASE WHEN pc.parent_id IS NULL THEN pc.name ELSE parent_pc.name END AS parent_category_name,
            CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.id END AS subcategory_id,
            CASE WHEN pc.parent_id IS NULL THEN NULL ELSE pc.name END AS subcategory_name,
            s.name AS supplier_name,
            COALESCE(p.sales_account_id, pc.sales_account_id, parent_pc.sales_account_id, aset.sales_revenue_account_id) AS resolved_sales_account_id,
            COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id, aset.inventory_account_id) AS resolved_inventory_account_id,
            COALESCE(p.cogs_account_id, pc.cogs_account_id, parent_pc.cogs_account_id, aset.cogs_account_id) AS resolved_cogs_account_id,
            sa.code AS sales_account_code, sa.name AS sales_account_name,
            ia.code AS inventory_account_code, ia.name AS inventory_account_name,
            ca.code AS cogs_account_code, ca.name AS cogs_account_name,
            EXISTS (
              SELECT 1 FROM stock_ledger sl
              WHERE sl.company_id = p.company_id AND sl.product_id = p.id
            ) AS has_stock_ledger,
            EXISTS (
              SELECT 1 FROM stock_ledger sl
              WHERE sl.company_id = p.company_id AND sl.product_id = p.id AND sl.source_type = 'opening_stock'
            ) AS has_opening_stock
     FROM products p
     LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
     LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.company_id = p.company_id
     LEFT JOIN accounting_settings aset ON aset.company_id = p.company_id
     LEFT JOIN chart_accounts sa ON sa.id = COALESCE(p.sales_account_id, pc.sales_account_id, parent_pc.sales_account_id, aset.sales_revenue_account_id)
     LEFT JOIN chart_accounts ia ON ia.id = COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id, aset.inventory_account_id)
     LEFT JOIN chart_accounts ca ON ca.id = COALESCE(p.cogs_account_id, pc.cogs_account_id, parent_pc.cogs_account_id, aset.cogs_account_id)
     WHERE p.id = $1 AND p.company_id = $2`,
    [productId, companyId],
  );
  if (!product.rowCount) throw notFound('Product not found');

  const sales = await db.query(
    `SELECT i.id, i.number, i.issue_date, ii.quantity, ii.unit_price, ii.line_total, i.status, c.name AS client_name
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id AND i.company_id = ii.company_id
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE ii.company_id = $1 AND ii.product_id = $2
     ORDER BY i.issue_date DESC, i.created_at DESC
     LIMIT 200`,
    [companyId, productId],
  );
  const purchases = await db.query(
    `SELECT pi.id, pi.number, pi.invoice_date, pii.quantity, pii.unit_cost, pii.line_total, pi.status, s.name AS supplier_name
     FROM purchase_invoice_items pii
     JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id AND pi.company_id = pii.company_id
     LEFT JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pii.company_id = $1 AND pii.product_id = $2
     ORDER BY pi.invoice_date DESC, pi.created_at DESC
     LIMIT 200`,
    [companyId, productId],
  );
  const returns = await db.query(
    `SELECT 'credit_note' AS type, cn.id, cn.credit_note_number AS number, cn.credit_note_date AS date, cni.quantity, cni.unit_price AS unit_amount, cni.line_total, cn.status,
            cni.return_condition, cni.return_to_stock
     FROM credit_note_items cni
     JOIN credit_notes cn ON cn.id = cni.credit_note_id AND cn.company_id = cni.company_id
     WHERE cni.company_id = $1 AND cni.product_id = $2
     UNION ALL
     SELECT 'purchase_return' AS type, pr.id, pr.return_number AS number, pr.return_date AS date, pri.quantity, pri.unit_cost AS unit_amount, pri.line_total, pr.status,
            NULL::credit_note_return_condition AS return_condition, NULL::boolean AS return_to_stock
     FROM purchase_return_items pri
     JOIN purchase_returns pr ON pr.id = pri.purchase_return_id AND pr.company_id = pri.company_id
     WHERE pri.company_id = $1 AND pri.product_id = $2
     ORDER BY date DESC
     LIMIT 200`,
    [companyId, productId],
  );
  return { product: product.rows[0], sales: sales.rows, purchases: purchases.rows, returns: returns.rows };
}

async function stockCardRows(db: import('pg').PoolClient, companyId: string, productId: string, query: Record<string, unknown>) {
  const params: unknown[] = [companyId, productId];
  const where = [`sl.company_id = $1`, `sl.product_id = $2`];
  if (typeof query.from === 'string' && query.from) {
    params.push(query.from);
    where.push(`sl.movement_date >= $${params.length}::date`);
  }
  if (typeof query.to === 'string' && query.to) {
    params.push(query.to);
    where.push(`sl.movement_date < ($${params.length}::date + interval '1 day')`);
  }
  const rows = await db.query(
    `SELECT sl.*,
            COALESCE(i.number, pi.number, pr.return_number, cn.credit_note_number, iwo.write_off_number, sm.reason, je.number) AS source_reference,
            je.id AS journal_entry_id,
            je.number AS journal_entry_number
     FROM stock_ledger sl
     LEFT JOIN invoices i ON sl.source_type = 'invoice' AND i.id = sl.source_id AND i.company_id = sl.company_id
     LEFT JOIN purchase_invoices pi ON sl.source_type = 'purchase_invoice' AND pi.id = sl.source_id AND pi.company_id = sl.company_id
     LEFT JOIN purchase_returns pr ON sl.source_type IN ('purchase_return','purchase_return_cancel') AND pr.id = sl.source_id AND pr.company_id = sl.company_id
     LEFT JOIN credit_notes cn ON sl.source_type IN ('credit_note','credit_note_cancel') AND cn.id = sl.source_id AND cn.company_id = sl.company_id
     LEFT JOIN inventory_write_offs iwo ON sl.source_type IN ('write_off','write_off_cancel') AND iwo.id = sl.source_id AND iwo.company_id = sl.company_id
     LEFT JOIN stock_movements sm ON sl.source_id = sm.id AND sm.company_id = sl.company_id
     LEFT JOIN journal_entries je ON je.source_id = sl.source_id AND je.source_type IN ('stock_movement','opening_stock') AND je.company_id = sl.company_id
     WHERE ${where.join(' AND ')}
     ORDER BY sl.movement_date ASC, sl.created_at ASC`,
    params,
  );
  return rows.rows;
}

/* ─── GET /api/products/export ─────────────────────────────── */
router.get('/export', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT
         p.name, p.sku, p.barcode, p.product_type, p.description, p.price, p.cost,
         p.quantity, p.alert_level, p.unit, p.vat_status, p.vat_rate,
         pc.name AS category_name,
         s.name AS supplier_name,
         CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END AS status
       FROM products p
       LEFT JOIN product_categories pc
         ON pc.id = p.category_id AND pc.company_id = p.company_id
       LEFT JOIN suppliers s
         ON s.id = p.supplier_id AND s.company_id = p.company_id
       WHERE p.company_id = $1
       ORDER BY p.created_at ASC`,
      [t.companyId],
    );

    const lines: string[] = [
      toCsvRow(CSV_HEADERS),
      ...rs.rows.map((r) =>
        toCsvRow([
          r.name, r.sku ?? '', r.barcode ?? '', r.product_type, r.description ?? '',
          r.price, r.cost, r.quantity, r.alert_level,
          r.unit, r.category_name ?? '', r.supplier_name ?? '', r.vat_status, r.vat_rate, r.status,
        ]),
      ),
    ];

    const csv = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send('\uFEFF' + csv);
  } catch (e) { next(e); }
});

/* ─── GET /api/products/export/template ────────────────────── */
router.get('/export/template', (_req, res) => {
  const csv = [toCsvRow(CSV_HEADERS), toCsvRow(TEMPLATE_ROW)].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
  res.send('\uFEFF' + csv);
});

/* ─── POST /api/products/import ─────────────────────────────── */
/*
 * Two-phase import via the `dry_run` multipart field:
 *   dry_run=true  → parse + validate every row, NO writes (preview)
 *   dry_run=false → parse, validate, auto-create categories, insert valid rows (commit)
 *
 * Uses csv-parse for full RFC4180 compliance (handles quoted fields, embedded newlines,
 * escaped quotes, CRLF/LF line endings, and UTF-8 BOM stripping).
 */
router.post('/import', csvUploadMiddleware, async (req, res, next) => {
  try {
    const t = req.tenant!;
    if (!req.file) return res.status(400).json({ message: 'يجب رفع ملف CSV' });

    const dryRun = (req.body?.dry_run ?? 'false').toString().toLowerCase() !== 'false';

    // csv-parse handles BOM, CRLF/LF, RFC4180 quoting, and embedded newlines.
    let records: string[][];
    try {
      records = parseCsv(req.file.buffer, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
        encoding: 'utf-8',
      }) as string[][];
    } catch {
      return res.status(422).json({ message: 'ملف CSV غير صالح أو تالف' });
    }

    if (records.length < 2) {
      return res.status(422).json({ message: 'الملف فارغ أو لا يحتوي على بيانات' });
    }

    const headers = records[0].map((h) => h.toLowerCase());
    const colIdx = (name: string) => headers.indexOf(name);
    const iName        = colIdx('name');
    const iSku         = colIdx('sku');
    const iBarcode     = colIdx('barcode');
    const iType        = colIdx('product_type');
    const iDescription = colIdx('description');
    const iPrice       = colIdx('price');
    const iCost        = colIdx('cost');
    const iQuantity    = colIdx('quantity');
    const iAlertLevel  = colIdx('alert_level');
    const iUnit        = colIdx('unit');
    const iCategory    = colIdx('category');
    const iSupplier    = colIdx('supplier');
    const iVatStatus   = colIdx('vat_status');
    const iVatRate     = colIdx('vat_rate');
    const iStatus      = colIdx('status');

    if (iName === -1) {
      return res.status(422).json({ message: 'العمود "name" مطلوب في ملف CSV' });
    }

    interface RowResult {
      row: number;
      name: string;
      error?: string;
      created?: boolean;
    }

    const results: RowResult[] = [];
    let created = 0;

    const categoryCache = new Map<string, string | null>();
    const supplierCache = new Map<string, string | null>();
    const defaultVat = await companyVatRate(t.db, t.companyId);

    const getOrCreateCategoryId = async (catName: string): Promise<string | null> => {
      if (!catName) return null;
      const normalised = catName.trim();
      if (!normalised) return null;
      if (categoryCache.has(normalised)) return categoryCache.get(normalised) ?? null;

      const existing = await t.db.query(
        `SELECT id FROM product_categories WHERE company_id = $1 AND lower(name) = lower($2) LIMIT 1`,
        [t.companyId, normalised],
      );
      if ((existing.rowCount ?? 0) > 0) {
        const id = existing.rows[0].id as string;
        categoryCache.set(normalised, id);
        return id;
      }
      const ins = await t.db.query(
        `INSERT INTO product_categories (company_id, name) VALUES ($1, $2) RETURNING id`,
        [t.companyId, normalised],
      );
      const id = ins.rows[0].id as string;
      categoryCache.set(normalised, id);
      return id;
    };

    const findSupplierId = async (supplierName: string): Promise<string | null> => {
      const normalised = supplierName.trim();
      if (!normalised) return null;
      if (supplierCache.has(normalised)) return supplierCache.get(normalised) ?? null;
      const existing = await t.db.query(
        `SELECT id FROM suppliers WHERE company_id = $1 AND lower(name) = lower($2) LIMIT 1`,
        [t.companyId, normalised],
      );
      const id = existing.rows[0]?.id ?? null;
      supplierCache.set(normalised, id);
      return id;
    };

    // Process data rows (skip header at index 0).
    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      const get = (idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '');
      const csvRowNum = i + 1; // 1-based, counting header as row 1

      const name = get(iName);
      if (!name) {
        results.push({ row: csvRowNum, name: '', error: 'اسم المنتج مطلوب' });
        continue;
      }

      const priceRaw = get(iPrice);
      const costRaw  = get(iCost);
      const qtyRaw   = get(iQuantity);
      const alertRaw = get(iAlertLevel);
      const vatRateRaw = get(iVatRate);

      // Strict parsing: empty = 0; any non-empty value must match the expected format.
      const price    = priceRaw ? parseNonnegDecimal(priceRaw) : 0;
      const cost     = costRaw  ? parseNonnegDecimal(costRaw)  : 0;
      const quantity = qtyRaw   ? parseNonnegInt(qtyRaw)       : 0;
      const alertLvl = alertRaw ? parseNonnegInt(alertRaw)     : 0;
      const vatRateParsed = vatRateRaw ? parseNonnegDecimal(vatRateRaw) : defaultVat;

      if (price    === null) { results.push({ row: csvRowNum, name, error: 'السعر يجب أن يكون رقماً موجباً' }); continue; }
      if (cost     === null) { results.push({ row: csvRowNum, name, error: 'التكلفة يجب أن تكون رقماً موجباً' }); continue; }
      if (quantity === null) { results.push({ row: csvRowNum, name, error: 'الكمية يجب أن تكون عدداً صحيحاً موجباً' }); continue; }
      if (alertLvl === null) { results.push({ row: csvRowNum, name, error: 'حد التنبيه يجب أن يكون عدداً صحيحاً موجباً' }); continue; }
      if (vatRateParsed === null || vatRateParsed > 100) { results.push({ row: csvRowNum, name, error: 'نسبة الضريبة غير صالحة' }); continue; }

      const productType = get(iType) || 'stock';
      if (!productTypes.includes(productType as typeof productTypes[number])) {
        results.push({ row: csvRowNum, name, error: 'نوع المنتج غير صالح' });
        continue;
      }
      const vatStatus = get(iVatStatus) || 'taxable';
      if (!vatStatuses.includes(vatStatus as typeof vatStatuses[number])) {
        results.push({ row: csvRowNum, name, error: 'حالة الضريبة غير صالحة' });
        continue;
      }
      const barcode = get(iBarcode) || null;
      const vatRate = vatStatus === 'taxable' ? vatRateParsed : 0;

      const statusRaw = get(iStatus).toLowerCase();
      const isActive  = statusRaw === '' || statusRaw === 'active' || statusRaw === '1' || statusRaw === 'true';

      if (dryRun) {
        // Preview only — no writes. Unknown categories are valid (will be auto-created on commit).
        results.push({ row: csvRowNum, name, created: true });
        created++;
      } else {
        // Commit — auto-create missing categories and insert valid products.
        let categoryId: string | null = null;
        let supplierId: string | null = null;
        try {
          categoryId = await getOrCreateCategoryId(get(iCategory));
          supplierId = await findSupplierId(get(iSupplier));
        } catch {
          results.push({ row: csvRowNum, name, error: 'تعذّر إنشاء التصنيف' });
          continue;
        }
        if (get(iSupplier) && !supplierId) {
          results.push({ row: csvRowNum, name, error: 'المورد غير موجود' });
          continue;
        }

        try {
          await t.db.query(
            `INSERT INTO products
               (company_id, name, sku, barcode, product_type, description, price, cost, quantity, alert_level, unit, is_active, category_id, supplier_id, vat_status, vat_rate)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              t.companyId,
              name,
              get(iSku)         || null,
              barcode,
              productType,
              get(iDescription) || null,
              price, cost, quantity, alertLvl,
              get(iUnit) || 'قطعة',
              isActive,
              categoryId,
              supplierId,
              vatStatus,
              vatRate,
            ],
          );
          results.push({ row: csvRowNum, name, created: true });
          created++;
        } catch {
          results.push({ row: csvRowNum, name, error: 'تعذّر إدراج المنتج في قاعدة البيانات' });
        }
      }
    }

    const errors = results.filter((r) => r.error);
    res.json({ dry_run: dryRun, created, skipped: errors.length, results });
  } catch (e) { next(e); }
});

router.get('/:id/detail', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const data = await productDetailPayload(t.db, t.companyId, req.params.id);
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/:id/stock-card', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const product = await t.db.query(`SELECT id FROM products WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!product.rowCount) throw notFound('Product not found');
    const rows = await stockCardRows(t.db, t.companyId, req.params.id, req.query);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.get('/:id/stock-card/export', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rows = await stockCardRows(t.db, t.companyId, req.params.id, req.query);
    const headers = ['date','source_type','source_reference','quantity_in','quantity_out','unit_cost','total_value','balance_quantity','balance_value','journal_entry_number'];
    const lines = [
      toCsvRow(headers),
      ...rows.map((r) => toCsvRow([
        csvDate(r.movement_date),
        r.source_type,
        r.source_reference ?? '',
        r.quantity_in,
        r.quantity_out,
        r.unit_cost,
        r.total_value,
        r.balance_quantity,
        r.balance_value,
        r.journal_entry_number ?? '',
      ])),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="product-stock-card.csv"');
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (e) { next(e); }
});

router.post('/:id/opening-stock', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = openingStockSchema.parse(req.body);
    const openingDate = body.opening_date ? new Date(body.opening_date) : new Date();
    const value = round2(body.opening_quantity * body.opening_unit_cost);
    if (value <= 0) throw badRequest('Opening stock value must be greater than zero');

    await t.db.query('BEGIN');
    try {
      const product = await t.db.query(
        `SELECT p.*,
                COALESCE(p.inventory_account_id, pc.inventory_account_id, parent_pc.inventory_account_id, aset.inventory_account_id) AS resolved_inventory_account_id,
                aset.retained_earnings_account_id
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.company_id = p.company_id
         LEFT JOIN product_categories parent_pc ON parent_pc.id = pc.parent_id AND parent_pc.company_id = pc.company_id
         LEFT JOIN accounting_settings aset ON aset.company_id = p.company_id
         WHERE p.id = $1 AND p.company_id = $2 FOR UPDATE`,
        [req.params.id, t.companyId],
      );
      if (!product.rowCount) throw notFound('Product not found');
      const p = product.rows[0];
      if (p.product_type !== 'stock') throw badRequest('Opening stock is allowed only for stock products');

      const existingLedger = await t.db.query(
        `SELECT 1 FROM stock_ledger WHERE company_id = $1 AND product_id = $2 LIMIT 1`,
        [t.companyId, req.params.id],
      );
      if (existingLedger.rowCount) throw badRequest('Opening stock is allowed only before stock ledger entries exist');
      const existingOpening = await t.db.query(
        `SELECT 1 FROM stock_ledger WHERE company_id = $1 AND product_id = $2 AND source_type = 'opening_stock' LIMIT 1`,
        [t.companyId, req.params.id],
      );
      if (existingOpening.rowCount) throw badRequest('Opening stock already exists for this product');

      const settings = await getSettings(t.db, t.companyId);
      const inventoryAccountId = p.resolved_inventory_account_id ?? settings.inventory_account_id;
      const equityAccountId = p.retained_earnings_account_id ?? settings.retained_earnings_account_id;
      if (!inventoryAccountId || !equityAccountId) throw badRequest('Missing inventory or opening balance equity account');

      const movement = await t.db.query(
        `INSERT INTO stock_movements
         (company_id, product_id, type, quantity, reason, created_by, unit_cost, total_value, adjustment_direction)
         VALUES ($1,$2,'in',$3,$4,$5,$6,$7,'increase')
         RETURNING *`,
        [
          t.companyId,
          req.params.id,
          body.opening_quantity,
          body.notes ?? 'Opening stock',
          req.auth!.userId,
          body.opening_unit_cost,
          value,
        ],
      );

      await t.db.query(
        `UPDATE products
         SET quantity = $1, average_cost = $2, inventory_value = $3, cost = $2
         WHERE id = $4 AND company_id = $5`,
        [body.opening_quantity, body.opening_unit_cost, value, req.params.id, t.companyId],
      );
      await t.db.query(
        `INSERT INTO stock_ledger
         (company_id, product_id, source_type, source_id, movement_date, quantity_in, unit_cost, total_value, balance_quantity, balance_value)
         VALUES ($1,$2,'opening_stock',$3,$4,$5,$6,$7,$5,$7)`,
        [t.companyId, req.params.id, movement.rows[0].id, openingDate, body.opening_quantity, body.opening_unit_cost, value],
      );
      const lines: JournalLineInput[] = [
        { accountId: inventoryAccountId, debit: value, description: body.notes ?? 'Opening stock' },
        { accountId: equityAccountId, credit: value, description: body.notes ?? 'Opening stock' },
      ];
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: openingDate,
        memo: `Opening stock ${p.name}`,
        source: { type: 'opening_stock', id: movement.rows[0].id },
        userId: req.auth!.userId,
        lines,
      });
      await t.db.query(`UPDATE stock_movements SET journal_entry_id = $1 WHERE id = $2 AND company_id = $3`, [je.id, movement.rows[0].id, t.companyId]);
      await audit(t.db, {
        companyId: t.companyId,
        userId: req.auth!.userId,
        action: 'product.opening_stock',
        entity: 'product',
        entityId: req.params.id,
        data: { quantity: body.opening_quantity, unit_cost: body.opening_unit_cost, value, journal_entry_id: je.id },
      });
      await t.db.query('COMMIT');
      res.status(201).json({ data: { movement: movement.rows[0], journal_entry_id: je.id } });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = await normaliseProductBody(t.db, t.companyId, schema.parse(req.body));
    const catOk = await assertCategoryOwnership(t.db, t.companyId, parsed.category_id);
    if (!catOk) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    const supOk = await assertSupplierOwnership(t.db, t.companyId, parsed.supplier_id);
    if (!supOk) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    const accountOk = await assertAccountOwnership(t.db, t.companyId, parsed);
    if (!accountOk) return res.status(422).json({ error: 'invalid_account', message: 'الحساب المحاسبي غير صالح' });
    req.body = parsed;
    next();
  } catch (e) { next(e); }
}, base);

router.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const partialSchema = schema.partial();
    const parsed = partialSchema.parse(req.body);
    // Quantity on hand is never directly editable after creation (matches
    // Odoo/QuickBooks/Zoho) — it must always come from an audited stock
    // movement or opening-stock entry so it stays reconciled with the
    // stock ledger and its journal entries. Silently dropped rather than
    // rejected so this endpoint stays usable for updating other fields.
    delete parsed.quantity;
    if ('category_id' in parsed) {
      const catOk = await assertCategoryOwnership(t.db, t.companyId, parsed.category_id);
      if (!catOk) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    }
    if ('supplier_id' in parsed) {
      const supOk = await assertSupplierOwnership(t.db, t.companyId, parsed.supplier_id);
      if (!supOk) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    }
    const accountOk = await assertAccountOwnership(t.db, t.companyId, parsed);
    if (!accountOk) return res.status(422).json({ error: 'invalid_account', message: 'الحساب المحاسبي غير صالح' });
    if ('barcode' in parsed && typeof parsed.barcode === 'string') parsed.barcode = parsed.barcode.trim() || null;
    if ('vat_status' in parsed || 'vat_rate' in parsed) {
      const current = await t.db.query(`SELECT vat_status, vat_rate FROM products WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      const vatStatus = parsed.vat_status ?? current.rows[0]?.vat_status ?? 'taxable';
      parsed.vat_rate = vatStatus === 'taxable'
        ? Number(parsed.vat_rate ?? current.rows[0]?.vat_rate ?? await companyVatRate(t.db, t.companyId))
        : 0;
    }
    req.body = parsed;
    next();
  } catch (e) { next(e); }
}, base);

router.use(base);

export default router;
