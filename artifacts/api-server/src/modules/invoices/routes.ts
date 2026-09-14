import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { sendEmail } from '../../utils/email.js';
import { renderEmail } from '../../utils/emailTemplate.js';
import { getCompanyBranding } from '../../utils/platformBranding.js';
import { env } from '../../config/env.js';
import { enforceInvoiceLimit } from '../../middleware/planLimits.js';
import { parsePagination } from '../../utils/pagination.js';

import { round2 } from '../../utils/money.js';
import { assertBranch, assertCostCenter } from '../../utils/dimensions.js';
import { internalKindSchema } from '../notifications/kinds.js';
import { assertPeriodOpen, postCustomerPayment, postSalesInvoice, reverseJournalEntry } from '../accounting/posting.js';

const router = Router();
const EGP_CURRENCY_SYMBOL = 'ج.م';

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  vat_rate: z.coerce.number().min(0).max(100).optional().nullable(),
});

const internalAttachmentSchema = z.object({
  type: z.enum(['text', 'image']),
  text: z.string().optional().nullable(),
  upload_id: z.string().uuid().optional().nullable(),
}).optional().nullable();

const createSchema = z.object({
  client_id: z.string().uuid(),
  issue_date: z.string().datetime().optional(),
  due_date: z.string().datetime().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  internal_attachment: internalAttachmentSchema,
  discount: z.coerce.number().nonnegative().default(0),
  items: z.array(itemSchema).min(1),
  draft: z.boolean().optional().default(false),
  initial_collection: z.object({
    amount: z.coerce.number().nonnegative().default(0),
    account_id: z.string().uuid().optional().nullable(),
    method: z.string().default('cash'),
    reference: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).optional().nullable(),
});

function buildNumber(prefix: string, seq: number, year: number, fmt: string, sep: string, pad: number) {
  const yearPart = fmt === 'none' ? '' : fmt === 'short' ? String(year).slice(-2) : String(year);
  const seqPart  = String(Math.max(0, Math.floor(seq))).padStart(Math.max(1, pad), '0');
  return [prefix, yearPart, seqPart].filter(Boolean).join(sep);
}

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const p = parsePagination(req);
    const q = (req.query.q as string | undefined)?.trim();
    const status = (req.query.status as string | undefined)?.trim();

    const params: unknown[] = [t.companyId];
    const where: string[] = ['i.company_id = $1'];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(i.number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`i.status = $${params.length}`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM invoices i JOIN clients c ON c.id = i.client_id ${whereSql}`,
      params,
    );
    const a = p.applyTo(
      `SELECT i.*, c.name AS client_name
         FROM invoices i JOIN clients c ON c.id = i.client_id
         ${whereSql}
         ORDER BY i.created_at DESC`,
      params,
    );
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const inv = await t.db.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email, c.tax_number AS client_tax,
              c.phone AS client_phone, c.whatsapp AS client_whatsapp,
              u.filename AS internal_attachment_filename,
              u.mime_type AS internal_attachment_mime_type,
              u.url AS internal_attachment_url
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN uploads u ON u.id = i.internal_attachment_upload_id AND u.company_id = i.company_id
       WHERE i.id = $1 AND i.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!inv.rowCount) throw notFound('Invoice not found');
    const items = await t.db.query(`SELECT * FROM invoice_items WHERE invoice_id = $1 AND company_id = $2 ORDER BY created_at`, [req.params.id, t.companyId]);
    const pays  = await t.db.query(`SELECT * FROM payments WHERE invoice_id = $1 AND company_id = $2 ORDER BY paid_at DESC`, [req.params.id, t.companyId]);
    res.json({ data: { ...inv.rows[0], items: items.rows, payments: pays.rows } });
  } catch (e) { next(e); }
});

router.post('/', enforceInvoiceLimit(), async (req, res, next) => {
  let txStarted = false;
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);
    await assertBranch(t.db, t.companyId, body.branch_id);
    for (const item of body.items) await assertCostCenter(t.db, t.companyId, item.cost_center_id);

    await t.db.query('BEGIN');
    txStarted = true;

    const compRes = await t.db.query(
      `SELECT invoice_prefix, invoice_sequence, invoice_year_format, invoice_padding, invoice_separator, vat_rate
       FROM companies WHERE id = $1 FOR UPDATE`,
      [t.companyId],
    );
    if (!compRes.rowCount) throw badRequest('Company missing');
    const cfg = compRes.rows[0];
    const newSeq = cfg.invoice_sequence + 1;
    const issueDate = body.issue_date ? new Date(body.issue_date) : new Date();
    await assertPeriodOpen(t.db, t.companyId, issueDate);

    // Resolve prefix: company-level customisation → platform general setting → 'INV'
    // A company prefix that still equals the schema default 'INV' is treated as
    // "not customised" so the platform setting can supply the intended default.
    let resolvedPrefix: string = cfg.invoice_prefix;
    if (resolvedPrefix === 'INV') {
      const platformRow = await pool.query(
        `SELECT value FROM platform_settings WHERE key = 'general'`,
      );
      const platformPrefix =
        (platformRow.rows[0]?.value as Record<string, unknown> | undefined)?.invoicePrefix;
      if (typeof platformPrefix === 'string' && platformPrefix.trim()) {
        resolvedPrefix = platformPrefix.trim();
      }
    }

    const number = buildNumber(
      resolvedPrefix, newSeq, issueDate.getFullYear(),
      cfg.invoice_year_format, cfg.invoice_separator, cfg.invoice_padding,
    );
    await t.db.query(`UPDATE companies SET invoice_sequence = $1 WHERE id = $2`, [newSeq, t.companyId]);

    const productIds = [...new Set(body.items.map((it) => it.product_id).filter(Boolean))];
    const productDefaults = productIds.length
      ? await t.db.query(
          `SELECT id, product_type, vat_status, vat_rate
           FROM products WHERE company_id = $1 AND id = ANY($2::uuid[])`,
          [t.companyId, productIds],
        )
      : { rows: [] as any[] };
    const productMap = new Map(productDefaults.rows.map((row) => [row.id, row]));
    const defaultVatRate = Number(cfg.vat_rate ?? 0);
    const items = body.items.map((it) => {
      const product = it.product_id ? productMap.get(it.product_id) : null;
      const vatRate = it.vat_rate ?? (product?.vat_status === 'taxable' ? Number(product.vat_rate ?? defaultVatRate) : product ? 0 : defaultVatRate);
      return { ...it, vat_rate: vatRate };
    });

    const lineBases = items.map((it) => round2(it.quantity * it.unit_price));
    const lineDiscounts = items.map((it, index) => round2(Math.min(Number(it.discount ?? 0), lineBases[index] ?? 0)));
    const lineNets = lineBases.map((line, index) => round2(Math.max(0, line - (lineDiscounts[index] ?? 0))));
    const subtotal = round2(lineBases.reduce((sum, line) => sum + line, 0));
    const itemDiscount = round2(lineDiscounts.reduce((sum, line) => sum + line, 0));
    const headerDiscount = round2(Math.min(Number(body.discount), Math.max(0, subtotal - itemDiscount)));
    const discount = round2(itemDiscount + headerDiscount);
    const headerDiscountBase = round2(lineNets.reduce((sum, line) => sum + line, 0));
    let vat = 0;
    for (const [index, it] of items.entries()) {
      const line = lineNets[index] ?? 0;
      const allocatedDiscount = headerDiscountBase > 0 ? round2(headerDiscount * (line / headerDiscountBase)) : 0;
      const taxableLine = round2(Math.max(0, line - allocatedDiscount));
      vat = round2(vat + taxableLine * (it.vat_rate / 100));
    }
    const total = round2(Math.max(0, subtotal - discount + vat));
    const internalAttachment = body.internal_attachment;
    let internalAttachmentType: 'text' | 'image' | null = null;
    let internalAttachmentText: string | null = null;
    let internalAttachmentUploadId: string | null = null;
    if (internalAttachment?.type === 'text') {
      const text = internalAttachment.text?.trim() ?? '';
      if (!text) throw badRequest('Internal attachment text is required');
      internalAttachmentType = 'text';
      internalAttachmentText = text;
    } else if (internalAttachment?.type === 'image') {
      if (!internalAttachment.upload_id) throw badRequest('Internal attachment image is required');
      const upload = await t.db.query(
        `SELECT id, mime_type, is_public
           FROM uploads
          WHERE id = $1 AND company_id = $2`,
        [internalAttachment.upload_id, t.companyId],
      );
      if (!upload.rowCount) throw badRequest('Internal attachment upload not found');
      if (!String(upload.rows[0].mime_type).startsWith('image/')) throw badRequest('Internal attachment must be an image');
      if (upload.rows[0].is_public) throw badRequest('Internal attachment must be private');
      internalAttachmentType = 'image';
      internalAttachmentText = internalAttachment.text?.trim() || null;
      internalAttachmentUploadId = internalAttachment.upload_id;
    }
    const initialAmount = round2(Number(body.initial_collection?.amount ?? 0));
    if (body.draft && initialAmount > 0) throw badRequest('Initial collection is not allowed for draft invoices');
    if (initialAmount > total) throw badRequest('Initial collection exceeds invoice total');
    if (initialAmount > 0 && !body.initial_collection?.account_id) throw badRequest('Receiving account is required for initial collection');
    if (initialAmount > 0) {
      const account = await t.db.query(`SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [body.initial_collection!.account_id, t.companyId]);
      if (!account.rowCount) throw badRequest('Active receiving account not found');
    }

    const invoiceStatus = body.draft ? 'draft' : 'sent';
    const invRes = await t.db.query(`
      INSERT INTO invoices (company_id, number, client_id, issue_date, due_date, status,
                            subtotal, vat_amount, discount, total, paid, remaining, notes,
                            internal_attachment_type, internal_attachment_text, internal_attachment_upload_id,
                            branch_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [t.companyId, number, body.client_id, issueDate, body.due_date ?? null,
        invoiceStatus, subtotal, vat, discount, total, body.notes ?? null,
        internalAttachmentType, internalAttachmentText, internalAttachmentUploadId,
        body.branch_id ?? null, req.auth!.userId]);
    const invoice = invRes.rows[0];

    for (const [index, it] of items.entries()) {
      const lineBase = lineBases[index] ?? round2(it.quantity * it.unit_price);
      const itemDiscountForLine = lineDiscounts[index] ?? 0;
      const lineNet = round2(Math.max(0, lineBase - itemDiscountForLine));
      const line = round2(lineNet * (1 + it.vat_rate / 100));
      await t.db.query(`
        INSERT INTO invoice_items (company_id, invoice_id, product_id, description, quantity, unit_price, discount, vat_rate, line_total, cost_center_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [t.companyId, invoice.id, it.product_id ?? null, it.description, it.quantity, it.unit_price, itemDiscountForLine, it.vat_rate, line, it.cost_center_id ?? null]);

      if (it.product_id) {
        const productCost = await t.db.query(
          `SELECT product_type, COALESCE(NULLIF(average_cost, 0), cost, 0) AS unit_cost
           FROM products WHERE id = $1 AND company_id = $2`,
          [it.product_id, t.companyId],
        );
        if (!productCost.rowCount) throw badRequest(`Invalid product for "${it.description}"`);
        if (productCost.rows[0].product_type !== 'stock') continue;
        const unitCost = Number(productCost.rows[0]?.unit_cost ?? 0);
        const cogsValue = round2(it.quantity * unitCost);
        // DAT-05: refuse to oversell. The CHECK-style update returns 0 rows
        // when the product would go negative; we surface a clean 400.
        const stock = await t.db.query(
          `UPDATE products
           SET quantity = quantity - $1,
               inventory_value = GREATEST(0, inventory_value - $4)
           WHERE id = $2 AND company_id = $3 AND quantity >= $1
           RETURNING id, quantity, inventory_value`,
          [it.quantity, it.product_id, t.companyId, cogsValue],
        );
        if (!stock.rowCount) {
          throw badRequest(`Insufficient stock for "${it.description}"`);
        }
        await t.db.query(
          `INSERT INTO stock_ledger
           (company_id, product_id, source_type, source_id, movement_date, quantity_out, unit_cost, total_value, balance_quantity, balance_value)
           VALUES ($1,$2,'invoice',$3,$4,$5,$6,$7,$8,$9)`,
          [t.companyId, it.product_id, invoice.id, issueDate, it.quantity, unitCost, cogsValue, stock.rows[0].quantity, stock.rows[0].inventory_value],
        );
      }
    }

    if (!body.draft) {
      await postSalesInvoice(t.db, t.companyId, invoice.id, req.auth!.userId);
      if (initialAmount > 0) {
        const payment = await t.db.query(
          `INSERT INTO payments
           (company_id, invoice_id, client_id, collection_type, account_id, amount, paid_at, method, reference, notes, branch_id, created_by)
           VALUES ($1,$2,$3,'invoice_collection',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            t.companyId,
            invoice.id,
            body.client_id,
            body.initial_collection!.account_id,
            initialAmount,
            issueDate,
            body.initial_collection!.method,
            body.initial_collection!.reference ?? null,
            body.initial_collection!.notes ?? null,
            body.branch_id ?? null,
            req.auth!.userId,
          ],
        );
        const remaining = round2(Math.max(0, total - initialAmount));
        const status = remaining <= 0.005 ? 'paid' : 'partial';
        await t.db.query(
          `UPDATE invoices SET paid = $1, remaining = $2, status = $3 WHERE id = $4 AND company_id = $5`,
          [initialAmount, remaining, status, invoice.id, t.companyId],
        );
        await t.db.query(
          `UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND company_id = $3`,
          [initialAmount, body.initial_collection!.account_id, t.companyId],
        );
        await postCustomerPayment(t.db, t.companyId, payment.rows[0].id, req.auth!.userId);
        invoice.paid = initialAmount;
        invoice.remaining = remaining;
        invoice.status = status;
      }
    }

    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: body.draft ? 'invoice.draft' : 'invoice.create',
      entity: 'invoice', entityId: invoice.id,
      data: { number, total, items: body.items.length, draft: body.draft },
    });

    await t.db.query('COMMIT');
    txStarted = false;
    res.status(201).json({ data: invoice });
  } catch (e) {
    if (txStarted) {
      try { await req.tenant?.db.query('ROLLBACK'); } catch { /* ignore rollback errors */ }
    }
    next(e);
  }
});

/** Promote a draft invoice to sent and trigger the email notification flow. */
router.post('/:id/send', enforceInvoiceLimit(), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const invoiceId = req.params.id as string;

    const invRes = await t.db.query(
      `SELECT * FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, t.companyId],
    );
    if (!invRes.rowCount) throw notFound('Invoice not found');
    const inv = invRes.rows[0];
    if (inv.status !== 'draft') throw badRequest('Only draft invoices can be sent');

    await t.db.query(
      `UPDATE invoices SET status = 'sent' WHERE id = $1 AND company_id = $2`,
      [invoiceId, t.companyId],
    );
    await postSalesInvoice(t.db, t.companyId, invoiceId, req.auth!.userId);

    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invoice.send', entity: 'invoice', entityId: invoiceId,
      data: { number: inv.number },
    });

    // Trigger email/PDF notification — same flow as the send-email endpoint.
    // Errors here are non-fatal: the invoice is already promoted to 'sent'.
    try {
      const data = await loadInvoicePdfData(t.db, invoiceId, t.companyId);
      const recipient = data.client.email;
      if (recipient) {
        const smtpRow = await t.db.query(
          `SELECT smtp_settings FROM companies WHERE id = $1`, [t.companyId],
        );
        const smtpSettings = smtpRow.rows[0]?.smtp_settings as Record<string, unknown> | null;
        const smtpOverride = smtpSettings?.host ? {
          host: smtpSettings.host as string,
          port: Number(smtpSettings.port ?? 587),
          secure: Boolean(smtpSettings.secure),
          username: smtpSettings.username as string | undefined,
          password: smtpSettings.password as string | undefined,
          fromName: smtpSettings.fromName as string | undefined,
          fromEmail: smtpSettings.fromEmail as string | undefined,
        } : undefined;
        const updatedRow = await t.db.query(
          `SELECT public_id FROM invoices WHERE id = $1`, [invoiceId],
        );
        const publicUrl = `${env.APP_URL}/invoice/${updatedRow.rows[0].public_id}`;
        const branding = await getCompanyBranding(t.db, t.companyId);
        const dueDateStr = data.due_date
          ? new Date(data.due_date).toLocaleDateString('ar-SA')
          : null;
        await sendEmail({
          to: recipient,
          subject: `فاتورة رقم ${data.number} من ${data.company.name}`,
          html: renderEmail({
            ...branding,
            title: `فاتورة رقم ${data.number}`,
            previewText: `فاتورة من ${data.company.name} بقيمة ${data.total} ${data.currency}`,
            bodyHtml: `<p>مرحباً،</p>
                       <p>يسعدنا إرسال فاتورة رقم <strong>${data.number}</strong> من <strong>${data.company.name}</strong>.</p>
                       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0">
                         <tr><td style="padding:6px 0;color:#6b7280">المبلغ الإجمالي</td><td style="padding:6px 0;font-weight:bold">${data.total} ${data.currency}</td></tr>
                         ${dueDateStr ? `<tr><td style="padding:6px 0;color:#6b7280">تاريخ الاستحقاق</td><td style="padding:6px 0">${dueDateStr}</td></tr>` : ''}
                       </table>
                       <p>يمكنك عرض الفاتورة عبر الرابط التالي.</p>`,
            ctaLabel: 'عرض الفاتورة',
            ctaUrl: publicUrl,
          }),
          smtpOverride,
        });
        await audit(t.db, {
          companyId: t.companyId, userId: req.auth!.userId,
          action: 'invoice.email', entity: 'invoice', entityId: invoiceId,
          data: { to: recipient, triggered_by: 'send' },
        });
      }
    } catch (emailErr) {
      console.error('[invoice.send] notification failed (non-fatal):', (emailErr as Error).message);
    }

    const updated = await t.db.query(
      `SELECT * FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, t.companyId],
    );
    res.json({ data: updated.rows[0] });
  } catch (e) { next(e); }
});

/** Cancel a sent invoice — reverses stock quantities and account balances. */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const invoiceId = req.params.id;

    await t.db.query('BEGIN');
    try {
      // Lock the row inside the transaction so concurrent retries block here
      // rather than racing past the status check.
      const invRes = await t.db.query(
        `SELECT * FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`,
        [invoiceId, t.companyId],
      );
      if (!invRes.rowCount) throw notFound('Invoice not found');
      const inv = invRes.rows[0];
      if (inv.status !== 'sent') {
        throw badRequest('Only sent invoices can be cancelled');
      }
      await assertPeriodOpen(t.db, t.companyId, inv.issue_date);

      const items = await t.db.query(
        `SELECT ii.product_id, ii.quantity, p.product_type
         FROM invoice_items ii
         LEFT JOIN products p ON p.id = ii.product_id AND p.company_id = ii.company_id
         WHERE ii.invoice_id = $1 AND ii.company_id = $2`,
        [invoiceId, t.companyId],
      );

      const payments = await t.db.query(
        `SELECT account_id, amount FROM payments WHERE invoice_id = $1 AND company_id = $2`,
        [invoiceId, t.companyId],
      );

      for (const item of items.rows) {
        if (item.product_id && item.product_type === 'stock') {
          await t.db.query(
            `UPDATE products SET quantity = quantity + $1 WHERE id = $2 AND company_id = $3`,
            [item.quantity, item.product_id, t.companyId],
          );
        }
      }

      for (const pay of payments.rows) {
        if (!pay.account_id) continue;
        await t.db.query(
          `UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND company_id = $3`,
          [pay.amount, pay.account_id, t.companyId],
        );
      }

      await t.db.query(
        `UPDATE invoices SET status = 'cancelled' WHERE id = $1 AND company_id = $2`,
        [invoiceId, t.companyId],
      );
      if (inv.journal_entry_id) {
        await reverseJournalEntry(t.db, t.companyId, inv.journal_entry_id, req.auth!.userId);
      }

      await audit(t.db, {
        companyId: t.companyId, userId: req.auth!.userId,
        action: 'invoice.cancel', entity: 'invoice', entityId: invoiceId,
        data: { number: inv.number, total: Number(inv.total) },
      });

      await t.db.query('COMMIT');
    } catch (txErr) {
      await t.db.query('ROLLBACK');
      throw txErr;
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/:id/qr-visibility', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = z.object({
      qr_public_visible: z.boolean(),
    }).parse(req.body);

    const rs = await t.db.query(
      `UPDATE invoices
       SET qr_public_visible = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, qr_public_visible`,
      [body.qr_public_visible, req.params.id, t.companyId],
    );
    if (!rs.rowCount) throw notFound('Invoice not found');

    await audit(t.db, {
      companyId: t.companyId,
      userId: req.auth!.userId,
      action: 'invoice.qr_visibility',
      entity: 'invoice',
      entityId: req.params.id,
      data: { qr_public_visible: body.qr_public_visible },
    });

    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const invoiceId = req.params.id;

    const invCheck = await t.db.query(
      `SELECT id, journal_entry_id FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, t.companyId],
    );
    if (!invCheck.rowCount) throw notFound('Invoice not found');
    if (invCheck.rows[0].journal_entry_id) {
      throw badRequest('Posted invoices cannot be deleted. Cancel the invoice to reverse it.');
    }

    const items = await t.db.query(
      `SELECT ii.product_id, ii.quantity, p.product_type
       FROM invoice_items ii
       LEFT JOIN products p ON p.id = ii.product_id AND p.company_id = ii.company_id
       WHERE ii.invoice_id = $1 AND ii.company_id = $2`,
      [invoiceId, t.companyId],
    );

    const payments = await t.db.query(
      `SELECT account_id, amount FROM payments WHERE invoice_id = $1 AND company_id = $2`,
      [invoiceId, t.companyId],
    );

    for (const item of items.rows) {
      if (item.product_id && item.product_type === 'stock') {
        await t.db.query(
          `UPDATE products SET quantity = quantity + $1 WHERE id = $2 AND company_id = $3`,
          [item.quantity, item.product_id, t.companyId],
        );
      }
    }

    for (const pay of payments.rows) {
      await t.db.query(
        `UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND company_id = $3`,
        [pay.amount, pay.account_id, t.companyId],
      );
    }

    await t.db.query(`DELETE FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, t.companyId]);
    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invoice.delete', entity: 'invoice', entityId: invoiceId,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

interface InvoiceEmailData {
  number: string;
  issue_date: string | Date;
  due_date?: string | Date | null;
  status: string;
  currency: string;
  subtotal: number; vat_amount: number; discount: number;
  total: number; paid: number; remaining: number;
  notes?: string | null;
  company: { name: string; address?: string | null; tax_number?: string | null; phone?: string | null };
  client:  { name: string; email?: string | null; phone?: string | null; tax_number?: string | null };
  items: Array<{ description: string; quantity: number; unit_price: number; discount: number; line_total: number }>;
}

/** Build the invoice data needed for email notifications. */
async function loadInvoicePdfData(db: { query: typeof pool.query }, invoiceId: string, companyId: string): Promise<InvoiceEmailData> {
  const inv = await db.query(`SELECT * FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, companyId]);
  if (!inv.rowCount) throw notFound('Invoice not found');
  const i = inv.rows[0];
  const co = (await db.query(`SELECT name, address, tax_number, phone FROM companies WHERE id = $1`, [companyId])).rows[0];
  const cl = (await db.query(`SELECT name, email, phone, tax_number FROM clients WHERE id = $1`, [i.client_id])).rows[0];
  const items = (await db.query(
    `SELECT description, quantity, unit_price, discount, line_total FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at`,
    [invoiceId],
  )).rows;
  return {
    number: i.number, issue_date: i.issue_date, due_date: i.due_date, status: i.status,
    currency: EGP_CURRENCY_SYMBOL,
    subtotal: Number(i.subtotal), vat_amount: Number(i.vat_amount), discount: Number(i.discount),
    total: Number(i.total), paid: Number(i.paid), remaining: Number(i.remaining), notes: i.notes,
    company: co, client: cl,
    items: items.map((r) => ({ description: r.description, quantity: Number(r.quantity), unit_price: Number(r.unit_price), discount: Number(r.discount ?? 0), line_total: Number(r.line_total) })),
  };
}

