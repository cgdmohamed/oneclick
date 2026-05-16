/**
 * TrackingScripts — Injects marketing/analytics tags into the document head
 * based on TrackingSettings, fires pageviews on route changes, exposes a
 * trackEvent helper, and renders a lightweight consent banner.
 *
 * All providers are loaded only when:
 *   - enabled with a valid ID, AND
 *   - the current route is not a private /app or /admin page (when configured), AND
 *   - the user granted consent (when configured).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Cookie } from 'lucide-react';
import {
  useTrackingSettings,
  getConsent,
  setConsent,
  hasConsentDecision,
  type TrackingSettings,
} from '@/hooks/useTrackingSettings';

/* ---------- Global typings for injected SDKs ---------- */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
    ttq?: { load: (id: string) => void; page: () => void; track: (e: string, p?: unknown) => void };
    clarity?: (...args: unknown[]) => void;
    hj?: ((...args: unknown[]) => void) & { q?: unknown[] };
    _hjSettings?: { hjid: number; hjsv: number };
    lintrk?: ((action: string, data?: unknown) => void) & { q?: unknown[] };
    _linkedin_partner_id?: string;
    _linkedin_data_partner_ids?: string[];
    posthog?: { capture: (e: string, p?: unknown) => void; init: (k: string, o: unknown) => void };
  }
}

/* ---------- Script loader (deduped via id) ---------- */
const loadScript = (id: string, attrs: Record<string, string>, inner?: string) => {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.id = id;
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  if (inner) s.text = inner;
  document.head.appendChild(s);
};

/* ---------- Per-provider initializers ---------- */
const initGA4 = (id: string) => {
  loadScript(`ga4-loader`, { src: `https://www.googletagmanager.com/gtag/js?id=${id}`, async: 'true' });
  loadScript(`ga4-init`, {}, `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', '${id}', { send_page_view: false });
  `);
};

const initGTM = (id: string) => {
  loadScript(`gtm-init`, {}, `
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
    var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;
    j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${id}');
  `);
};

const initMetaPixel = (id: string) => {
  loadScript(`meta-pixel-init`, {}, `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${id}');
  `);
};

const initLinkedIn = (id: string) => {
  loadScript(`linkedin-init`, {}, `
    _linkedin_partner_id = "${id}";
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(_linkedin_partner_id);
    (function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[];}
    var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");
    b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";
    s.parentNode.insertBefore(b,s);})(window.lintrk);
  `);
};

const initClarity = (id: string) => {
  loadScript(`clarity-init`, {}, `
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${id}");
  `);
};

const initTikTok = (id: string) => {
  loadScript(`tiktok-init`, {}, `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};
        var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
        var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${id}');
    }(window, document, 'ttq');
  `);
};

const initHotjar = (id: string, version: string) => {
  loadScript(`hotjar-init`, {}, `
    (function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
    h._hjSettings={hjid:${id},hjsv:${version}};a=o.getElementsByTagName('head')[0];
    r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
    a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
  `);
};

const initPostHog = (key: string, host: string) => {
  loadScript(`posthog-init`, {}, `
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${key}',{api_host:'${host}'});
  `);
};

/* ---------- Provider activation ---------- */
const activate = (s: TrackingSettings) => {
  if (s.ga4.enabled && s.ga4.measurementId) initGA4(s.ga4.measurementId);
  if (s.gtm.enabled && s.gtm.containerId) initGTM(s.gtm.containerId);
  if (s.metaPixel.enabled && s.metaPixel.pixelId) initMetaPixel(s.metaPixel.pixelId);
  if (s.linkedinInsight.enabled && s.linkedinInsight.partnerId) initLinkedIn(s.linkedinInsight.partnerId);
  if (s.microsoftClarity.enabled && s.microsoftClarity.projectId) initClarity(s.microsoftClarity.projectId);
  if (s.tiktokPixel.enabled && s.tiktokPixel.pixelId) initTikTok(s.tiktokPixel.pixelId);
  if (s.hotjar.enabled && s.hotjar.siteId) initHotjar(s.hotjar.siteId, s.hotjar.version || '6');
  if (s.posthog.enabled && s.posthog.apiKey) initPostHog(s.posthog.apiKey, s.posthog.apiHost);
};

