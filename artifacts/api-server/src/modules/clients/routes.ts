import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parsePagination } from '../../utils/pagination.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { parseSpreadsheet, buildXlsxBuffer } from '../../utils/spreadsheet.js';
import { ensureAccountingSetup, ensurePartySubAccount, getSettings } from '../accounting/posting.js';

const r = Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      name.endsWith('.csv') || name.endsWith('.xlsx');
    if (!ok) return cb(new Error('يجب أن يكون الملف بصيغة CSV أو Excel (xlsx)'));
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
    if (err instanceof Error) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  });
}

function toCsvRow(fields: unknown[]): string {
  return fields.map((f) => {
    const s = String(f ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

const IMPORT_HEADERS = ['name', 'phone', 'email', 'whatsapp', 'tax_number', 'address', 'notes'];
const IMPORT_TEMPLATE_ROW = ['عميل تجريبي', '01012345678', 'client@example.com', '01012345678', '', 'القاهرة، مصر', ''];

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  // Optional/nullable here so `schema.partial()` keeps working correctly for
  // PATCH (a field not sent should stay unchanged, not become required on
  // every partial update). The CREATE path below enforces the real rule
  // (phone required) via `createSchema`, matching Clients.tsx's own
  // client-side validation instead of silently accepting no phone at all.
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  tax_number: z.string().regex(/^\d*$/, 'Tax number must contain digits only').optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  // Optional link to a supplier record representing the same real-world
  // party (e.g. a wholesaler who is both a customer and a vendor), so a
  // combined statement can show one net balance for them. Does not affect
  // how invoices/purchase invoices post — AR and AP stay separate accounts.
  linked_supplier_id: z.string().uuid().optional().nullable(),
});

const FIELDS = ['name', 'email', 'phone', 'whatsapp', 'tax_number', 'address', 'notes', 'currency', 'linked_supplier_id'] as const;

// Clients.tsx (the only real creation path today) already requires phone
// client-side ("الاسم والهاتف مطلوبان"); the API was silently accepting a
// direct POST with no phone, bypassing that rule for any other caller.
// Enforced explicitly in the POST handler below (not via a stricter zod
// schema) so the error matches this file's existing `badRequest(...)` style
// instead of a generic zod `validation_error` payload, and so `schema`
// itself (shared with `schema.partial()` for PATCH) stays untouched.

async function assertLinkedSupplier(db: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }, companyId: string, supplierId?: string | null) {
  if (!supplierId) return;
  const rs = await db.query(`SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2`, [supplierId, companyId]);
  if (!rs.rowCount) throw badRequest('المورد المرتبط غير صالح');
}

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM clients WHERE company_id = $1`, [t.companyId]);
    const applied = p.applyTo(
      `SELECT * FROM clients WHERE company_id = $1 ORDER BY created_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0]?.count ?? 0)));
  } catch (e) { next(e); }
});