router.post('/:id/send-email', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const { to, subject, message } = z.object({
      to: z.string().email().optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
    }).parse(req.body ?? {});

    const data = await loadInvoicePdfData(t.db, req.params.id, t.companyId);
    const inv = await t.db.query(`SELECT public_id FROM invoices WHERE id = $1`, [req.params.id]);
    const publicUrl = `${env.APP_URL}/invoice/${inv.rows[0].public_id}`;
    const recipient = to ?? data.client.email;
    if (!recipient) throw badRequest('Client has no email — supply "to"');

    // Load per-tenant SMTP settings if configured
    const smtpRow = await t.db.query(
      `SELECT smtp_settings FROM companies WHERE id = $1`,
      [t.companyId],
    );
    const smtpSettings = smtpRow.rows[0]?.smtp_settings as Record<string, unknown> | null;
    const smtpOverride = smtpSettings?.host
      ? {
          host: smtpSettings.host as string,
          port: Number(smtpSettings.port ?? 587),
          secure: Boolean(smtpSettings.secure),
          username: smtpSettings.username as string | undefined,
          // Keep encrypted form — email.ts decrypts at send-time so the
          // plaintext password is never stored in the pg-boss queue payload.
          password: smtpSettings.password as string | undefined,
          fromName: smtpSettings.fromName as string | undefined,
          fromEmail: smtpSettings.fromEmail as string | undefined,
        }
      : undefined;

    const branding2 = await getCompanyBranding(t.db, t.companyId);
    const dueDateStr2 = data.due_date
      ? new Date(data.due_date).toLocaleDateString('ar-SA')
      : null;
    const defaultSubject = `فاتورة رقم ${data.number} من ${data.company.name}`;
    await sendEmail({
      to: recipient,
      subject: subject ?? defaultSubject,
      html: renderEmail({
        ...branding2,
        title: `فاتورة رقم ${data.number}`,
        previewText: `فاتورة من ${data.company.name} بقيمة ${data.total} ${data.currency}`,
        bodyHtml: message
          ? `<p>${message}</p>`
          : `<p>مرحباً،</p>
             <p>يسعدنا إرسال فاتورة رقم <strong>${data.number}</strong> من <strong>${data.company.name}</strong>.</p>
             <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0">
               <tr><td style="padding:6px 0;color:#6b7280">المبلغ الإجمالي</td><td style="padding:6px 0;font-weight:bold">${data.total} ${data.currency}</td></tr>
               ${dueDateStr2 ? `<tr><td style="padding:6px 0;color:#6b7280">تاريخ الاستحقاق</td><td style="padding:6px 0">${dueDateStr2}</td></tr>` : ''}
             </table>
             <p>يمكنك عرض الفاتورة عبر الرابط التالي.</p>`,
        ctaLabel: 'عرض الفاتورة',
        ctaUrl: publicUrl,
      }),
      smtpOverride,
    });

    const invoiceId = req.params.id as string;
    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invoice.email', entity: 'invoice', entityId: invoiceId,
      data: { to: recipient },
    });

    // Record sent alert in notifications table for audit trail
    const clientRow = await t.db.query(
      `SELECT client_id FROM invoices WHERE id = $1 AND company_id = $2`,
      [req.params.id, t.companyId],
    );
    const clientId = clientRow.rows[0]?.client_id ?? null;
    const notificationKind = internalKindSchema.parse('invoice_email');
    await t.db.query(
      `INSERT INTO notifications (company_id, user_id, title, body, kind)
       VALUES ($1, NULL, $2, $3, $4)`,
      [
        t.companyId,
        subject ?? `Invoice ${data.number} from ${data.company.name}`,
        JSON.stringify({
          event: 'onCreated',
          channel: 'email',
          recipientKind: 'client',
          clientId,
          recipientId: clientId,
          recipientName: data.client.name,
          recipientContact: recipient,
          invoiceId: req.params.id,
          invoiceNumber: data.number,
          amount: Number(data.total),
          messageBody: message ?? `Please find attached invoice ${data.number}.`,
        }),
        notificationKind,
      ],
    );

    res.json({ ok: true, to: recipient });
  } catch (e) { next(e); }
});

/** Generate a WhatsApp deep-link with a templated message (no message is sent server-side). */
router.get('/:id/whatsapp-link', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const inv = await t.db.query(
      `SELECT i.number, i.total, i.public_id, c.phone, c.whatsapp FROM invoices i
       JOIN clients c ON c.id = i.client_id WHERE i.id = $1 AND i.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!inv.rowCount) throw notFound();
    const r = inv.rows[0];
    const url = `${env.APP_URL}/invoice/${r.public_id}`;
    const text = encodeURIComponent(`Invoice ${r.number} — Total ${r.total}\n${url}`);
    const phone = (r.whatsapp || r.phone || '').replace(/\D/g, '');
    res.json({ link: `https://wa.me/${phone}?text=${text}` });
  } catch (e) { next(e); }
});

export default router;