/* ---------- Pageview firing ---------- */
const firePageview = (s: TrackingSettings, path: string) => {
  if (s.ga4.enabled && window.gtag) window.gtag('event', 'page_view', { page_path: path, page_location: window.location.href });
  if (s.metaPixel.enabled && window.fbq) window.fbq('track', 'PageView');
  if (s.tiktokPixel.enabled && window.ttq) window.ttq.page();
  if (s.linkedinInsight.enabled && window.lintrk) window.lintrk('track');
  if (s.posthog.enabled && window.posthog) window.posthog.capture('$pageview', { $current_url: window.location.href });
};

/* ---------- Public event helper ---------- */
export const trackEvent = (name: string, params?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  if (window.gtag) window.gtag('event', name, params);
  if (window.fbq) window.fbq('track', name, params);
  if (window.ttq) window.ttq.track(name, params);
  if (window.clarity) window.clarity('event', name);
  if (window.posthog) window.posthog.capture(name, params);
  if (window.dataLayer) window.dataLayer.push({ event: name, ...params });
};

/* ---------- Main component ---------- */
export const TrackingScripts = () => {
  const { settings } = useTrackingSettings();
  const location = useLocation();
  const [consent, setConsentState] = useState<boolean>(getConsent());
  const [needsDecision, setNeedsDecision] = useState<boolean>(!hasConsentDecision());

  useEffect(() => {
    const onChange = () => {
      setConsentState(getConsent());
      setNeedsDecision(!hasConsentDecision());
    };
    window.addEventListener('hesabat-consent-change', onChange);
    return () => window.removeEventListener('hesabat-consent-change', onChange);
  }, []);

  const isPrivateRoute = useMemo(
    () => location.pathname.startsWith('/app') || location.pathname.startsWith('/admin'),
    [location.pathname],
  );

  const shouldTrack = useMemo(() => {
    if (settings.privateAppRoutes && isPrivateRoute) return false;
    if (settings.consentRequired && !consent) return false;
    return true;
  }, [settings.privateAppRoutes, settings.consentRequired, isPrivateRoute, consent]);

  // Inject scripts once eligible
  useEffect(() => {
    if (!shouldTrack) return;
    activate(settings);
  }, [shouldTrack, settings]);

  // Fire pageview on route change (delay so SDKs are ready)
  useEffect(() => {
    if (!shouldTrack) return;
    const t = setTimeout(() => firePageview(settings, location.pathname + location.search), 350);
    return () => clearTimeout(t);
  }, [location.pathname, location.search, shouldTrack, settings]);

  const accept = useCallback(() => { setConsent(true); }, []);
  const decline = useCallback(() => { setConsent(false); }, []);

  const anyEnabled =
    settings.ga4.enabled || settings.gtm.enabled || settings.metaPixel.enabled ||
    settings.linkedinInsight.enabled || settings.microsoftClarity.enabled ||
    settings.tiktokPixel.enabled || settings.hotjar.enabled || settings.posthog.enabled;

  // Consent banner only shows on public pages, if consent is required and not decided
  const showBanner =
    settings.consentRequired && needsDecision && anyEnabled && !isPrivateRoute;

  return (
    <>
      {/* GTM <noscript> fallback */}
      {settings.gtm.enabled && settings.gtm.containerId && shouldTrack && (
        <noscript>
          <iframe
            title="gtm"
            src={`https://www.googletagmanager.com/ns.html?id=${settings.gtm.containerId}`}
            height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
      )}

      {showBanner && (
        <div
          dir="rtl"
          className="fixed bottom-4 inset-x-4 md:inset-x-auto md:end-6 md:max-w-md z-[60] animate-fade-in"
          role="dialog" aria-label="إعدادات ملفات تعريف الارتباط"
        >
          <div className="rounded-xl border border-border bg-card shadow-elev p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Cookie className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">نحترم خصوصيتك</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  نستخدم ملفات تعريف ارتباط تحليلية وتسويقية لتحسين تجربتك. هل توافق على تفعيلها؟
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" onClick={accept}>قبول الكل</Button>
                  <Button size="sm" variant="outline" onClick={decline}>الأساسية فقط</Button>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={decline} title="إغلاق" className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
