import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../../db/client.js';
import { env } from '../../config/env.js';
import { badRequest, unauthorized, forbidden } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { sendEmail } from '../../utils/email.js';
import { renderEmail } from '../../utils/emailTemplate.js';
import { getPlatformBranding } from '../../utils/platformBranding.js';
import { audit } from '../../utils/audit.js';
import { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie } from '../../utils/cookies.js';
import { setCsrfCookie, clearCsrfCookie, requireCsrf } from '../../middleware/csrf.js';
import { logger } from '../../utils/logger.js';
import { DISPOSABLE_EMAIL_DOMAINS } from '../../config/disposableEmailDomains.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';

const router = Router();
const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  companyName: z.string().min(2),
  phone: z.string().max(30).optional(),
  website: z.string().optional(),
});

/**
 * Per-IP registration attempt tracker (SEC-REG-01).
 * After REG_MAX_ATTEMPTS within REG_WINDOW_MS from the same IP, that IP is
 * locked out of the register endpoint for REG_LOCK_MS.
 * Single-process — matches the login tracker posture; swap to Redis for multi-instance.
 */
const REG_MAX_ATTEMPTS = 5;
const REG_WINDOW_MS = 15 * 60 * 1000;
const REG_LOCK_MS = 30 * 60 * 1000;
const regAttempts = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();

/** Returns the number of minutes remaining in the lockout, or 0 if not locked. */
function checkRegLock(ip: string): number {
  const rec = regAttempts.get(ip);
  if (!rec) return 0;
  const now = Date.now();
  if (rec.lockedUntil > now) return Math.ceil((rec.lockedUntil - now) / 60000);
  if (now - rec.firstAt > REG_WINDOW_MS) regAttempts.delete(ip);
  return 0;
}

/**
 * Increment the IP counter.
 * Returns the number of minutes remaining in lockout (> 0 means the threshold
 * was just reached on this increment, or was already set).
 * Callers should check the return value and return 429 immediately if > 0.
 */
function noteRegAttempt(ip: string): number {
  const now = Date.now();
  const rec = regAttempts.get(ip);
  if (!rec || now - rec.firstAt > REG_WINDOW_MS) {
    regAttempts.set(ip, { count: 1, firstAt: now, lockedUntil: 0 });
    return 0;
  }
  rec.count += 1;
  if (rec.count >= REG_MAX_ATTEMPTS) {
    rec.lockedUntil = now + REG_LOCK_MS;
    return Math.ceil(REG_LOCK_MS / 60000);
  }
  return 0;
}

function clearRegAttempts(ip: string) {
  regAttempts.delete(ip);
}

