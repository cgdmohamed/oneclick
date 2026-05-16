/**
 * SMTP settings stored locally so users can plug in their own outgoing
 * mail server. When a backend is wired up later, swap the storage layer
 * here without touching call sites.
 */
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

const KEY = 'smtp-settings';

export const emptySmtp: SmtpSettings = {
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromName: '',
  fromEmail: '',
};

export const loadSmtp = (): SmtpSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySmtp;
    return { ...emptySmtp, ...JSON.parse(raw) };
  } catch {
    return emptySmtp;
  }
};

export const saveSmtp = (s: SmtpSettings) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
};

export const isSmtpConfigured = (s: SmtpSettings = loadSmtp()) =>
  !!(s.host && s.port && s.username && s.fromEmail);
