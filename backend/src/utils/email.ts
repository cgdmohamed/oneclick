import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let cached: Transporter | null = null;

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

export async function sendEmail(opts: {
  to: string; subject: string; html?: string; text?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  const tr = getTransporter();
  if (!tr) {
    console.log('[email] SMTP not configured — would send:', { to: opts.to, subject: opts.subject });
    return { skipped: true };
  }
  return tr.sendMail({
    from: env.SMTP_FROM ?? 'no-reply@hesabat.local',
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });
}