/** Build an Arabic 429 message for the given lockout duration in minutes. */
function regLockMsg(mins: number): string {
  return `تم تجاوز الحد المسموح به. حاول مجدداً بعد ${mins} دقيقة.`;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signAccess(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '15m' });
}
function signRefresh(userId: string) {
  return jwt.sign({ sub: userId, t: 'r' }, env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
}
function signVerify(userId: string) {
  return jwt.sign({ sub: userId, t: 'v' }, env.JWT_SECRET, { expiresIn: '24h' });
}
/** Short-lived challenge issued after password/Google verification when 2FA is on — not a real session. */
function signMfaChallenge(userId: string) {
  return jwt.sign({ sub: userId, t: 'mfa' }, env.JWT_SECRET, { expiresIn: '5m' });
}
/** Short-lived token carrying a Google-verified identity while the user picks a company name. */
function signGoogleSignup(googleId: string, email: string, name: string) {
  return jwt.sign({ sub: googleId, t: 'gsignup', email, name }, env.JWT_SECRET, { expiresIn: '15m' });
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * SEC-07: In-memory failed-login tracker. Per-email sliding 15-min window;
 * after MAX_ATTEMPTS failures the address is locked for LOCK_MS regardless of
 * password correctness. Resets on successful login.
 *
 * Single-process only — matches the existing in-memory rate-limit posture
 * (see SCL-01 in the audit). When we move to multi-instance, swap to Redis.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();

function checkLock(email: string) {
  const key = email.toLowerCase();
  const rec = attempts.get(key);
  if (!rec) return;
  const now = Date.now();
  if (rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    throw unauthorized(`Account temporarily locked. Try again in ${mins} minute(s).`);
  }
  if (now - rec.firstAt > WINDOW_MS) attempts.delete(key);
}

function noteFailure(email: string) {
  const key = email.toLowerCase();
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = now + LOCK_MS;
}

function noteSuccess(email: string) {
  attempts.delete(email.toLowerCase());
}

/**
 * Alerts every super admin that a new company signed up and is waiting for
 * review — before this, the only way to find out was to open the approvals
 * screen and happen to notice. Best-effort on both channels: a signup must
 * never fail or even slow down because a notification/email couldn't be sent.
 */
async function notifyAdminsOfNewSignup(opts: { companyName: string; email: string; phone?: string | null }) {
  try {
    await pool.query(
      `INSERT INTO system_notifications (title, body, audience) VALUES ($1,$2,'admin')`,
      [
        'طلب تسجيل جديد',
        `شركة «${opts.companyName}» (${opts.email}${opts.phone ? `، ${opts.phone}` : ''}) سجّلت وتنتظر المراجعة.`,
      ],
    );
  } catch { /* best-effort — never block signup */ }

  try {
    const admins = await pool.query<{ email: string }>(`SELECT email FROM users WHERE is_super_admin = true`);
    if (!admins.rowCount) return;
    const branding = await getPlatformBranding();
    const html = renderEmail({
      ...branding,
      title: 'طلب تسجيل جديد',
      previewText: `شركة جديدة سجّلت وتنتظر المراجعة: ${opts.companyName}`,
      bodyHtml: `<p>شركة جديدة سجّلت في المنصة وتنتظر المراجعة:</p>
                 <p><strong>${opts.companyName}</strong><br/>${opts.email}${opts.phone ? `<br/>${opts.phone}` : ''}</p>`,
      ctaLabel: 'مراجعة الطلب',
      ctaUrl: `${env.APP_URL}/admin/approvals`,
    });
    await Promise.all(
      admins.rows.map((a) =>
        sendEmail({ to: a.email, subject: `طلب تسجيل جديد: ${opts.companyName}`, html }).catch(() => { /* logged by email util */ }),
      ),
    );
  } catch { /* best-effort */ }
}

async function sendVerificationEmail(userId: string, email: string) {
  const token = signVerify(userId);
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  const branding = await getPlatformBranding();
  await sendEmail({
    to: email,
    subject: `تحقق من بريدك الإلكتروني — ${branding.brandName}`,
    html: renderEmail({
      ...branding,
      title: 'تحقق من بريدك الإلكتروني',
      previewText: 'أكّد بريدك الإلكتروني لإتمام إنشاء حسابك',
      bodyHtml: `<p>مرحباً بك في ${branding.brandName}!</p>
                 <p>أكّد بريدك الإلكتروني لإتمام إعداد حسابك. الرابط صالح لمدة 24 ساعة.</p>`,
      ctaLabel: 'تأكيد البريد الإلكتروني',
      ctaUrl: link,
    }),
  });
}

/**
 * Issue a refresh token, persist it (hashed) and start a new rotation family.
 * Returns the raw token to be sent to the client via httpOnly cookie.
 */
async function issueRefreshToken(
  c: PoolClient | typeof pool,
  userId: string,
  req: Request,
  familyId?: string,
): Promise<string> {
  const token = signRefresh(userId);
  const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 500);
  const ip = (req.ip ?? '').toString().slice(0, 64);
  const inserted = await c.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id, user_agent, ip)
     VALUES ($1, $2, now() + interval '30 days', $3, $4, $5)
     RETURNING id`,
    [userId, sha(token), familyId ?? null, ua, ip],
  );
  if (!familyId) {
    // Self-reference: this token starts a new family
    await c.query(`UPDATE refresh_tokens SET family_id = id WHERE id = $1`, [inserted.rows[0].id]);
  }
  return token;
}

function readRefreshToken(req: Request): string | null {
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
  if (cookie) return cookie;
  // Backward-compat: legacy clients posting refresh_token in body
  const body = req.body as { refresh_token?: unknown } | undefined;
  return typeof body?.refresh_token === 'string' ? body.refresh_token : null;
}


/**
 * Issues real tokens for an already-verified user (password or Google) whose
 * company is active and who either has no 2FA or has just passed it. Shared
 * by /login, /2fa/verify, and /google so the refresh-token/roles/audit/cookie
 * logic lives in exactly one place.
 */
async function issueSession(
  userId: string, email: string, name: string, isSuperAdmin: boolean,
  companyRow: { id: string; name: string; is_active: boolean; review_status: string } | undefined,
  req: Request, res: Response,
) {
  const access = signAccess(userId);
  const refresh = await issueRefreshToken(pool, userId, req);
  const roles = await pool.query(`SELECT role, company_id FROM user_roles WHERE user_id = $1`, [userId]);
  await audit(pool, {
    companyId: companyRow?.id ?? null, userId,
    action: 'auth.login', entity: 'user', entityId: userId,
    data: { email, ip: req.ip },
  });
  setRefreshCookie(res, refresh);
  setCsrfCookie(res);
  res.json({
    access_token: access,
    user: { id: userId, email, name, isSuperAdmin, emailVerified: true },
    company: companyRow ?? null,
    roles: roles.rows,
  });
}

/**
 * Runs the account-level gates every login path (password, Google, post-2FA)
 * must pass before a session is issued: disabled check, email verification,
 * company approval/suspension, then either a 2FA challenge or a real session.
 */
async function completeLogin(
  user: { id: string; email: string; name: string; is_super_admin: boolean; email_verified_at: Date | string | null; disabled: boolean },
  req: Request, res: Response,
) {
  if (user.disabled) throw forbidden('تم تعطيل حسابك. يرجى التواصل مع مدير الشركة.');
  if (!user.is_super_admin && !user.email_verified_at) {
    throw forbidden('يجب تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد، أو اطلب رابط تأكيد جديد.');
  }

  const comp = await pool.query(
    `SELECT c.id, c.name, c.is_active, c.review_status
       FROM user_companies uc JOIN companies c ON c.id = uc.company_id
      WHERE uc.user_id = $1 ORDER BY uc.is_default DESC LIMIT 1`,
    [user.id],
  );
  if (comp.rows[0] && !comp.rows[0].is_active) {
    const reviewStatus: string = comp.rows[0].review_status ?? 'pending';
    if (reviewStatus === 'pending') throw forbidden('حسابك قيد المراجعة. سنُبلغك فور اعتماده من فريق ون كليك.');
    throw forbidden('تم تعليق حسابك. يرجى التواصل مع الدعم الفني.');
  }

  const totp = await pool.query<{ totp_enabled: boolean }>(`SELECT totp_enabled FROM users WHERE id = $1`, [user.id]);
  if (totp.rows[0]?.totp_enabled) {
    return res.json({ mfaRequired: true, mfaToken: signMfaChallenge(user.id) });
  }

  await issueSession(user.id, user.email, user.name, user.is_super_admin, comp.rows[0], req, res);
}

router.post('/register', async (req, res, next) => {
  try {
    const ip = (req.ip ?? 'unknown').slice(0, 64);

    // SEC-REG-01a: Reject immediately if this IP is already locked.
    const existingLock = checkRegLock(ip);
    if (existingLock > 0) {
      logger.warn({ ip, event: 'reg_ip_locked' }, 'Registration blocked: IP already locked out');
      res.status(429).json({ message: regLockMsg(existingLock) });
      return;
    }

    // Wrap schema parse so validation failures count toward the lockout threshold.
    let body: z.infer<typeof registerSchema>;
    try {
      body = registerSchema.parse(req.body);
    } catch (parseErr: unknown) {
      const lockMins = noteRegAttempt(ip);
      if (lockMins > 0) {
        logger.warn({ ip, event: 'reg_ip_threshold' }, 'Registration blocked: IP hit lockout threshold on parse failure');
        res.status(429).json({ message: regLockMsg(lockMins) });
        return;
      }
      throw parseErr;
    }

    // SEC-REG-02: Honeypot — bots fill hidden fields; real users never see them.
    // Count toward lockout. If threshold just hit, return 429; otherwise silent 200.
    if (body.website && body.website.trim() !== '') {
      const lockMins = noteRegAttempt(ip);
      if (lockMins > 0) {
        logger.warn({ ip, event: 'reg_ip_threshold' }, 'Registration blocked: IP hit lockout threshold via honeypot');
        res.status(429).json({ message: regLockMsg(lockMins) });
        return;
      }
      logger.warn({ ip, event: 'reg_honeypot' }, 'Registration blocked: honeypot field filled');
      res.json({ ok: true, pendingReview: true });
      return;
    }

    // SEC-REG-03: Disposable email domain blocklist.
    // Count toward lockout; if threshold just hit return 429, otherwise 400.
    const emailDomain = body.email.split('@')[1]?.toLowerCase() ?? '';
    if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
      const lockMins = noteRegAttempt(ip);
      if (lockMins > 0) {
        logger.warn({ ip, email: body.email, domain: emailDomain, event: 'reg_ip_threshold' }, 'Registration blocked: IP hit lockout threshold via disposable domain');
        res.status(429).json({ message: regLockMsg(lockMins) });
        return;
      }
      logger.warn({ ip, email: body.email, domain: emailDomain, event: 'reg_disposable_email' }, 'Registration blocked: disposable email domain');
      throw badRequest('يُرجى استخدام بريد إلكتروني دائم. لا يُقبل البريد المؤقت أو المجهول.');
    }

    // Count this as a regular attempt; block immediately if threshold just reached.
    const lockMins = noteRegAttempt(ip);
    if (lockMins > 0) {
      logger.warn({ ip, event: 'reg_ip_threshold' }, 'Registration blocked: IP hit lockout threshold');
      res.status(429).json({ message: regLockMsg(lockMins) });
      return;
    }

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const exists = await c.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
      if (exists.rowCount) throw badRequest('Email already registered');

      const hash = await bcrypt.hash(body.password, 12);
      const userRes = await c.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
        [body.email, hash, body.name],
      );
      const userId = userRes.rows[0].id;

      // Seed invoice_prefix from platform general settings so new companies
      // inherit the admin-configured default rather than the hardcoded 'INV'.
      const platformGeneral = await pool.query(
        `SELECT value FROM platform_settings WHERE key = 'general'`,
      );
      const platformPrefix =
        (platformGeneral.rows[0]?.value as Record<string, unknown> | undefined)?.invoicePrefix;
      const invoicePrefix =
        typeof platformPrefix === 'string' && platformPrefix.trim() ? platformPrefix.trim() : 'INV';

      const compRes = await c.query(
        `INSERT INTO companies (name, email, owner_name, phone, is_active, review_status, invoice_prefix)
         VALUES ($1,$2,$3,$4,false,'pending',$5) RETURNING id`,
        [body.companyName, body.email, body.name, body.phone || null, invoicePrefix],
      );
      const companyId = compRes.rows[0].id;

      await c.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)`, [userId, companyId]);
      await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,'company_admin')`, [userId, companyId]);

      await c.query('COMMIT');

      await audit(pool, {
        companyId, userId,
        action: 'auth.register', entity: 'user', entityId: userId,
        data: { email: body.email, companyName: body.companyName },
      });
      // SEC-08: fire-and-forget verification email; failure must not block signup.
      sendVerificationEmail(userId, body.email).catch(() => { /* logged by email util */ });
      notifyAdminsOfNewSignup({ companyName: body.companyName, email: body.email, phone: body.phone }).catch(() => {});
      // Successful registration — reset IP attempt counter
      clearRegAttempts(ip);
      // Company is pending admin approval — do not issue tokens yet.
      res.json({ ok: true, pendingReview: true });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    checkLock(body.email); // SEC-07
    const u = await pool.query(`SELECT id, password_hash, name, is_super_admin, email_verified_at, disabled FROM users WHERE email = $1`, [body.email]);
    if (!u.rowCount) { noteFailure(body.email); throw unauthorized('Invalid credentials'); }
    const ok = await bcrypt.compare(body.password, u.rows[0].password_hash);
    if (!ok) { noteFailure(body.email); throw unauthorized('Invalid credentials'); }
    noteSuccess(body.email);
    // SEC-09: block login until the email is confirmed (checked inside completeLogin) —
    // before this existed, login only reported `emailVerified` without acting on it, so
    // an unconfirmed (or mistyped) email never blocked anything. Super admins are
    // platform-created accounts, not public signups, so they're exempt there too.
    await completeLogin(
      { id: u.rows[0].id, email: body.email, name: u.rows[0].name, is_super_admin: u.rows[0].is_super_admin, email_verified_at: u.rows[0].email_verified_at, disabled: u.rows[0].disabled },
      req, res,
    );
  } catch (e) { next(e); }
});

/**
 * POST /api/auth/2fa/verify — second step of login when the account has TOTP
 * enabled. Accepts either a live 6-digit TOTP code or a one-time backup code.
 */
router.post('/2fa/verify', async (req, res, next) => {
  try {
    const { mfaToken, code } = z.object({ mfaToken: z.string().min(10), code: z.string().min(6).max(12) }).parse(req.body);
    let payload: { sub: string; t?: string };
    try { payload = jwt.verify(mfaToken, env.JWT_SECRET) as { sub: string; t?: string }; }
    catch { throw unauthorized('انتهت صلاحية جلسة التحقق، سجّل الدخول من جديد'); }
    if (payload.t !== 'mfa') throw unauthorized('Invalid challenge token');

    const u = await pool.query(
      `SELECT id, email, name, is_super_admin, disabled, totp_secret, totp_backup_codes FROM users WHERE id = $1`,
      [payload.sub],
    );
    if (!u.rowCount) throw unauthorized();
    const row = u.rows[0];
    if (row.disabled) throw forbidden('تم تعطيل حسابك. يرجى التواصل مع مدير الشركة.');

    const normalized = code.replace(/\s|-/g, '');
    let valid = row.totp_secret ? authenticator.check(normalized, row.totp_secret) : false;
    let usedBackupCode: string | null = null;
    if (!valid) {
      const hashedInput = sha(normalized.toUpperCase());
      const backupCodes: string[] = row.totp_backup_codes ?? [];
      if (backupCodes.includes(hashedInput)) {
        valid = true;
        usedBackupCode = hashedInput;
      }
    }
    if (!valid) throw unauthorized('رمز التحقق غير صحيح');

    if (usedBackupCode) {
      // One-time use — remove it so it can't be replayed.
      await pool.query(
        `UPDATE users SET totp_backup_codes = array_remove(totp_backup_codes, $2) WHERE id = $1`,
        [row.id, usedBackupCode],
      );
      await audit(pool, { companyId: null, userId: row.id, action: 'auth.2fa_backup_code_used', entity: 'user', entityId: row.id });
    }

    const comp = await pool.query(
      `SELECT c.id, c.name, c.is_active, c.review_status
         FROM user_companies uc JOIN companies c ON c.id = uc.company_id
        WHERE uc.user_id = $1 ORDER BY uc.is_default DESC LIMIT 1`,
      [row.id],
    );
    await issueSession(row.id, row.email, row.name, row.is_super_admin, comp.rows[0], req, res);
  } catch (e) { next(e); }
});

/** SEC-08: confirm an email-verification token. */
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    let payload: { sub: string; t?: string };
    try { payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; t?: string }; }
    catch { throw badRequest('Invalid or expired token'); }
    if (payload.t !== 'v') throw badRequest('Invalid token');
    await pool.query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
      [payload.sub],
    );
    await audit(pool, {
      companyId: null, userId: payload.sub,
      action: 'auth.email_verified', entity: 'user', entityId: payload.sub,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/**
 * SEC-09: re-issue a verification email by address, without requiring a session — a user
 * blocked at login for an unverified email has no token yet, so the authenticated
 * /resend-verification route below is unreachable for them. Mirrors /forgot-password:
 * always responds { ok: true } regardless of whether the email exists or is already
 * verified, so this can't be used to enumerate registered addresses.
 */
router.post('/resend-verification-public', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const u = await pool.query(`SELECT id, email_verified_at FROM users WHERE email = $1`, [email]);
    if (u.rowCount && !u.rows[0].email_verified_at) {
      await sendVerificationEmail(u.rows[0].id, email);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** SEC-08: re-issue a verification email to the authenticated user. */
router.post('/resend-verification', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const u = await pool.query(`SELECT email, email_verified_at FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount) throw unauthorized();
    if (u.rows[0].email_verified_at) return res.json({ ok: true, already: true });
    await sendVerificationEmail(userId, u.rows[0].email);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/refresh', requireCsrf, async (req, res, next) => {
  try {
    const token = readRefreshToken(req);
    if (!token) {
      logger.warn({ refresh_401_reason: 'no_cookie', ip: req.ip }, 'refresh token missing');
      throw unauthorized('Missing refresh token');
    }
    let payload: { sub: string };
    try { payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string }; }
    catch (jwtErr) {
      const reason = (jwtErr as { name?: string }).name === 'TokenExpiredError' ? 'expired' : 'bad_jwt';
      logger.warn({ refresh_401_reason: reason, ip: req.ip }, 'refresh JWT verification failed');
      throw unauthorized('Invalid refresh token');
    }

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const row = await c.query<{ id: string; family_id: string; revoked_at: Date | null; expires_at: Date }>(
        `SELECT id, family_id, revoked_at, expires_at
           FROM refresh_tokens
          WHERE token_hash = $1
          FOR UPDATE`,
        [sha(token)],
      );
      if (!row.rowCount) {
        await c.query('ROLLBACK');
        logger.warn({ refresh_401_reason: 'token_revoked', userId: payload.sub, ip: req.ip }, 'refresh token not found in DB');
        throw unauthorized('Invalid refresh token');
      }
      const r = row.rows[0];

      // Reuse detection: token already revoked → assume theft, nuke the family
      if (r.revoked_at) {
        await c.query(
          `UPDATE refresh_tokens SET revoked_at = now()
            WHERE family_id = $1 AND revoked_at IS NULL`,
          [r.family_id],
        );
        await c.query('COMMIT');
        clearRefreshCookie(res);
        await audit(pool, {
          companyId: null, userId: payload.sub,
          action: 'auth.refresh_reuse_detected', entity: 'user', entityId: payload.sub,
          data: { family_id: r.family_id, ip: req.ip },
        });
        logger.warn({ refresh_401_reason: 'family_revoked', userId: payload.sub, family_id: r.family_id, ip: req.ip }, 'refresh token reuse detected — entire family revoked');
        throw unauthorized('Refresh token reuse detected');
      }
      if (r.expires_at.getTime() < Date.now()) {
        await c.query('ROLLBACK');
        logger.warn({ refresh_401_reason: 'expired', userId: payload.sub, ip: req.ip }, 'refresh token expired');
        throw unauthorized('Refresh token expired');
      }

      // Guard: reject if user has been disabled since the token was issued
      const userCheck = await c.query<{ disabled: boolean }>(
        `SELECT disabled FROM users WHERE id = $1`, [payload.sub],
      );
      if (!userCheck.rowCount || userCheck.rows[0].disabled) {
        await c.query(
          `UPDATE refresh_tokens SET revoked_at = now()
            WHERE family_id = $1 AND revoked_at IS NULL`,
          [r.family_id],
        );
        await c.query('COMMIT');
        clearRefreshCookie(res);
        throw unauthorized('تم تعطيل حسابك. يرجى التواصل مع مدير الشركة.');
      }

      // Rotate: issue a new token in the same family, mark old as replaced+revoked
      const newToken = await issueRefreshToken(c, payload.sub, req, r.family_id);
      const newId = await c.query<{ id: string }>(
        `SELECT id FROM refresh_tokens WHERE token_hash = $1`, [sha(newToken)],
      );
      await c.query(
        `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [r.id, newId.rows[0].id],
      );
      // Track last active time on the newly issued token
      await c.query(
        `UPDATE refresh_tokens SET last_used_at = now() WHERE id = $1`,
        [newId.rows[0].id],
      );
      await c.query('COMMIT');

      setRefreshCookie(res, newToken);
      setCsrfCookie(res);
      res.json({ access_token: signAccess(payload.sub) });
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      c.release();
    }
  } catch (e) { next(e); }
});

router.post('/logout', requireCsrf, async (req, res, next) => {
  try {
    const token = readRefreshToken(req);
    if (token) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)
            AND revoked_at IS NULL`,
        [sha(token)],
      );
    }
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const u = await pool.query(`SELECT id, email, name, is_super_admin, onboarding_done FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount) throw unauthorized();
    const comps = await pool.query(
      `SELECT c.id, c.name, uc.is_default FROM user_companies uc JOIN companies c ON c.id = uc.company_id WHERE uc.user_id = $1`,
      [userId],
    );
    const roles = await pool.query(`SELECT role, company_id FROM user_roles WHERE user_id = $1`, [userId]);

    const userRow = u.rows[0] as { is_super_admin: boolean };
    let has_active_plan = false;
    if (!userRow.is_super_admin && comps.rows.length > 0) {
      const companyId = comps.rows.find((c: { is_default: boolean }) => c.is_default)?.id ?? comps.rows[0]?.id;
      if (companyId) {
        const sub = await pool.query(
          `SELECT 1 FROM subscriptions WHERE company_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
          [companyId],
        );
        has_active_plan = (sub.rowCount ?? 0) > 0;
      }
    } else if (userRow.is_super_admin) {
      has_active_plan = true;
    }

    res.json({ user: u.rows[0], companies: comps.rows, roles: roles.rows, has_active_plan });
  } catch (e) { next(e); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const u = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (u.rowCount) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
        [u.rows[0].id, sha(token)],
      );
      const link = `${env.APP_URL}/reset-password?token=${token}`;
      const branding = await getPlatformBranding();
      await sendEmail({
        to: email,
        subject: `إعادة تعيين كلمة المرور — ${branding.brandName}`,
        html: renderEmail({
          ...branding,
          title: 'إعادة تعيين كلمة المرور',
          previewText: 'طلب إعادة تعيين كلمة المرور الخاصة بك',
          bodyHtml: `<p>تلقّينا طلباً لإعادة تعيين كلمة المرور لحسابك.</p>
                     <p>اضغط على الزر أدناه لإعادة التعيين. الرابط صالح لمدة ساعة واحدة فقط.</p>
                     <p>إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.</p>`,
          ctaLabel: 'إعادة تعيين كلمة المرور',
          ctaUrl: link,
        }),
      });
      await audit(pool, {
        companyId: null, userId: u.rows[0].id,
        action: 'auth.password_reset_request', entity: 'user', entityId: u.rows[0].id,
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = z.object({ token: z.string().min(10), password: z.string().min(8) }).parse(req.body);
    const r = await pool.query(
      `SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha(token)],
    );
    if (!r.rowCount) throw badRequest('Invalid or expired token');
    const hash = await bcrypt.hash(password, 12);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, r.rows[0].user_id]);
      await c.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [r.rows[0].id]);
      await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [r.rows[0].user_id]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    await audit(pool, {
      companyId: null, userId: r.rows[0].user_id,
      action: 'auth.password_reset', entity: 'user', entityId: r.rows[0].user_id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** PATCH /api/auth/profile — update display name */
router.patch('/profile', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().min(2).max(120) }).parse(req.body);
    const userId = req.auth!.userId;
    await pool.query(`UPDATE users SET name = $1, updated_at = now() WHERE id = $2`, [name, userId]);
    await audit(pool, {
      companyId: null, userId,
      action: 'auth.profile_updated', entity: 'user', entityId: userId,
      data: { name },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** POST /api/auth/change-password — change password (requires current password) */
router.post('/change-password', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }).parse(req.body);
    const userId = req.auth!.userId;
    const u = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount) throw unauthorized();
    const ok = await bcrypt.compare(currentPassword, u.rows[0].password_hash);
    if (!ok) throw badRequest('كلمة المرور الحالية غير صحيحة');
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [hash, userId]);
    // Revoke every other active session — a stolen token/session must not
    // survive a password change (same guarantee confirm-email-change gives).
    // The session making this request stays logged in, matching the
    // existing "log out everywhere else" semantics in DELETE /sessions.
    const currentToken = readRefreshToken(req);
    const currentHash = currentToken ? sha(currentToken) : null;
    if (currentHash) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND token_hash != $2`,
        [userId, currentHash],
      );
    } else {
      await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    }
    await audit(pool, {
      companyId: null, userId,
      action: 'auth.password_changed', entity: 'user', entityId: userId,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** POST /api/auth/request-email-change — send verification link to new address */
router.post('/request-email-change', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const { newEmail } = z.object({ newEmail: z.string().email() }).parse(req.body);
    const userId = req.auth!.userId;
    const existing = await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id != $2`, [newEmail, userId]);
    if (existing.rowCount) throw badRequest('هذا البريد الإلكتروني مسجّل بالفعل');
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO email_change_requests (user_id, new_email, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '24 hours')`,
      [userId, newEmail, sha(token)],
    );
    const link = `${env.APP_URL}/confirm-email-change?token=${token}`;
    const branding = await getPlatformBranding();
    await sendEmail({
      to: newEmail,
      subject: `تأكيد تغيير البريد الإلكتروني — ${branding.brandName}`,
      html: renderEmail({
        ...branding,
        title: 'تأكيد تغيير البريد الإلكتروني',
        previewText: 'اضغط لتأكيد بريدك الإلكتروني الجديد',
        bodyHtml: `<p>تلقّينا طلباً لتغيير بريدك الإلكتروني إلى هذا العنوان.</p>
                   <p>اضغط على الزر أدناه لتأكيد التغيير. الرابط صالح لمدة 24 ساعة.</p>
                   <p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>`,
        ctaLabel: 'تأكيد البريد الإلكتروني الجديد',
        ctaUrl: link,
      }),
    });
    await audit(pool, {
      companyId: null, userId,
      action: 'auth.email_change_requested', entity: 'user', entityId: userId,
      data: { newEmail },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** POST /api/auth/confirm-email-change — verify token, update email, revoke other sessions */
router.post('/confirm-email-change', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    const r = await pool.query(
      `SELECT id, user_id, new_email FROM email_change_requests
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha(token)],
    );
    if (!r.rowCount) throw badRequest('الرابط غير صالح أو منتهي الصلاحية');
    const { user_id: userId, new_email: newEmail, id: reqId } = r.rows[0];
    const existing = await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id != $2`, [newEmail, userId]);
    if (existing.rowCount) throw badRequest('هذا البريد الإلكتروني مسجّل بالفعل');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE users SET email = $1, email_verified_at = now(), updated_at = now() WHERE id = $2`, [newEmail, userId]);
      await c.query(`UPDATE email_change_requests SET used_at = now() WHERE id = $1`, [reqId]);
      await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    await audit(pool, {
      companyId: null, userId,
      action: 'auth.email_changed', entity: 'user', entityId: userId,
      data: { newEmail },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** GET /api/auth/sessions — list active sessions for the current user */
router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const currentToken = readRefreshToken(req);
    const currentHash = currentToken ? sha(currentToken) : null;
    const rows = await pool.query<{
      id: string; user_agent: string | null; ip: string | null;
      created_at: Date; last_used_at: Date; token_hash: string;
    }>(
      `SELECT id, user_agent, ip, created_at, last_used_at, token_hash
         FROM refresh_tokens
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_used_at DESC`,
      [userId],
    );
    const sessions = rows.rows.map(r => ({
      id: r.id,
      userAgent: r.user_agent ?? '',
      ip: r.ip ? r.ip.replace(/(\d+\.\d+)\.\d+\.\d+/, '$1.*.*') : '',
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      isCurrent: r.token_hash === currentHash,
    }));
    res.json({ sessions });
  } catch (e) { next(e); }
});

/** DELETE /api/auth/sessions/:id — revoke a specific session */
router.delete('/sessions/:id', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = String(req.params.id);
    const currentToken = readRefreshToken(req);
    const currentHash = currentToken ? sha(currentToken) : null;
    const row = await pool.query(
      `SELECT token_hash FROM refresh_tokens WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [id, userId],
    );
    if (!row.rowCount) throw badRequest('الجلسة غير موجودة');
    if (currentHash && row.rows[0].token_hash === currentHash) {
      throw badRequest('لا يمكن إنهاء الجلسة الحالية من هنا. استخدم تسجيل الخروج بدلاً من ذلك.');
    }
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    await audit(pool, {
      companyId: null, userId,
      action: 'auth.session_revoked', entity: 'refresh_token', entityId: id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** DELETE /api/auth/sessions?others=true — revoke all sessions except the current one */
router.delete('/sessions', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const othersOnly = req.query.others === 'true';
    const currentToken = readRefreshToken(req);
    const currentHash = currentToken ? sha(currentToken) : null;
    if (othersOnly && currentHash) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL AND token_hash != $2`,
        [userId, currentHash],
      );
    } else {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    }
    await audit(pool, {
      companyId: null, userId,
      action: 'auth.all_sessions_revoked', entity: 'user', entityId: userId,
      data: { othersOnly },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- Two-factor authentication (TOTP) ---------- */

function generateBackupCodes(count = 8): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars, e.g. "A1B2C3D4E5"
    plain.push(code);
    hashed.push(sha(code));
  }
  return { plain, hashed };
}

/**
 * POST /api/auth/2fa/setup — generates a new (unconfirmed) TOTP secret and a
 * QR code for the authenticator app. Stored separately from totp_secret so a
 * user who starts setup but never confirms with /2fa/enable never gets
 * locked out of their own account by a secret they didn't finish adopting.
 */
/** GET /api/auth/2fa/status — whether the current user has 2FA enabled. */
router.get('/2fa/status', requireAuth, async (req, res, next) => {
  try {
    const u = await pool.query<{ totp_enabled: boolean }>(`SELECT totp_enabled FROM users WHERE id = $1`, [req.auth!.userId]);
    res.json({ totp_enabled: !!u.rows[0]?.totp_enabled });
  } catch (e) { next(e); }
});

router.post('/2fa/setup', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const u = await pool.query<{ email: string; totp_enabled: boolean }>(`SELECT email, totp_enabled FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount) throw unauthorized();
    if (u.rows[0].totp_enabled) throw badRequest('المصادقة الثنائية مفعّلة بالفعل — ألغِ تفعيلها أولاً لإعادة الإعداد');

    const secret = authenticator.generateSecret();
    await pool.query(`UPDATE users SET totp_pending_secret = $1 WHERE id = $2`, [secret, userId]);
    const branding = await getPlatformBranding();
    const otpauth = authenticator.keyuri(u.rows[0].email, branding.brandName || 'ون كليك', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ secret, qrDataUrl });
  } catch (e) { next(e); }
});

/**
 * POST /api/auth/2fa/enable — confirms the pending secret with a live code
 * from the authenticator app, activates 2FA, and returns one-time backup
 * codes (shown to the user exactly once — only their hashes are stored).
 */
router.post('/2fa/enable', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().min(6).max(8) }).parse(req.body);
    const userId = req.auth!.userId;
    const u = await pool.query<{ totp_pending_secret: string | null }>(`SELECT totp_pending_secret FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount || !u.rows[0].totp_pending_secret) throw badRequest('ابدأ إعداد المصادقة الثنائية أولاً');
    if (!authenticator.check(code.replace(/\s/g, ''), u.rows[0].totp_pending_secret)) {
      throw badRequest('رمز التحقق غير صحيح');
    }
    const { plain, hashed } = generateBackupCodes();
    await pool.query(
      `UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
              totp_enabled = true, totp_backup_codes = $2
       WHERE id = $1`,
      [userId, hashed],
    );
    await audit(pool, { companyId: null, userId, action: 'auth.2fa_enabled', entity: 'user', entityId: userId });
    res.json({ ok: true, backupCodes: plain });
  } catch (e) { next(e); }
});

/** POST /api/auth/2fa/disable — requires the current password to turn 2FA off. */
router.post('/2fa/disable', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
    const userId = req.auth!.userId;
    const u = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
    if (!u.rowCount) throw unauthorized();
    if (!(await bcrypt.compare(password, u.rows[0].password_hash))) throw badRequest('كلمة المرور غير صحيحة');
    await pool.query(
      `UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = false, totp_backup_codes = NULL
       WHERE id = $1`,
      [userId],
    );
    await audit(pool, { companyId: null, userId, action: 'auth.2fa_disabled', entity: 'user', entityId: userId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- Google Sign-In ---------- */

/**
 * POST /api/auth/google — logs in or links an account from a Google ID
 * token (obtained client-side via Google Identity Services). A brand-new
 * Google user has no company yet, so this returns `needsCompanyName` with a
 * short-lived signup token instead of creating an account outright — company
 * signup still goes through the same pending-review gate as a normal
 * registration (see /google/complete below).
 */
router.post('/google', async (req, res, next) => {
  try {
    if (!googleClient || !env.GOOGLE_CLIENT_ID) throw badRequest('تسجيل الدخول بجوجل غير مفعّل حاليًا');
    const { idToken } = z.object({ idToken: z.string().min(10) }).parse(req.body);

    let payload: { sub: string; email?: string; email_verified?: boolean; name?: string };
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p) throw new Error('empty payload');
      payload = p;
    } catch {
      throw unauthorized('تعذّر التحقق من حساب جوجل');
    }
    if (!payload.email || !payload.email_verified) throw unauthorized('حساب جوجل بدون بريد إلكتروني مؤكّد');

    const byGoogleId = await pool.query(
      `SELECT id, email, name, is_super_admin, disabled FROM users WHERE google_id = $1`,
      [payload.sub],
    );
    if (byGoogleId.rowCount) {
      const row = byGoogleId.rows[0];
      return completeLogin({ ...row, email_verified_at: new Date() }, req, res);
    }

    const byEmail = await pool.query(
      `SELECT id, email, name, is_super_admin, disabled FROM users WHERE email = $1`,
      [payload.email],
    );
    if (byEmail.rowCount) {
      // Existing password-based account with the same (Google-confirmed) email — link it.
      const row = byEmail.rows[0];
      await pool.query(
        `UPDATE users SET google_id = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2`,
        [payload.sub, row.id],
      );
      await audit(pool, { companyId: null, userId: row.id, action: 'auth.google_linked', entity: 'user', entityId: row.id });
      return completeLogin({ ...row, email_verified_at: new Date() }, req, res);
    }

    // No local account at all — need a company name before we can create one.
    res.json({
      needsCompanyName: true,
      googleSignupToken: signGoogleSignup(payload.sub, payload.email, payload.name ?? payload.email),
    });
  } catch (e) { next(e); }
});

/**
 * POST /api/auth/google/complete — finishes signup for a brand-new Google
 * user by pairing their verified identity with a company name. Mirrors
 * /register: the company starts in 'pending' review, no tokens are issued
 * yet. The account gets a random, unusable password hash since it has no
 * password — "forgot password" can be used later to set a real one.
 */
router.post('/google/complete', async (req, res, next) => {
  try {
    const { googleSignupToken, companyName } = z.object({
      googleSignupToken: z.string().min(10),
      companyName: z.string().min(2),
    }).parse(req.body);

    let payload: { sub: string; t?: string; email: string; name: string };
    try { payload = jwt.verify(googleSignupToken, env.JWT_SECRET) as typeof payload; }
    catch { throw badRequest('انتهت صلاحية الجلسة، سجّل الدخول بجوجل من جديد'); }
    if (payload.t !== 'gsignup') throw badRequest('Invalid token');

    const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1 OR google_id = $2`, [payload.email, payload.sub]);
    if (exists.rowCount) throw badRequest('هذا البريد الإلكتروني مسجّل بالفعل — سجّل الدخول بدلاً من ذلك');

    const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const userRes = await c.query(
        `INSERT INTO users (email, password_hash, name, google_id, email_verified_at) VALUES ($1,$2,$3,$4,now()) RETURNING id`,
        [payload.email, randomPasswordHash, payload.name, payload.sub],
      );
      const userId = userRes.rows[0].id;
      const platformGeneral = await pool.query(`SELECT value FROM platform_settings WHERE key = 'general'`);
      const platformPrefix = (platformGeneral.rows[0]?.value as Record<string, unknown> | undefined)?.invoicePrefix;
      const invoicePrefix = typeof platformPrefix === 'string' && platformPrefix.trim() ? platformPrefix.trim() : 'INV';

      const compRes = await c.query(
        `INSERT INTO companies (name, email, owner_name, is_active, review_status, invoice_prefix)
         VALUES ($1,$2,$3,false,'pending',$4) RETURNING id`,
        [companyName, payload.email, payload.name, invoicePrefix],
      );
      const companyId = compRes.rows[0].id;
      await c.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)`, [userId, companyId]);
      await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,'company_admin')`, [userId, companyId]);
      await c.query('COMMIT');
      await audit(pool, {
        companyId, userId, action: 'auth.register_google', entity: 'user', entityId: userId,
        data: { email: payload.email, companyName },
      });
      notifyAdminsOfNewSignup({ companyName, email: payload.email }).catch(() => {});
      res.json({ ok: true, pendingReview: true });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) { next(e); }
});

export default router;
