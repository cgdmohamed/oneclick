/**
 * Lightweight helper that reads brand name, primary colour, and logo URL
 * from the platform_settings table.  The result is cached in memory for the
 * process lifetime so there is no DB round-trip per email.
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
