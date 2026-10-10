import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, isApiConfigured, loginRequest, verify2faRequest, googleLoginRequest, googleCompleteRequest, ApiError } from '@/lib/api';
import { GoogleSignInButton, isGoogleSignInConfigured } from '@/components/common/GoogleSignInButton';
import { toast } from 'sonner';

const UNVERIFIED_EMAIL_MESSAGE = 'يجب تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد، أو اطلب رابط تأكيد جديد.';

/**
 * Validate a post-login redirect target to prevent open-redirect attacks.
 * Only allows same-origin relative paths (must start with "/" but not "//").
 */
const sanitizeRedirect = (raw: string | null): string | null => {
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return null;
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeRedirect(searchParams.get('redirect'));

  // Second step of login: account has 2FA enabled.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  // Google sign-in on a brand-new Google account: needs a company name before
  // the account/company can be created, mirroring the normal register flow.
  const [googleSignupToken, setGoogleSignupToken] = useState<string | null>(null);
  const [googleCompanyName, setGoogleCompanyName] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const goAfterLogin = (isSuperAdmin?: boolean) => {
    toast.success('تم تسجيل الدخول');
    // A super admin is never sent into /app/* via this param — a stale
    // redirect (e.g. carried over from a session that expired while on a
    // company page) must not override their landing on /admin. The
    // reciprocal guard in AppLayout.tsx would bounce them back anyway, but
    // deciding it here avoids the extra redirect hop. Applies to every
    // login path that reaches this helper (password, 2FA, Google).
    const superAdminDestination =
      redirectTo && redirectTo.startsWith('/admin') ? redirectTo : '/admin';
    window.location.href = isSuperAdmin
      ? superAdminDestination
      : (redirectTo ?? '/app');
  };

  const submitMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setMfaLoading(true);
    try {
      const res = await verify2faRequest(mfaToken, mfaCode.trim());
      goAfterLogin(res.user.isSuperAdmin);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'رمز التحقق غير صحيح');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setGoogleLoading(true);
    try {
      const res = await googleLoginRequest(idToken);
      if ('needsCompanyName' in res) {
        setGoogleSignupToken(res.googleSignupToken);
      } else if ('mfaRequired' in res) {
        setMfaToken(res.mfaToken);
      } else {
        goAfterLogin(res.user.isSuperAdmin);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول بجوجل');
    } finally {
      setGoogleLoading(false);
    }
  };

  const submitGoogleCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleSignupToken || !googleCompanyName.trim()) return;
    setGoogleLoading(true);
    try {
      await googleCompleteRequest(googleSignupToken, googleCompanyName.trim());
      toast.success('تم إنشاء حسابك! سنُبلغك فور اعتماده من فريق ون كليك.');
      setGoogleSignupToken(null);
      navigate('/login');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر إنشاء الحساب');
    } finally {
      setGoogleLoading(false);
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      await api.post('/api/auth/resend-verification-public', { email });
      toast.success('تم إرسال رابط تأكيد جديد إلى بريدك الإلكتروني');
    } catch {
      toast.error('تعذّر إرسال الرابط، حاول مرة أخرى لاحقاً');
    } finally {
      setResending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsVerification(false);
    try {
      if (isApiConfigured()) {
        const res = await loginRequest(email, password);
        if ('mfaRequired' in res) {
          setMfaToken(res.mfaToken);
          return;
        }
        // Full reload so AuthProvider re-runs its /api/auth/me hydration
        // effect with the newly saved token in localStorage.
        // If a safe same-origin redirect is provided (e.g. from an invitation
        // link), send the user there; otherwise use the default destination.
        goAfterLogin(res.user.isSuperAdmin);
      } else {
        // Demo mode (no backend configured): require a non-empty password and
        // never grant super_admin via the local mock list.
        if (!email || !password) {
          toast.error('يرجى إدخال البريد وكلمة المرور');
          return;
        }
        const ok = login(email, password);
        if (!ok) {
          toast.error('بيانات الدخول غير صحيحة');
          return;
        }
        navigate(redirectTo ?? '/app');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول';
      toast.error(msg);
      if (msg === UNVERIFIED_EMAIL_MESSAGE) setNeedsVerification(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md p-8 border-border/60 shadow-soft">
          <div className="flex items-center justify-between mb-6">
            <BrandLogo size="lg" />
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowRight className="h-4 w-4" />
              الرئيسية
            </Link>
          </div>
          {googleSignupToken ? (
            <>
              <h1 className="text-2xl font-bold">خطوة أخيرة</h1>
              <p className="text-sm text-muted-foreground mt-1.5">تم التحقق من حساب جوجل — أدخل اسم شركتك لإكمال إنشاء الحساب.</p>
              <form onSubmit={submitGoogleCompany} className="space-y-4 mt-6">
                <div>
                  <Label>اسم الشركة</Label>
                  <Input value={googleCompanyName} onChange={(e) => setGoogleCompanyName(e.target.value)} className="mt-1.5" required autoFocus />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={googleLoading}>
                  {googleLoading ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setGoogleSignupToken(null)}>
                  رجوع
                </Button>
              </form>
            </>
          ) : mfaToken ? (
            <>
              <h1 className="text-2xl font-bold">التحقق بخطوتين</h1>
              <p className="text-sm text-muted-foreground mt-1.5">أدخل رمز التحقق من تطبيق المصادقة، أو أحد رموز الاسترداد الاحتياطية.</p>
              <form onSubmit={submitMfaCode} className="space-y-4 mt-6">
                <div>
                  <Label>رمز التحقق</Label>
                  <Input
                    value={mfaCode} onChange={(e) => setMfaCode(e.target.value)}
                    className="mt-1.5 text-center tracking-[0.3em]" inputMode="numeric"
                    autoFocus required maxLength={12}
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={mfaLoading}>
                  {mfaLoading ? 'جارٍ التحقق…' : 'تأكيد'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setMfaToken(null); setMfaCode(''); }}>
                  رجوع لتسجيل الدخول
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">مرحباً بعودتك</h1>
              <p className="text-sm text-muted-foreground mt-1.5">سجّل دخولك للوصول إلى لوحة التحكم.</p>
              <form onSubmit={submit} className="space-y-4 mt-6">
                <div>
                  <Label>البريد الإلكتروني</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" required />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>كلمة المرور</Label>
                    <Link to="/forgot-password" className="text-xs text-primary">نسيت كلمة المرور؟</Link>
                  </div>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" required />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {loading ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
                </Button>
                {needsVerification && (
                  <Button
                    type="button" variant="outline" size="lg" className="w-full"
                    onClick={resendVerification} disabled={resending}
                  >
                    {resending ? 'جارٍ الإرسال…' : 'إعادة إرسال رابط تأكيد البريد'}
                  </Button>
                )}
              </form>
              {isGoogleSignInConfigured() && (
                <>
                  <div className="flex items-center gap-3 my-5">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">أو</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <GoogleSignInButton onCredential={handleGoogleCredential} />
                </>
              )}
              <p className="text-sm text-muted-foreground text-center mt-6">
                ليس لديك حساب؟ <Link to="/register" className="text-primary font-semibold">سجّل شركتك</Link>
              </p>
            </>
          )}
        </Card>
      </div>
      <div className="hidden lg:block gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative h-full flex items-center justify-center p-12 text-primary-foreground">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold leading-tight">إدارة محاسبة شركتك بأناقة وسهولة.</h2>
            <p className="mt-4 text-white/85">انضم لآلاف الشركات العربية التي تثق بـ«ون كليك» لإدارة فواتيرها ومدفوعاتها.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
