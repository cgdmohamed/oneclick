/**
 * SEC-05 — Real invitation flow (replaces the localStorage shim).
 *
 * - Admin endpoints (require company_admin) live under /api/invitations.
 * - Public endpoints (no auth) live under /api/public/invitations.
 *
 * Token handling: a 32-byte random token is generated and emailed in the
 * invite link; only its sha256 hash is stored. The raw token is also
 * returned once to the inviter so the UI can show "copy link" for
 * SMTP-less dev environments.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { env } from '../../config/env.js';
import { requireRole } from '../../middleware/rbac.js';
import { badRequest, notFound, HttpError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { sendEmail } from '../../utils/email.js';
import { getPlatformBranding, buildEmail } from '../../utils/emailTemplate.js';
import { enforceUserLimit } from '../../middleware/planLimits.js';
import type { AuthClaims } from '../../middleware/auth.js';

const TTL_DAYS = 7;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const buildInviteUrl = (token: string) =>
  `${env.APP_URL.replace(/\/+$/, '')}/accept-invite?token=${token}`;

const inviteSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  fullName: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  role: z.enum(['company_admin','accountant','sales','viewer']),
});

/* ------------------------- Authenticated (admin) router ------------------------- */
export const invitationsAdminRouter = Router();

invitationsAdminRouter.get('/', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    // Auto-expire stale rows on read; cheap and keeps the list honest.
    await t.db.query(
      `UPDATE invitations SET status = 'expired'
       WHERE company_id = $1 AND status = 'pending' AND expires_at < now()`,
      [t.companyId],
    );
    const rs = await t.db.query(
      `SELECT id, email, full_name, phone, role, status,
              invited_at, expires_at, accepted_at
         FROM invitations
        WHERE company_id = $1
        ORDER BY invited_at DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

invitationsAdminRouter.post('/', requireRole('company_admin'), enforceUserLimit(), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = inviteSchema.parse(req.body);

    // If the email already belongs to a member of this company, refuse.
    const dup = await t.db.query(
      `SELECT 1 FROM user_companies uc
         JOIN users u ON u.id = uc.user_id
        WHERE uc.company_id = $1 AND lower(u.email) = $2`,
      [t.companyId, body.email],
    );
    if (dup.rowCount) throw badRequest('هذا المستخدم عضو بالفعل في الشركة');

    // Revoke any prior pending invites for the same email+company.
    await t.db.query(
      `UPDATE invitations SET status = 'revoked'
        WHERE company_id = $1 AND lower(email) = $2 AND status = 'pending'`,
      [t.companyId, body.email],
    );

    const token = crypto.randomBytes(32).toString('hex');
    const ins = await t.db.query(
      `INSERT INTO invitations
         (company_id, email, full_name, phone, role, token_hash, invited_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' days')::interval)
       RETURNING id, email, full_name, phone, role, status, invited_at, expires_at`,
      [t.companyId, body.email, body.fullName, body.phone ?? null, body.role,
       sha(token), req.auth!.userId, String(TTL_DAYS)],
    );

    const link = buildInviteUrl(token);
    // Best-effort email; never block the response if SMTP is down.
    void getPlatformBranding().then((branding) =>
      sendEmail({
        to: body.email,
        subject: `دعوة للانضمام إلى ${branding.name}`,
        html: buildEmail({
          title: `دعوة للانضمام إلى ${branding.name}`,
          body: `<p>مرحباً <strong>${body.fullName}</strong>،</p>
                 <p>تمت دعوتك للانضمام إلى منصة <strong>${branding.name}</strong> بصفة <strong>${body.role}</strong>.</p>
                 <p>انقر على الزر أدناه لقبول الدعوة وإنشاء حسابك. الرابط صالح لمدة <strong>${TTL_DAYS} أيام</strong>.</p>
                 <p style="color:#6b7280;font-size:13px;margin-top:24px">إذا لم تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.</p>`,
          cta: { text: 'قبول الدعوة', url: link },
          branding,
        }),
      }),
    );

    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invitation.create', entity: 'invitation', entityId: ins.rows[0].id,
      data: { email: body.email, role: body.role },
    });

    res.status(201).json({
      data: ins.rows[0],
      invite_url: link,        // shown once to the inviter
    });
  } catch (e) { next(e); }
});

invitationsAdminRouter.post('/:id/revoke', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `UPDATE invitations SET status = 'revoked'
        WHERE id = $1 AND company_id = $2 AND status = 'pending'
        RETURNING id`,
      [req.params.id, t.companyId],
    );
    if (!rs.rowCount) throw notFound('Invitation not found or not pending');
    const id = req.params.id as string;
    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invitation.revoke', entity: 'invitation', entityId: id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

invitationsAdminRouter.post('/:id/resend', requireRole('company_admin'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    // Issue a fresh token (security best practice: never re-email an old one).
    const token = crypto.randomBytes(32).toString('hex');
    const rs = await t.db.query(
      `UPDATE invitations
          SET token_hash = $1,
              status     = 'pending',
              invited_at = now(),
              expires_at = now() + ($2 || ' days')::interval
        WHERE id = $3 AND company_id = $4
        RETURNING id, email, full_name, role, expires_at`,
      [sha(token), String(TTL_DAYS), req.params.id, t.companyId],
    );
    if (!rs.rowCount) throw notFound('Invitation not found');
    const row = rs.rows[0];
    const link = buildInviteUrl(token);
    void getPlatformBranding().then((branding) =>
      sendEmail({
        to: row.email,
        subject: `تذكير: دعوتك للانضمام إلى ${branding.name}`,
        html: buildEmail({
          title: 'تذكير بدعوة الانضمام',
          body: `<p>مرحباً <strong>${row.full_name}</strong>،</p>
                 <p>هذا تذكير بأن لديك دعوة معلّقة للانضمام إلى منصة <strong>${branding.name}</strong>.</p>
                 <p>انقر على الزر أدناه لقبول الدعوة. الرابط صالح لمدة <strong>${TTL_DAYS} أيام</strong>.</p>
                 <p style="color:#6b7280;font-size:13px;margin-top:24px">إذا لم تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.</p>`,
          cta: { text: 'قبول الدعوة', url: link },
          branding,
        }),
      }),
    );
    await audit(t.db, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'invitation.resend', entity: 'invitation', entityId: row.id,
    });
    res.json({ data: row, invite_url: link });
  } catch (e) { next(e); }
});

/* ------------------------------ Public router ------------------------------ */
export const invitationsPublicRouter = Router();

const lookupByToken = async (rawToken: string) => {
  const rs = await pool.query(
    `SELECT i.id, i.company_id, i.email, i.full_name, i.phone, i.role,
            i.status, i.expires_at, c.name AS company_name
       FROM invitations i
       JOIN companies c ON c.id = i.company_id
      WHERE i.token_hash = $1`,
    [sha(rawToken)],
  );
  if (!rs.rowCount) return null;
  const inv = rs.rows[0];
  if (inv.status === 'pending' && new Date(inv.expires_at).getTime() < Date.now()) {
    // Lazily flip to expired so the UI shows the right state.
    await pool.query(`UPDATE invitations SET status = 'expired' WHERE id = $1`, [inv.id]);
    inv.status = 'expired';
  }
  return inv as {
    id: string; company_id: string; email: string; full_name: string;
    phone: string | null; role: string; status: string; expires_at: string;
    company_name: string;
  };
};

invitationsPublicRouter.get('/:token', async (req, res, next) => {
  try {
    const inv = await lookupByToken(req.params.token);
    if (!inv) throw notFound('Invitation not found');
    res.json({
      data: {
        email: inv.email,
        full_name: inv.full_name,
        phone: inv.phone,
        role: inv.role,
        status: inv.status,
        expires_at: inv.expires_at,
        company_name: inv.company_name,
      },
    });
  } catch (e) { next(e); }
});

const acceptSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  password: z.string().min(8).max(200).optional(),
});

invitationsPublicRouter.post('/:token/accept', async (req, res, next) => {
  const c = await pool.connect();
  try {
    const body = acceptSchema.parse(req.body);
    const inv = await lookupByToken(req.params.token);
    if (!inv) throw notFound('Invitation not found');
    if (inv.status !== 'pending') throw badRequest('Invitation is not pending');

    // Parse the Bearer token if present (public endpoint — optional auth).
    const authHeader = req.headers.authorization;
    const rawJwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let authedUserId: string | null = null;
    if (rawJwt) {
      try {
        const payload = jwt.verify(rawJwt, env.JWT_SECRET) as AuthClaims;
        authedUserId = payload.sub;
      } catch {
        // Expired or tampered token — treat as unauthenticated.
      }
    }

    await c.query('BEGIN');

    // Reuse existing account if the email is already registered globally.
    let userId: string;
    const existing = await c.query(
      `SELECT id FROM users WHERE lower(email) = lower($1)`, [inv.email],
    );
    if (existing.rowCount) {
      const existingUserId: string = existing.rows[0].id;

      // Security guard: the invite was sent to a specific registered account.
      // The person clicking the link must prove they control that account by
      // being logged in as it. An intercepted token must not be usable by
      // anyone else.
      if (!authedUserId) {
        throw new HttpError(401, 'يجب تسجيل الدخول أولاً لقبول هذه الدعوة', 'login_required');
      }
      if (authedUserId !== existingUserId) {
        throw new HttpError(403, 'هذه الدعوة مخصصة لحساب بريد إلكتروني آخر. يرجى تسجيل الخروج والدخول بالحساب الصحيح.', 'email_mismatch');
      }

      userId = existingUserId;
      // Don't silently overwrite an existing user's password.
      // They can use forgot-password instead.
      await c.query(
        `UPDATE users SET name = COALESCE(NULLIF($2,''), name) WHERE id = $1`,
        [userId, body.full_name.trim()],
      );
    } else {
      if (!body.password) throw badRequest('كلمة المرور مطلوبة لإنشاء حساب جديد');
      const hash = await bcrypt.hash(body.password, 12);
      const u = await c.query(
        `INSERT INTO users (email, password_hash, name, email_verified_at)
         VALUES ($1,$2,$3, now()) RETURNING id`,
        [inv.email, hash, body.full_name.trim()],
      );
      userId = u.rows[0].id;
    }

    // Serialize concurrent accepts for the same company by locking the
    // company row. Any second transaction that reaches this point for the
    // same company will block until the first commits or rolls back, at
    // which point the count reflects the now-committed membership state.
    await c.query(`SELECT id FROM companies WHERE id = $1 FOR UPDATE`, [inv.company_id]);

    // Re-check seat limit inside the transaction (after acquiring the lock)
    // so the count + insert form a single atomic unit.
    const planRs = await c.query(
      `SELECT p.max_users
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.company_id = $1
          AND s.status IN ('active','trialing','past_due')
        ORDER BY s.created_at DESC LIMIT 1`,
      [inv.company_id],
    );
    if (planRs.rowCount) {
      const maxUsers: number = planRs.rows[0].max_users;
      if (maxUsers > 0) {
        const cntRs = await c.query(
          `SELECT COUNT(*)::int AS n FROM user_companies WHERE company_id = $1`,
          [inv.company_id],
        );
        if (cntRs.rows[0].n >= maxUsers) {
          throw new HttpError(403, 'وصل عدد المستخدمين في هذه الشركة إلى الحد الأقصى المسموح به.', 'seat_limit_reached');
        }
      }
    }

    await c.query(
      `INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [userId, inv.company_id],
    );
    await c.query(
      `INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [userId, inv.company_id, inv.role],
    );

    await c.query(
      `UPDATE invitations
          SET status = 'accepted', accepted_at = now(), accepted_user_id = $2,
              full_name = $3, phone = COALESCE($4, phone)
        WHERE id = $1`,
      [inv.id, userId, body.full_name.trim(), body.phone ?? null],
    );

    await c.query('COMMIT');

    await audit(pool, {
      companyId: inv.company_id, userId,
      action: 'invitation.accept', entity: 'invitation', entityId: inv.id,
      data: { email: inv.email, role: inv.role },
    });

    res.json({ ok: true, email: inv.email });
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* ignore */ }
    next(e);
  } finally {
    c.release();
  }
});
