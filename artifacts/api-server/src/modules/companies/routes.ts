import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../utils/errors.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.get('/me', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT * FROM companies WHERE id = $1`, [t.companyId]);
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

// SEC-09: explicit allow-list — never interpolate caller-controlled keys.
const UPDATABLE = [
  'name', 'legal_name', 'tax_number', 'commercial_register',
  'email', 'phone', 'address', 'logo_url', 'stamp_url',
  'invoice_prefix', 'invoice_year_format', 'invoice_padding',
  'invoice_separator', 'currency', 'vat_rate',
] as const;

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  legal_name: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  commercial_register: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  stamp_url: z.string().optional().nullable(),
  invoice_prefix: z.string().optional(),
  invoice_year_format: z.enum(['full','short','none']).optional(),
  invoice_padding: z.coerce.number().int().min(1).max(10).optional(),
  invoice_separator: z.string().max(5).optional(),
  currency: z.string().optional(),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
});

// SEC-06: only company_admin may rewrite tax / numbering / branding data.
router.patch('/me', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = updateSchema.parse(req.body);
    const fields = (Object.keys(body) as Array<keyof typeof body>)
      .filter((k) => (UPDATABLE as readonly string[]).includes(k as string));
    if (fields.length === 0) return res.json({ data: null });
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...fields.map((f) => (body as Record<string, unknown>)[f as string]), t.companyId];
    const rs = await t.db.query(
      `UPDATE companies SET ${set}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
      values,
    );
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

/* ---------- SMTP settings (per-tenant, write-protected) ---------- */

const smtpSchema = z.object({
  host: z.string().max(255).default(''),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().max(255).default(''),
  password: z.string().max(500).optional(),
  fromName: z.string().max(120).default(''),
  fromEmail: z.string().max(255).default(''),
});

/**
 * GET /api/company/smtp-settings
 * Returns SMTP config with the password field omitted (write-only).
 */
router.get('/smtp-settings', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT smtp_settings FROM companies WHERE id = $1`,
      [t.companyId],
    );
    if (!rs.rowCount) throw notFound();
    const raw = rs.rows[0].smtp_settings as Record<string, unknown> | null;
    if (!raw) {
      return res.json({ data: { host: '', port: 587, secure: false, username: '', fromName: '', fromEmail: '', hasPassword: false } });
    }
    const { password, ...rest } = raw;
    res.json({ data: { ...rest, hasPassword: !!password } });
  } catch (e) { next(e); }
});

/**
 * PUT /api/company/smtp-settings
 * Saves SMTP config. Password is only updated when a non-empty value is supplied;
 * omitting it preserves the existing stored password.
 */
router.put('/smtp-settings', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = smtpSchema.parse(req.body);

    // Build settings object — preserve existing password if caller omits it
    const settings: Record<string, unknown> = {
      host: body.host,
      port: body.port,
      secure: body.secure,
      username: body.username,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
    };

    if (body.password === undefined) {
      // Password not sent — preserve whatever is already stored
      const existing = await t.db.query(
        `SELECT smtp_settings->>'password' AS pwd FROM companies WHERE id = $1`,
        [t.companyId],
      );
      const existingPwd = existing.rows[0]?.pwd;
      if (existingPwd) settings.password = existingPwd;
    } else if (body.password !== '') {
      // Non-empty password supplied — update it
      settings.password = body.password;
    }
    // body.password === '' means explicitly clear — leave settings.password unset

    await t.db.query(
      `UPDATE companies SET smtp_settings = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(settings), t.companyId],
    );

    const { password: _pw, ...safe } = settings;
    res.json({ data: { ...safe, hasPassword: !!settings.password } });
  } catch (e) { next(e); }
});

export default router;
