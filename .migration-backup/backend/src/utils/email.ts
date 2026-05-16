import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { enqueueEmail } from './emailQueue.js';

let cached: Transporter | null = null;

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

/**
 * Direct/synchronous send — used by the queue worker and as a fallback.
 * Application code should generally call `sendEmail()` which enqueues.
 */
export async function sendEmailNow(opts: EmailPayload) {
  const tr = getTransporter();
  if (!tr) {
    console.log('[email] SMTP not configured — would send:', { to: opts.to, subject: opts.subject });
    return { skipped: true };
  }
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
    from: env.SMTP_FROM ?? 'no-reply@hesabat.local',
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
