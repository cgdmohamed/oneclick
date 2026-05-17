/**
 * useLandingContent — Super-admin–controlled CMS for the public marketing pages.
 * Persisted to the database via /api/platform/settings/landing_content.
 */
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import heroDefault from '@/assets/landing-hero.jpg';
import { API_URL, api, isApiConfigured } from '@/lib/api';
import { onSettingsUpdate, postSettingsUpdate } from '@/lib/platformSettingsChannel';

export interface CTA { label: string; url: string }
export interface StatItem { id: string; value: string; label: string }
export interface BentoItem { id: string; icon: string; title: string; desc: string; tone?: 'default' | 'accent' | 'dark'; size?: 'sm' | 'md' | 'lg' }
export interface LogoItem { id: string; name: string; logoUrl?: string }
export interface Testimonial { id: string; name: string; role: string; quote: string; initials: string }
export interface FaqItem { id: string; q: string; a: string }

export interface LandingContent {
  hero: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    titleHighlight: string;
    subtitle: string;
    primary: CTA;
    secondary: CTA;
    imageUrl: string;
    showImage: boolean;
    showBrowserFrame: boolean;
    borderWidth: number;
    borderRadius: number;
    shadowIntensity: 'none' | 'soft' | 'elev' | 'glow';
  };
  stats: { enabled: boolean; items: StatItem[] };
  logos: { enabled: boolean; title: string; items: LogoItem[] };
  bento: { enabled: boolean; eyebrow: string; title: string; desc: string; items: BentoItem[] };
  showcase: { enabled: boolean };
  testimonials: { enabled: boolean; eyebrow: string; title: string; items: Testimonial[] };
  faq: { enabled: boolean; eyebrow: string; title: string; items: FaqItem[] };
  cta: { enabled: boolean; title: string; subtitle: string; primary: CTA; secondary: CTA };
}

const SETTINGS_KEY = 'landing_content';

export const DEFAULT_LANDING: LandingContent = {
  hero: {
    enabled: true,
    eyebrow: 'منصة محاسبة سحابية للشركات العربية',
    title: 'إدارة محاسبة شركتك',
    titleHighlight: 'بسهولة وذكاء وأمان',
    subtitle:
      'ون كليك منصة سحابية متكاملة لإصدار الفواتير، تحصيل المدفوعات، إدارة المخزون، ومتابعة أعمالك من مكان واحد — كل ذلك بنقرة واحدة وبواجهة عربية أصيلة.',
    primary: { label: 'ابدأ الآن مجاناً', url: '/register' },
    secondary: { label: 'استعرض المميزات', url: '/features' },
    imageUrl: heroDefault,
    showImage: true,
    showBrowserFrame: true,
    borderWidth: 1,
    borderRadius: 16,
    shadowIntensity: 'elev',
  },
  stats: {
    enabled: true,
    items: [
      { id: 's1', value: '99.9%', label: 'جاهزية الخدمة' },
      { id: 's2', value: '+180K', label: 'فاتورة شهرياً' },
      { id: 's3', value: '+2,400', label: 'شركة تثق بنا' },
      { id: 's4', value: '24/7', label: 'دعم فني عربي' },
    ],
  },
  logos: {
    enabled: true,
    title: 'موثوقون من قِبل أكثر من 2,400 شركة عربية',
    items: [
      { id: 'l1', name: 'مؤسسة الزهور' },
      { id: 'l2', name: 'شركة الأفق' },
      { id: 'l3', name: 'مجموعة النيل' },
      { id: 'l4', name: 'دار الإبداع' },
      { id: 'l5', name: 'بيت الخبرة' },
      { id: 'l6', name: 'منار التجارة' },
    ],
  },
  bento: {
    enabled: true,
    eyebrow: 'المميزات',
    title: 'كل ما تحتاجه شركتك في منصة واحدة',
    desc: 'مصممة خصيصاً للسوق العربي بأحدث المعايير التقنية.',
    items: [
      { id: 'b1', icon: 'FileText', title: 'فواتير ذكية', desc: 'فواتير عربية احترافية مع ضريبة وخصم تلقائيين وروابط مشاركة فورية.', size: 'lg', tone: 'accent' },
      { id: 'b2', icon: 'CreditCard', title: 'تحصيل مرن', desc: 'دفعات كاملة أو جزئية على عدة طرق دفع.', size: 'sm' },
      { id: 'b3', icon: 'BarChart3', title: 'تقارير دقيقة', desc: 'لوحات تحكم وتقارير تساعدك على اتخاذ قرارات أعمالك.', size: 'md' },
      { id: 'b4', icon: 'Package', title: 'مخزون وتنبيهات', desc: 'تتبع كميات المنتجات مع إنذار الحد الأدنى.', size: 'sm' },
      { id: 'b5', icon: 'ShieldCheck', title: 'أمان مؤسسي', desc: 'تشفير، عزل بيانات، نسخ احتياطي، وصلاحيات دقيقة.', size: 'md', tone: 'dark' },
      { id: 'b6', icon: 'Wallet', title: 'حسابات موحّدة', desc: 'خزائن وحسابات بنكية ومحافظ في مكان واحد.', size: 'sm' },
    ],
  },
  showcase: { enabled: true },
  testimonials: {
    enabled: true,
    eyebrow: 'قالوا عنّا',
    title: 'يحبّها أصحاب الأعمال العربية',
    items: [
      { id: 't1', name: 'سارة العتيبي', role: 'مديرة مالية، مؤسسة الزهور', quote: 'ون كليك وفّرت عليّ ساعات أسبوعياً في إعداد الفواتير والتقارير. أصبحت أعرف وضع الشركة لحظياً وبنقرة واحدة.', initials: 'س' },
      { id: 't2', name: 'محمد القاسم', role: 'مؤسس، شركة الأفق', quote: 'الواجهة العربية ممتازة، والتطبيق سريع ومرتب. فريقي تأقلم معه في يوم واحد فقط.', initials: 'م' },
      { id: 't3', name: 'نوال حماد', role: 'محاسبة، دار الإبداع', quote: 'تقارير المتبقي والمدفوعات سهّلت متابعة العملاء وتقليل التأخيرات بنسبة كبيرة.', initials: 'ن' },
    ],
  },
  faq: {
    enabled: true,
    eyebrow: 'الأسئلة الشائعة',
    title: 'كل ما تريد معرفته قبل البدء',
    items: [
      { id: 'f1', q: 'هل أحتاج بطاقة ائتمان للبدء؟', a: 'لا، تجربتك تبدأ مجاناً دون الحاجة لأي بيانات دفع، يمكنك الترقية لاحقاً.' },
      { id: 'f2', q: 'هل المنصة متوافقة مع متطلبات الفوترة الإلكترونية؟', a: 'نعم، نولّد فواتير عربية احترافية مع رمز QR ودعم الضرائب القابلة للتخصيص.' },
      { id: 'f3', q: 'هل يمكنني إضافة عدة مستخدمين بصلاحيات مختلفة؟', a: 'بالتأكيد، لكل دور صلاحيات مرنة: مدير، محاسب، مبيعات، مشاهدة.' },
      { id: 'f4', q: 'هل بياناتي آمنة؟', a: 'نستخدم تشفير TLS 1.3، عزل كامل لبيانات كل شركة، ونسخ احتياطي يومي.' },
      { id: 'f5', q: 'هل أستطيع الإلغاء في أي وقت؟', a: 'نعم، يمكنك الترقية أو التراجع أو الإلغاء في أي وقت من إعدادات الاشتراك.' },
    ],
  },
  cta: {
    enabled: true,
    title: 'جاهز لتطوير محاسبة شركتك؟',
    subtitle: 'ابدأ تجربتك الآن دون الحاجة لبطاقة ائتمان، واكتشف الفرق.',
    primary: { label: 'ابدأ مجاناً', url: '/register' },
    secondary: { label: 'عرض الأسعار', url: '/pricing' },
  },
};

