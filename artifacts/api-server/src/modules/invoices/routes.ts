import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { renderInvoicePdf, type InvoicePdfData } from '../../utils/pdf.js';
import { sendEmail } from '../../utils/email.js';
import { env } from '../../config/env.js';
import { enforceInvoiceLimit } from '../../middleware/planLimits.js';
import { parsePagination } from '../../utils/pagination.js';
import { round2 } from '../../utils/money.js';

const router = Router();

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  vat_rate: z.coerce.number().min(0).max(100).default(15),
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  issue_date: z.string().datetime().optional(),
  due_date: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  discount: z.coerce.number().nonnegative().default(0),
  items: z.array(itemSchema).min(1),
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
      `SELECT i.*, c.name AS client_name, c.email AS client_email, c.tax_number AS client_tax
       FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = $1 AND i.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!inv.rowCount) throw notFound('Invoice not found');
    const items = await t.db.query(`SELECT * FROM invoice_items WHERE invoice_id = $1 AND company_id = $2 ORDER BY created_at`, [req.params.id, t.companyId]);
    const pays  = await t.db.query(`SELECT * FROM payments WHERE invoice_id = $1 AND company_id = $2 ORDER BY paid_at DESC`, [req.params.id, t.companyId]);
    res.json({ data: { ...inv.rows[0], items: items.rows, payments: pays.rows } });
  } catch (e) { next(e); }
});

router.post('/', enforceInvoiceLimit(), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = createSchema.parse(req.body);

    const compRes = await t.db.query(
      `SELECT invoice_prefix, invoice_sequence, invoice_year_format, invoice_padding, invoice_separator
       FROM companies WHERE id = $1 FOR UPDATE`,
      [t.companyId],
    );
    if (!compRes.rowCount) throw badRequest('Company missing');
    const cfg = compRes.rows[0];
    const newSeq = cfg.invoice_sequence + 1;
    const issueDate = body.issue_date ? new Date(body.issue_date) : new Date();
    const number = buildNumber(
      cfg.invoice_prefix, newSeq, issueDate.getFullYear(),
      cfg.invoice_year_format, cfg.invoice_separator, cfg.invoice_padding,
    );
    await t.db.query(`UPDATE companies SET invoice_sequence = $1 WHERE id = $2`, [newSeq, t.companyId]);

    let subtotal = 0, vat = 0;
    for (const it of body.items) {
      const line = round2(it.quantity * it.unit_price);
      subtotal = round2(subtotal + line);
      vat = round2(vat + line * (it.vat_rate / 100));
    }
    const discount = round2(body.discount);
    const total = round2(Math.max(0, subtotal + vat - discount));

    const invRes = await t.db.query(`
      INSERT INTO invoices (company_id, number, client_id, issue_date, due_date, status,
                            subtotal, vat_amount, discount, total, paid, remaining, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,'sent',$6,$7,$8,$9,0,$9,$10,$11)
      RETURNING *
    `, [t.companyId, number, body.client_id, issueDate, body.due_date ?? null,
        subtotal, vat, discount, total, body.notes ?? null, req.auth!.userId]);
    const invoice = invRes.rows[0];

    for (const it of body.items) {
      const line = round2(it.quantity * it.unit_price * (1 + it.vat_rate / 100));
      await t.db.query(`
        INSERT INTO invoice_items (company_id, invoice_id, product_id, description, quantity, unit_price, vat_rate, line_total)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [t.companyId, invoice.id, it.product_id ?? null, it.description, it.quantity, it.unit_price, it.vat_rate, line]);

      if (it.product_id) {
        // DAT-05: refuse to oversell. The CHECK-style update returns 0 rows
        // when the product would go negative; we surface a clean 400.
        const stock = await t.db.query(
          `UPDATE products SET quantity = quantity - $1
           WHERE id = $2 AND company_id = $3 AND quantity >= $1
           RETURNING id`,
          [it.quantity, it.product_id, t.companyId],
        );
        if (!stock.rowCount) {
          throw badRequest(`Insufficient stock for "${it.description}"`);
        }
      }
    }

    await audit(pool, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invoice.create', entity: 'invoice', entityId: invoice.id,
      data: { number, total, items: body.items.length },
    });

    res.status(201).json({ data: invoice });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query(`DELETE FROM invoices WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    await audit(pool, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invoice.delete', entity: 'invoice', entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Build the data needed by the PDF renderer for one invoice. */
async function loadInvoicePdfData(db: { query: typeof pool.query }, invoiceId: string, companyId: string): Promise<InvoicePdfData> {
  const inv = await db.query(`SELECT * FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, companyId]);
  if (!inv.rowCount) throw notFound('Invoice not found');
  const i = inv.rows[0];
  const co = (await db.query(`SELECT name, address, tax_number, phone, currency FROM companies WHERE id = $1`, [companyId])).rows[0];
  const cl = (await db.query(`SELECT name, email, phone, tax_number FROM clients WHERE id = $1`, [i.client_id])).rows[0];
  const items = (await db.query(
    `SELECT description, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at`,
    [invoiceId],
  )).rows;
  return {
    number: i.number, issue_date: i.issue_date, due_date: i.due_date, status: i.status,
    currency: co?.currency ?? 'SAR',
    subtotal: Number(i.subtotal), vat_amount: Number(i.vat_amount), discount: Number(i.discount),
    total: Number(i.total), paid: Number(i.paid), remaining: Number(i.remaining), notes: i.notes,
    company: co, client: cl,
    items: items.map((r) => ({ description: r.description, quantity: Number(r.quantity), unit_price: Number(r.unit_price), line_total: Number(r.line_total) })),
  };
}

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const data = await loadInvoicePdfData(t.db, req.params.id, t.companyId);
    const buf = await renderInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${data.number}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

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

    const buf = await renderInvoicePdf(data);
    await sendEmail({
      to: recipient,
      subject: subject ?? `Invoice ${data.number} from ${data.company.name}`,
      html: `<p>${message ?? `Please find attached invoice ${data.number}.`}</p>
             <p>You can also view it online: <a href="${publicUrl}">${publicUrl}</a></p>`,
      attachments: [{ filename: `invoice-${data.number}.pdf`, content: buf, contentType: 'application/pdf' }],
    });

    await audit(pool, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invoice.email', entity: 'invoice', entityId: req.params.id,
      data: { to: recipient },
    });
    res.json({ ok: true, to: recipient });
  } catch (e) { next(e); }
});

/** Generate a WhatsApp deep-link with a templated message (no message is sent server-side). */
router.get('/:id/whatsapp-link', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const inv = await t.db.query(
      `SELECT i.number, i.total, i.public_id, c.phone FROM invoices i
       JOIN clients c ON c.id = i.client_id WHERE i.id = $1 AND i.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!inv.rowCount) throw notFound();
    const r = inv.rows[0];
    const url = `${env.APP_URL}/invoice/${r.public_id}`;
    const text = encodeURIComponent(`Invoice ${r.number} — Total ${r.total}\n${url}`);
    const phone = (r.phone ?? '').replace(/\D/g, '');
    res.json({ link: `https://wa.me/${phone}?text=${text}` });
  } catch (e) { next(e); }
});

export default router;
