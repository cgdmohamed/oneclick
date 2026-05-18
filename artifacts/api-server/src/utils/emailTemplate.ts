/**
 * Shared branded HTML email template.
 *
 * All system emails are in Arabic (RTL). Branding values (name, logo,
 * primary color) are fetched from the `platform_settings` table with safe
 * defaults so emails render correctly even on a fresh install.
 *
 * The result is cached in-process for the lifetime of the server so every
 * email does not incur a DB round-trip.
 */
import { pool } from '../db/client.js';

export interface EmailBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

const DEFAULT_BRANDING: EmailBranding = {
  name: 'المنصة',
  logoUrl: null,
  primaryColor: '#2563eb',
};

let _cachedBranding: EmailBranding | null = null;

/** Fetch brand settings once per process, falling back to safe defaults. */
export async function getPlatformBranding(): Promise<EmailBranding> {
  if (_cachedBranding) return _cachedBranding;
  try {
    const rs = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'branding'`,
    );
    const v = rs.rows[0]?.value as Record<string, unknown> | undefined;
    _cachedBranding = {
      name:
        typeof v?.name === 'string' && v.name.trim()
          ? v.name.trim()
          : DEFAULT_BRANDING.name,
      logoUrl:
        typeof v?.logoFullUrl === 'string' && v.logoFullUrl.trim()
          ? v.logoFullUrl.trim()
          : null,
      primaryColor:
        typeof v?.primaryColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.primaryColor)
          ? v.primaryColor
          : DEFAULT_BRANDING.primaryColor,
    };
    return _cachedBranding;
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** Call this when branding settings are updated so the next email re-fetches. */
export function invalidateBrandingCache(): void {
  _cachedBranding = null;
}

/** Map internal role identifiers to Arabic display labels. */
export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin:   'مدير النظام',
    company_admin: 'مدير الشركة',
    accountant:    'محاسب',
    sales:         'مبيعات',
    viewer:        'مستعرض',
  };
  return map[role] ?? role;
}

/** Format a Date or ISO string as a human-readable Arabic date (e.g. 25 مايو 2026). */
export function formatArabicDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Build a complete, inline-styled Arabic RTL HTML email.
 *
 * @param opts.previewText - Optional short text shown in inbox preview (hidden in body)
 * @param opts.title       - Large heading shown inside the card
 * @param opts.body        - Inner HTML (paragraphs, lists, etc.)
 * @param opts.cta         - Optional call-to-action button
 * @param opts.branding    - Brand values from getPlatformBranding()
 */
export function buildEmail(opts: {
  previewText?: string;
  title: string;
  body: string;
  cta?: { text: string; url: string };
  branding: EmailBranding;
}): string {
  const { previewText, title, body, cta, branding } = opts;
  const pc = branding.primaryColor;
  const year = new Date().getFullYear();

  const previewBlock = previewText
    ? `<span style="display:none;font-size:1px;color:#f3f4f6;max-height:0;max-width:0;opacity:0;overflow:hidden">${previewText}&zwnj;&nbsp;</span>`
    : '';

  const logoBlock = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.name}" height="36"
            style="display:block;height:36px;max-width:180px;object-fit:contain" />`
    : `<span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">${branding.name}</span>`;

  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px auto 0">
         <tr>
           <td style="border-radius:8px;background:${pc}">
             <a href="${cta.url}"
                style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;
                       color:#ffffff;text-decoration:none;border-radius:8px;
                       font-family:Cairo,Tajawal,Arial,sans-serif">${cta.text}</a>
           </td>
         </tr>
       </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Cairo,Tajawal,Arial,sans-serif;direction:rtl">
  ${previewBlock}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f3f4f6;padding:40px 16px">
    <tr>
      <td align="center">
        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,.08)">
          <!-- Header bar -->
          <tr>
            <td style="background:${pc};padding:24px 32px;text-align:right">
              ${logoBlock}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px 32px 28px;color:#1a1a1a;
                       font-size:15px;line-height:1.8;text-align:right">
              <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#111827">${title}</h2>
              ${body}
              ${ctaBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;text-align:center;
                       color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 4px">© ${year} ${branding.name} — جميع الحقوق محفوظة</p>
              <p style="margin:0">هذا البريد أُرسل تلقائياً، يُرجى عدم الرد عليه مباشرةً.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
