import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  sku:         z.string().optional().nullable(),
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
  price:       z.coerce.number().nonnegative(),
  cost:        z.coerce.number().nonnegative().default(0),
  quantity:    z.coerce.number().int().default(0),
  alert_level: z.coerce.number().int().default(0),
  unit:        z.string().default('قطعة'),
  image_url:   z.string().optional().nullable(),
  is_active:   z.boolean().default(true),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
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

const base = crudRouter({
  table: 'products',
  fields: ['sku','name','description','price','cost','quantity','alert_level','unit','image_url','is_active','category_id','supplier_id'],
  schema,
  patchSchema: schema.partial(),
  list: {
    selectExtra: `
      (SELECT pc.name FROM product_categories pc WHERE pc.id = products.category_id AND pc.company_id = products.company_id) AS category_name,
      (SELECT s.name  FROM suppliers s        WHERE s.id  = products.supplier_id  AND s.company_id  = products.company_id)  AS supplier_name
    `.trim(),
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


const CSV_HEADERS = ['name','sku','description','price','cost','quantity','alert_level','unit','category','status'];
const TEMPLATE_ROW = ['منتج تجريبي','SKU-001','وصف المنتج','100','50','10','3','قطعة','إلكترونيات','active'];

const router = Router();

/* ─── GET /api/products/export ─────────────────────────────── */
router.get('/export', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT
         p.name, p.sku, p.description, p.price, p.cost,
         p.quantity, p.alert_level, p.unit,
         pc.name AS category_name,
         CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END AS status
       FROM products p
       LEFT JOIN product_categories pc
         ON pc.id = p.category_id AND pc.company_id = p.company_id
       WHERE p.company_id = $1
       ORDER BY p.created_at ASC`,
      [t.companyId],
    );

    const lines: string[] = [
      toCsvRow(CSV_HEADERS),
      ...rs.rows.map((r) =>
        toCsvRow([
          r.name, r.sku ?? '', r.description ?? '',
          r.price, r.cost, r.quantity, r.alert_level,
          r.unit, r.category_name ?? '', r.status,
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
    const iDescription = colIdx('description');
    const iPrice       = colIdx('price');
    const iCost        = colIdx('cost');
    const iQuantity    = colIdx('quantity');
    const iAlertLevel  = colIdx('alert_level');
    const iUnit        = colIdx('unit');
    const iCategory    = colIdx('category');
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

      // Strict parsing: empty = 0; any non-empty value must match the expected format.
      const price    = priceRaw ? parseNonnegDecimal(priceRaw) : 0;
      const cost     = costRaw  ? parseNonnegDecimal(costRaw)  : 0;
      const quantity = qtyRaw   ? parseNonnegInt(qtyRaw)       : 0;
      const alertLvl = alertRaw ? parseNonnegInt(alertRaw)     : 0;

      if (price    === null) { results.push({ row: csvRowNum, name, error: 'السعر يجب أن يكون رقماً موجباً' }); continue; }
      if (cost     === null) { results.push({ row: csvRowNum, name, error: 'التكلفة يجب أن تكون رقماً موجباً' }); continue; }
      if (quantity === null) { results.push({ row: csvRowNum, name, error: 'الكمية يجب أن تكون عدداً صحيحاً موجباً' }); continue; }
      if (alertLvl === null) { results.push({ row: csvRowNum, name, error: 'حد التنبيه يجب أن يكون عدداً صحيحاً موجباً' }); continue; }

      const statusRaw = get(iStatus).toLowerCase();
      const isActive  = statusRaw === '' || statusRaw === 'active' || statusRaw === '1' || statusRaw === 'true';

      if (dryRun) {
        // Preview only — no writes. Unknown categories are valid (will be auto-created on commit).
        results.push({ row: csvRowNum, name, created: true });
        created++;
      } else {
        // Commit — auto-create missing categories and insert valid products.
        let categoryId: string | null = null;
        try {
          categoryId = await getOrCreateCategoryId(get(iCategory));
        } catch {
          results.push({ row: csvRowNum, name, error: 'تعذّر إنشاء التصنيف' });
          continue;
        }

        try {
          await t.db.query(
            `INSERT INTO products
               (company_id, name, sku, description, price, cost, quantity, alert_level, unit, is_active, category_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              t.companyId,
              name,
              get(iSku)         || null,
              get(iDescription) || null,
              price, cost, quantity, alertLvl,
              get(iUnit) || 'قطعة',
              isActive,
              categoryId,
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

router.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = schema.parse(req.body);
    const catOk = await assertCategoryOwnership(t.db, t.companyId, parsed.category_id);
    if (!catOk) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    const supOk = await assertSupplierOwnership(t.db, t.companyId, parsed.supplier_id);
    if (!supOk) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    next();
  } catch (e) { next(e); }
}, base);

router.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = schema.partial().parse(req.body);
    if ('category_id' in parsed) {
      const catOk = await assertCategoryOwnership(t.db, t.companyId, parsed.category_id);
      if (!catOk) return res.status(422).json({ error: 'invalid_category', message: 'التصنيف غير صالح' });
    }
    if ('supplier_id' in parsed) {
      const supOk = await assertSupplierOwnership(t.db, t.companyId, parsed.supplier_id);
      if (!supOk) return res.status(422).json({ error: 'invalid_supplier', message: 'المورد غير صالح' });
    }
    next();
  } catch (e) { next(e); }
}, base);

router.use(base);

export default router;
