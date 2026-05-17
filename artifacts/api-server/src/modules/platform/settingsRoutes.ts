/**
 * Platform settings — key/value store for branding, landing content, and tracking.
 *
 * publicSettingsRouter  — GET /:key (no auth required, used by public pages)
 * adminSettingsRouter   — PUT /:key (super_admin only, mounted inside protected platform routes)
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { audit } from '../../utils/audit.js';

const ALLOWED_KEYS = ['branding', 'landing_content', 'tracking', 'general'] as const;
type SettingsKey = typeof ALLOWED_KEYS[number];

const isAllowedKey = (k: string): k is SettingsKey =>
  (ALLOWED_KEYS as readonly string[]).includes(k);

/**
 * Per-key defaults returned when no row exists in platform_settings.
 * These match the frontend DEFAULT_BRAND / DEFAULT_LANDING / DEFAULT_TRACKING
 * structures so API consumers never receive a bare {} and can safely access
 * nested fields on a fresh install.
 */
const KEY_DEFAULTS: Record<SettingsKey, Record<string, unknown>> = {
  general: {
    appName: 'ون كليك',
    supportEmail: 'support@oneclick.eg',
    currency: 'ر.س',
    invoicePrefix: 'INV',
  },
  branding: {
    name: 'ون كليك',
    tagline: 'منصة محاسبة سحابية',
    logoFullUrl: '',
    logoIconUrl: '',
    fontFamily: "'Cairo', 'Tajawal', 'Inter', system-ui, sans-serif",
    fontWeight: 'font-extrabold',
    tracking: 'tracking-tight',
  },
  landing_content: {
    hero: {
      enabled: true,
      eyebrow: 'منصة محاسبة سحابية للشركات العربية',
      title: 'إدارة محاسبة شركتك',
      titleHighlight: 'بسهولة وذكاء وأمان',
      subtitle: 'ون كليك منصة سحابية متكاملة لإصدار الفواتير، تحصيل المدفوعات، إدارة المخزون، ومتابعة أعمالك من مكان واحد.',
      primary: { label: 'ابدأ الآن مجاناً', url: '/register' },
      secondary: { label: 'استعرض المميزات', url: '/features' },
      imageUrl: '',
      showImage: true,
      showBrowserFrame: true,
      borderWidth: 1,
      borderRadius: 16,
      shadowIntensity: 'elev',
    },
    stats: { enabled: true, items: [] },
    logos: { enabled: true, title: '', items: [] },
    bento: { enabled: true, eyebrow: '', title: '', desc: '', items: [] },
    showcase: { enabled: true },
    testimonials: { enabled: true, eyebrow: '', title: '', items: [] },
    faq: { enabled: true, eyebrow: '', title: '', items: [] },
    cta: {
      enabled: true,
      title: 'جاهز لتطوير محاسبة شركتك؟',
      subtitle: 'ابدأ تجربتك الآن دون الحاجة لبطاقة ائتمان.',
      primary: { label: 'ابدأ مجاناً', url: '/register' },
      secondary: { label: 'عرض الأسعار', url: '/pricing' },
    },
  },
  tracking: {
    consentRequired: true,
    privateAppRoutes: true,
    ga4: { enabled: false, measurementId: '' },
    gtm: { enabled: false, containerId: '' },
    metaPixel: { enabled: false, pixelId: '' },
    linkedinInsight: { enabled: false, partnerId: '' },
    microsoftClarity: { enabled: false, projectId: '' },
    tiktokPixel: { enabled: false, pixelId: '' },
    hotjar: { enabled: false, siteId: '', version: '6' },
    posthog: { enabled: false, apiKey: '', apiHost: 'https://us.i.posthog.com' },
  },
};

/* ---- Public GET router ---- */
export const publicSettingsRouter = Router();

publicSettingsRouter.get('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!isAllowedKey(key)) return res.status(404).json({ message: 'Unknown settings key' });

    const rs = await pool.query(
      `SELECT value FROM platform_settings WHERE key = $1`,
      [key],
    );
    res.json({ data: rs.rowCount ? rs.rows[0].value : KEY_DEFAULTS[key] });
  } catch (e) { next(e); }
});

/* ---- Admin PUT router (requireSuperAdmin is already applied by the parent platform router) ---- */
export const adminSettingsRouter = Router();

adminSettingsRouter.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!isAllowedKey(key)) return res.status(404).json({ message: 'Unknown settings key' });

    z.record(z.unknown()).parse(req.body);

    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, req.body],
    );

    await audit(pool, {
      companyId: null,
      userId: req.auth!.userId,
      action: `platform_settings.update`,
      entity: 'platform_settings',
      entityId: null,
      data: { key },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});
