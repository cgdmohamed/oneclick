import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { enqueueEmail } from './emailQueue.js';
import { decryptSmtpPassword } from './crypto.js';

let cached: Transporter | null = null;

export interface SmtpOverride {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  smtpOverride?: SmtpOverride;
}

export function getTransporter(): Transporter | null {
  if (cached) return cached;
  if (!env.SMTP_HOST) return null;
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return cached;
}

function buildOverrideTransporter(override: SmtpOverride): Transporter {
  // Decrypt password here — at the last possible moment before use — so the
  // encrypted form is what travels through the queue and is never written to
  // logs or the pg-boss job payload in plaintext.
  const pass = override.password ? decryptSmtpPassword(override.password) : '';
  return nodemailer.createTransport({
    host: override.host,
    port: override.port,
    secure: override.secure,
    auth: override.username ? { user: override.username, pass } : undefined,
  });
}

/**
 * Direct/synchronous send — used by the queue worker and as a fallback.
 * Application code should generally call `sendEmail()` which enqueues.
 */
export async function sendEmailNow(opts: EmailPayload) {
  const override = opts.smtpOverride;
  const tr = (override?.host) ? buildOverrideTransporter(override) : getTransporter();
  if (!tr) {
    console.log('[email] SMTP not configured — would send:', { to: opts.to, subject: opts.subject });
    return { skipped: true };
  }
  const fromAddr = override?.fromEmail
    ? (override.fromName ? `"${override.fromName}" <${override.fromEmail}>` : override.fromEmail)
    : (env.SMTP_FROM ?? 'no-reply@hesabat.local');
  // Re-hydrate attachments if they were JSON-serialised through the queue.
  const attachments = opts.attachments?.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: typeof a.content === 'string'
      ? Buffer.from(a.content, 'base64')
      : Buffer.isBuffer(a.content)
        ? a.content
        : Buffer.from((a.content as { data: number[] }).data ?? []),
  }));
  return tr.sendMail({
    from: fromAddr,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments,
  });
}

/**
 * Enqueue an email for background delivery (SCL-03). Returns immediately.
 * Falls back to inline send if the queue is unavailable.
 */
export async function sendEmail(opts: EmailPayload) {
  // Serialise attachment buffers as base64 so they survive JSON storage in pg-boss.
  const payload: EmailPayload = opts.attachments
    ? {
        ...opts,
        attachments: opts.attachments.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString('base64')
            : a.content,
        })),
      }
    : opts;
  const id = await enqueueEmail(payload);
  return { queued: id !== null, jobId: id };
}
