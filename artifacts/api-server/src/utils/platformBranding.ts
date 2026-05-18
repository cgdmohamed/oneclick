/**
 * Lightweight helper that reads brand name, primary colour, and logo URL
 * from the platform_settings table.  The result is cached in memory for the
 * process lifetime so there is no DB round-trip per email.
 *
 * `getCompanyBranding` merges company-level overrides on top of platform
 * defaults, so individual companies can use their own brand colour in the
 * emails they send to clients.
 */
import { pool } from '../db/client.js';

export interface PlatformBranding {
  brandName: string;
  brandColor: string;
  logoUrl: string | null;
}

let cached: PlatformBranding | null = null;

export function invalidateBrandingCache(): void {
  cached = null;
}

export async function getPlatformBranding(): Promise<PlatformBranding> {
  if (cached) return cached;
  try {
    const rs = await pool.query(
      `SELECT key, value FROM platform_settings WHERE key IN ('branding', 'general')`,
    );
    const byKey: Record<string, Record<string, unknown>> = {};
    for (const row of rs.rows as { key: string; value: Record<string, unknown> }[]) {
      byKey[row.key] = row.value;
    }
    const branding = byKey['branding'] ?? {};
    const general  = byKey['general']  ?? {};
    cached = {
      brandName:  String(branding['name']         ?? general['appName'] ?? 'ون كليك'),
      brandColor: String(branding['primaryColor']  ?? '#2563eb'),
      logoUrl:    (branding['logoFullUrl'] as string | null | undefined) || null,
    };
  } catch {
    cached = { brandName: 'ون كليك', brandColor: '#2563eb', logoUrl: null };
  }
  return cached;
}

/**
 * Returns branding for emails sent on behalf of a specific company.
 * The company's `email_brand_color` overrides the platform colour when set;
 * everything else (name, logo) falls back to the platform defaults.
 */
export async function getCompanyBranding(
  db: { query: typeof pool.query },
  companyId: string,
): Promise<PlatformBranding> {
  const platform = await getPlatformBranding();
  try {
    const rs = await db.query(
      `SELECT email_brand_color FROM companies WHERE id = $1`,
      [companyId],
    );
    const color = rs.rows[0]?.email_brand_color as string | null | undefined;
    if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) {
      return { ...platform, brandColor: color };
    }
  } catch {
    // fall through to platform defaults
  }
  return platform;
}
