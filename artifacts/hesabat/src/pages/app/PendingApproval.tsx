import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, LogOut, Mail, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/common/BrandLogo';
import { useAuth } from '@/lib/auth';
import { api, getAccessToken, isApiConfigured, setAccessToken, setRefreshToken } from '@/lib/api';

const POLL_INTERVAL_MS = 30_000;

interface MeResponse {
  user: { id: string; email: string; name: string; is_super_admin: boolean; onboarding_done: boolean };
  companies: { id: string; name: string; is_default: boolean }[];
  roles: { role: string; company_id: string | null }[];
}

interface ApiErrorBody {
  message?: string;
  decline_reason?: string;
  reason?: string;
  [key: string]: unknown;
}

interface ApiErrorShape {
  status?: number;
  message?: string;
  body?: ApiErrorBody;
}

const PendingApproval = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(POLL_INTERVAL_MS / 1000);
  const [rejected, setRejected] = useState(false);
  const [declineReason, setDeclineReason] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!isApiConfigured() || !getAccessToken()) return;
    setChecking(true);
    try {
      await api.get<MeResponse>('/api/auth/me');
      window.location.reload();
    } catch (err: unknown) {
      const e = err as ApiErrorShape;
      if (e?.status === 403) {
        const isPending = e?.message?.toLowerCase().includes('pending review');
        if (isPending) {
          setSecondsLeft(POLL_INTERVAL_MS / 1000);
        } else {
          const body = e.body ?? {};
          const reason = body.decline_reason ?? body.reason ?? null;
          setDeclineReason(typeof reason === 'string' ? reason : null);
          setRejected(true);
        }
      } else {
        setAccessToken(null);
        setRefreshToken(null);
        navigate('/login', { replace: true });
      }
    } finally {
      setChecking(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (rejected) return;
    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          checkStatus();
          return POLL_INTERVAL_MS / 1000;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [checkStatus, rejected]);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  if (rejected) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <BrandLogo size="lg" variant="full" />
          </div>

          <div className="rounded-2xl border border-destructive/30 bg-card shadow-soft p-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">تعذّرت الموافقة على الطلب</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                لم نتمكن من الموافقة على طلب تسجيلك في الوقت الحالي.
              </p>
            </div>

            {declineReason && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-right">
                <p className="text-xs text-muted-foreground font-medium mb-1">سبب الرفض</p>
                <p className="text-sm text-foreground">{declineReason}</p>
              </div>
            )}

            {!declineReason && (
              <div className="rounded-xl bg-muted/50 border border-border/40 p-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  إذا كنت تعتقد أن هذا خطأ، أو تحتاج إلى مزيد من التوضيح، يُرجى التواصل مع فريق الدعم.
                </p>
              </div>
            )}

            <div className="space-y-3 pt-1">
              <Button asChild className="w-full gap-2">
                <a href="mailto:support@oneclick.com">
                  <Mail className="h-4 w-4" />
                  تواصل مع الدعم
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1.5 text-muted-foreground"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                تسجيل الخروج
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <BrandLogo size="lg" variant="full" />
        </div>

        <div className="rounded-2xl border border-border/60 bg-card shadow-soft p-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock className="h-8 w-8 text-warning" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">طلبك قيد المراجعة</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              استلمنا طلب تسجيل شركتك وهو الآن قيد المراجعة من فريقنا.
              ستصلك رسالة بالبريد الإلكتروني فور الموافقة على الطلب.
            </p>
          </div>

          <div className="rounded-xl bg-muted/50 border border-border/40 p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">المدة المتوقعة للمراجعة</p>
            <p className="text-sm font-semibold text-foreground">خلال يوم عمل واحد</p>
          </div>

          <div className="space-y-3 pt-1">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={checkStatus}
              disabled={checking}
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'جارٍ التحقق…' : 'تحقق من الحالة الآن'}
            </Button>

            <p className="text-[11px] text-muted-foreground">
              سيتم التحقق تلقائياً خلال {secondsLeft} ثانية
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 gap-1.5 text-muted-foreground"
                asChild
              >
                <a href="mailto:support@oneclick.com">
                  <Mail className="h-3.5 w-3.5" />
                  تواصل مع الدعم
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 gap-1.5 text-muted-foreground"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                تسجيل الخروج
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