// Registered before `/:id` so Express matches these literal paths instead of
// treating "export"/"import" as a client id.
r.get('/export', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT name, phone, email, whatsapp, tax_number, address, notes
       FROM clients WHERE company_id = $1 ORDER BY created_at ASC`,
      [t.companyId],
    );
    const dataRows: string[][] = rs.rows.map((c) => [
      c.name, c.phone ?? '', c.email ?? '', c.whatsapp ?? '', c.tax_number ?? '', c.address ?? '', c.notes ?? '',
    ]);
    if (req.query.format === 'xlsx') {
      const buf = await buildXlsxBuffer('العملاء', IMPORT_HEADERS, dataRows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="clients.xlsx"');
      return res.send(buf);
    }
    const csv = [toCsvRow(IMPORT_HEADERS), ...dataRows.map((row) => toCsvRow(row))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
    res.send('﻿' + csv);
  } catch (e) { next(e); }
});

r.get('/export/template', async (req, res, next) => {
  try {
    if (req.query.format === 'xlsx') {
      const buf = await buildXlsxBuffer('العملاء', IMPORT_HEADERS, [IMPORT_TEMPLATE_ROW]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="clients-template.xlsx"');
      return res.send(buf);
    }
    const csv = [toCsvRow(IMPORT_HEADERS), toCsvRow(IMPORT_TEMPLATE_ROW)].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clients-template.csv"');
    res.send('﻿' + csv);
  } catch (e) { next(e); }
});

/*
 * Two-phase import (dry_run), same shape as products/chart-accounts import:
 * every row is validated independently (name + phone required, tax number
 * digits-only — the same rules POST / enforces), and a row is always a new
 * client (no upsert-by-name — two clients legitimately sharing a name/phone
 * is allowed elsewhere in this app, just warned about, not merged).
 */
r.post('/import', csvUploadMiddleware, async (req, res, next) => {
  try {
    const t = req.tenant!;
    if (!req.file) return res.status(400).json({ message: 'يجب رفع ملف CSV أو Excel' });
    const dryRun = (req.body?.dry_run ?? 'false').toString().toLowerCase() !== 'false';

    let records: string[][];
    try {
      records = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    } catch {
      return res.status(422).json({ message: 'ملف CSV أو Excel غير صالح أو تالف' });
    }
    if (records.length < 2) return res.status(422).json({ message: 'الملف فارغ أو لا يحتوي على بيانات' });

    const headers = records[0].map((h) => h.toLowerCase());
    const colIdx = (name: string) => headers.indexOf(name);
    const iName      = colIdx('name');
    const iPhone     = colIdx('phone');
    const iEmail     = colIdx('email');
    const iWhatsapp  = colIdx('whatsapp');
    const iTaxNumber = colIdx('tax_number');
    const iAddress   = colIdx('address');
    const iNotes     = colIdx('notes');
    if (iName === -1) return res.status(422).json({ message: 'العمود "name" مطلوب' });
    if (iPhone === -1) return res.status(422).json({ message: 'العمود "phone" مطلوب' });

    interface RowResult { row: number; name: string; error?: string; created?: boolean; }
    const results: RowResult[] = [];
    let created = 0;
    const settings = dryRun ? null : await (async () => { await ensureAccountingSetup(t.db, t.companyId); return getSettings(t.db, t.companyId); })();

    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      const get = (idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '');
      const csvRowNum = i + 1;

      const name = get(iName);
      const phone = get(iPhone);
      const taxNumber = get(iTaxNumber);
      if (!name) { results.push({ row: csvRowNum, name: '', error: 'اسم العميل مطلوب' }); continue; }
      if (!phone) { results.push({ row: csvRowNum, name, error: 'رقم الهاتف مطلوب' }); continue; }
      if (taxNumber && !/^\d+$/.test(taxNumber)) { results.push({ row: csvRowNum, name, error: 'الرقم الضريبي يجب أن يحتوي على أرقام فقط' }); continue; }

      if (dryRun) {
        results.push({ row: csvRowNum, name, created: true });
        created++;
        continue;
      }

      const ins = await t.db.query(
        `INSERT INTO clients (company_id, name, phone, email, whatsapp, tax_number, address, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name`,
        [t.companyId, name, phone, get(iEmail) || null, get(iWhatsapp) || null, taxNumber || null, get(iAddress) || null, get(iNotes) || null],
      );
      const chartAccountId = await ensurePartySubAccount(t.db, t.companyId, settings!.accounts_receivable_account_id, ins.rows[0].name);
      if (chartAccountId) {
        await t.db.query(`UPDATE clients SET chart_account_id = $1 WHERE id = $2`, [chartAccountId, ins.rows[0].id]);
      }
      created++;
      results.push({ row: csvRowNum, name, created: true });
    }

    res.json({
      dry_run: dryRun,
      total: records.length - 1,
      created,
      errors: results.filter((r) => r.error).length,
      results,
    });
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT * FROM clients WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

/**
 * Combined statement for a client that is also linked to a supplier record
 * (same real-world party on both sides). Merges sales invoices/collections
 * with purchase invoices/payouts chronologically and computes a running net
 * balance (positive = the party owes the company; negative = the company
 * owes the party). Purely additive reporting — no journal entries are
 * created or changed, and AR/AP ledger accounts remain untouched.
 */
r.get('/:id/unified-statement', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const clientRs = await t.db.query(
      `SELECT id, name, linked_supplier_id FROM clients WHERE id = $1 AND company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!clientRs.rowCount) throw notFound();
    const client = clientRs.rows[0] as { id: string; name: string; linked_supplier_id: string | null };

    let supplierName: string | null = null;
    if (client.linked_supplier_id) {
      const supRs = await t.db.query(`SELECT name FROM suppliers WHERE id = $1 AND company_id = $2`, [client.linked_supplier_id, t.companyId]);
      supplierName = supRs.rows[0]?.name ?? null;
    }

    // Sales invoices contribute their raw `total` here, NOT the already-netted
    // `remaining` — credit notes, debit notes and bad-debt write-offs are
    // unioned in below as their OWN line items (same pattern as
    // purchase_invoice/payout), so netting them into the invoice line too
    // would double-count. Credit/debit notes also cover STANDALONE notes
    // (no original_invoice_id) — those have no row at all in `invoices`, so
    // they can only ever reach this statement through their own branch.
    const rs = await t.db.query(
      `SELECT date, type, reference, amount, delta FROM (
         SELECT i.issue_date AS date, 'sales_invoice' AS type, i.number AS reference,
                i.total AS amount, i.total AS delta
         FROM invoices i
         WHERE i.client_id = $1 AND i.status NOT IN ('draft','cancelled')
         UNION ALL
         SELECT pay.paid_at, 'collection', COALESCE(inv.number, ''), pay.amount, -pay.amount
         FROM payments pay
         JOIN invoices inv ON inv.id = pay.invoice_id
         WHERE inv.client_id = $1
         UNION ALL
         SELECT cn.credit_note_date, 'credit_note', cn.credit_note_number, cn.total, -cn.total
         FROM credit_notes cn
         WHERE cn.customer_id = $1 AND cn.status = 'posted'
         UNION ALL
         SELECT dn.debit_note_date, 'debit_note', dn.debit_note_number, dn.total, dn.total
         FROM debit_notes dn
         WHERE dn.customer_id = $1 AND dn.status = 'posted'
         UNION ALL
         SELECT pi.invoice_date, 'purchase_invoice', pi.number, pi.total, -pi.total
         FROM purchase_invoices pi
         WHERE $2::uuid IS NOT NULL AND pi.supplier_id = $2 AND pi.status NOT IN ('draft','cancelled')
         UNION ALL
         SELECT po.paid_at, 'payout', COALESCE(po.reference, ''), po.amount, po.amount
         FROM payouts po
         WHERE $2::uuid IS NOT NULL AND po.supplier_id = $2
         UNION ALL
         SELECT sp.paid_at, 'supplier_payment', COALESCE(pi2.number, ''), sp.amount, sp.amount
         FROM supplier_payments sp
         LEFT JOIN purchase_invoices pi2 ON pi2.id = sp.purchase_invoice_id
         WHERE $2::uuid IS NOT NULL AND sp.supplier_id = $2
       ) rows
       ORDER BY date ASC, type ASC`,
      [client.id, client.linked_supplier_id],
    );

    let running = 0;
    const lines = rs.rows.map((row) => {
      running += Number(row.delta);
      return {
        date: row.date,
        type: row.type as 'sales_invoice' | 'collection' | 'credit_note' | 'debit_note' | 'purchase_invoice' | 'payout' | 'supplier_payment',
        reference: row.reference,
        amount: Number(row.amount),
        delta: Number(row.delta),
        running_balance: running,
      };
    });

    res.json({
      data: {
        client: { id: client.id, name: client.name },
        linked_supplier: client.linked_supplier_id ? { id: client.linked_supplier_id, name: supplierName } : null,
        net_balance: running, // positive = party owes company, negative = company owes party
        lines,
      },
    });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const parsed = schema.parse(req.body) as Record<string, unknown>;
    if (!parsed.phone || !String(parsed.phone).trim()) throw badRequest('رقم الهاتف مطلوب');
    await assertLinkedSupplier(t.db, t.companyId, parsed.linked_supplier_id as string | null | undefined);
    // Only insert fields the caller actually sent — passing an explicit NULL
    // for an omitted field (e.g. currency) bypasses its DB DEFAULT and
    // violates its NOT NULL constraint, unlike simply leaving the column out
    // of the INSERT.
    const keys = FIELDS.filter((f) => f in parsed);
    const values = keys.map((f) => parsed[f]);
    const rs = await t.db.query(
      `INSERT INTO clients (company_id, ${keys.join(',')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
      [t.companyId, ...values],
    );
    // Real sub-account under "العملاء" (1100) so the client shows up as its
    // own line in دليل الحسابات, not just a client_id tag on shared lines.
    await ensureAccountingSetup(t.db, t.companyId);
    const settings = await getSettings(t.db, t.companyId);
    const chartAccountId = await ensurePartySubAccount(t.db, t.companyId, settings.accounts_receivable_account_id, rs.rows[0].name);
    if (chartAccountId) {
      await t.db.query(`UPDATE clients SET chart_account_id = $1 WHERE id = $2`, [chartAccountId, rs.rows[0].id]);
      rs.rows[0].chart_account_id = chartAccountId;
    }
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.partial().parse(req.body);
    if ('linked_supplier_id' in body) await assertLinkedSupplier(t.db, t.companyId, body.linked_supplier_id);
    const keys = FIELDS.filter((f) => f in body);
    if (!keys.length) return res.json({ data: null });
    const values = keys.map((f) => (body as Record<string, unknown>)[f]);
    const set = keys.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const rs = await t.db.query(
      `UPDATE clients SET ${set} WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, ...values],
    );
    if (!rs.rowCount) throw notFound();
    if ('name' in body && rs.rows[0].chart_account_id) {
      await t.db.query(`UPDATE chart_accounts SET name = $1 WHERE id = $2 AND company_id = $3`, [body.name, rs.rows[0].chart_account_id, t.companyId]);
    }
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`DELETE FROM clients WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default r;
