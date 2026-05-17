import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, LogOut, Mail } from 'lucide-react';
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

const PendingApproval = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(POLL_INTERVAL_MS / 1000);

  const checkStatus = useCallback(async () => {
    if (!isApiConfigured() || !getAccessToken()) return;
    setChecking(true);
    try {
      await api.get<MeResponse>('/api/auth/me');
      window.location.reload();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e?.status === 403 && e?.message?.toLowerCase().includes('pending')) {
        setSecondsLeft(POLL_INTERVAL_MS / 1000);
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
  }, [checkStatus]);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

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
