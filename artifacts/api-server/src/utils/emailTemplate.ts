/**
 * Shared HTML email template.
 * All output is RTL/Arabic-ready: dir="rtl", text-align:right, table-based
 * layout for maximum email-client compatibility.
 */

export interface RenderEmailOptions {
  brandName: string;
  brandColor: string;
  logoUrl?: string | null;
  title: string;
  previewText?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
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

export function renderEmail(opts: RenderEmailOptions): string {
  const { brandName, brandColor, logoUrl, title, previewText, bodyHtml, ctaLabel, ctaUrl, footerNote } = opts;

  const previewSnippet = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:transparent;line-height:1px;mso-hide:all">${previewText}&nbsp;</div>`
    : '';

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:48px;max-width:180px;display:block" />`
    : `<span style="font-size:22px;font-weight:bold;color:#ffffff">${brandName}</span>`;

  const ctaRow = ctaLabel && ctaUrl
    ? `<tr>
        <td style="padding:4px 32px 28px 32px;text-align:center">
          <a href="${ctaUrl}"
             style="display:inline-block;background:${brandColor};color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">
            ${ctaLabel}
          </a>
        </td>
      </tr>`
    : '';

  const footer = footerNote ?? `هذه رسالة تلقائية من ${brandName}، يُرجى عدم الرد عليها.`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Cairo,Tajawal,Arial,Helvetica,sans-serif;direction:rtl">
${previewSnippet}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:32px 16px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:${brandColor};padding:20px 32px;text-align:right">
            ${logoHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px 32px;text-align:right">
            <h1 style="margin:0;font-size:22px;color:#111827;font-weight:bold">${title}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 24px 32px;color:#374151;font-size:15px;line-height:1.75;text-align:right">
            ${bodyHtml}
          </td>
        </tr>
        ${ctaRow}
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;text-align:right">
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