function mergeContent(stored: Partial<LandingContent>): LandingContent {
  return {
    hero: { ...DEFAULT_LANDING.hero, ...(stored.hero ?? {}) },
    stats: { ...DEFAULT_LANDING.stats, ...(stored.stats ?? {}) },
    logos: { ...DEFAULT_LANDING.logos, ...(stored.logos ?? {}) },
    bento: { ...DEFAULT_LANDING.bento, ...(stored.bento ?? {}) },
    showcase: { ...DEFAULT_LANDING.showcase, ...(stored.showcase ?? {}) },
    testimonials: { ...DEFAULT_LANDING.testimonials, ...(stored.testimonials ?? {}) },
    faq: { ...DEFAULT_LANDING.faq, ...(stored.faq ?? {}) },
    cta: { ...DEFAULT_LANDING.cta, ...(stored.cta ?? {}) },
  };
}

async function fetchLandingContent(): Promise<LandingContent> {
  try {
    const res = await fetch(`${API_URL}/api/platform/settings/${SETTINGS_KEY}`, {
      credentials: 'include',
    });
    if (!res.ok) return DEFAULT_LANDING;
    const json = await res.json() as { data: Partial<LandingContent> };
    return mergeContent(json.data ?? {});
  } catch {
    return DEFAULT_LANDING;
  }
}

export const useLandingContent = () => {
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING);

  useEffect(() => {
    if (!isApiConfigured()) return;
    fetchLandingContent().then(setContent);

    return onSettingsUpdate(SETTINGS_KEY, () => {
      toast('تم تحديث محتوى الصفحة الرئيسية من تبويب آخر', {
        description: 'قد تكون مسوداتك الحالية قديمة.',
        action: { label: 'تحديث', onClick: () => fetchLandingContent().then(setContent) },
        duration: 12000,
      });
    });
  }, []);

  const save = useCallback(async (next: LandingContent) => {
    setContent(next);
    if (!isApiConfigured()) return;
    await api.put(`/api/platform/settings/${SETTINGS_KEY}`, next);
    postSettingsUpdate(SETTINGS_KEY);
  }, []);

  const reset = useCallback(async () => {
    setContent(DEFAULT_LANDING);
    if (!isApiConfigured()) return;
    await api.put(`/api/platform/settings/${SETTINGS_KEY}`, DEFAULT_LANDING);
    postSettingsUpdate(SETTINGS_KEY);
  }, []);

  return { content, save, reset };
};
