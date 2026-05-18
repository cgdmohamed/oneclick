import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { toast } from 'sonner';
import { acceptInvitation, findInvitationByToken, type Invitation } from '@/lib/invitations';
import { useUsers } from '@/hooks/entities';
import { roleLabel } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

const passwordIssues = (pw: string): string[] => {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('٨ أحرف على الأقل');
  if (!/[A-Za-z]/.test(pw)) issues.push('حرف لاتيني واحد على الأقل');
  if (!/\d/.test(pw)) issues.push('رقم واحد على الأقل');
  return issues;
};

const AcceptInvite = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const { save } = useUsers();
  const { user } = useAuth();

  const [invitation, setInvitation] = useState<Invitation | null | undefined>(undefined);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailMismatch, setEmailMismatch] = useState(false);
  const [seatLimitReached, setSeatLimitReached] = useState(false);

  // Prevents the auto-accept effect from firing more than once per page visit.
  const autoAcceptFiredRef = useRef(false);

  useEffect(() => {
    if (!token) { setInvitation(null); return; }
    let active = true;
    findInvitationByToken(token).then((inv) => {
      if (!active) return;
      setInvitation(inv);
      if (inv) {
        setFullName(inv.fullName);
        setPhone(inv.phone ?? '');
      }
    });
    return () => { active = false; };
  }, [token]);

  // Once invitation loads, check for immediate email mismatch (user is logged
  // in as a different account than the one the invite was sent to).
  useEffect(() => {
    if (!invitation || !user) { setEmailMismatch(false); return; }
    const same = invitation.email.toLowerCase() === user.email.toLowerCase();
    setEmailMismatch(!same);
  }, [invitation, user]);

  const pwIssues = useMemo(() => passwordIssues(password), [password]);
  const pwOk = pwIssues.length === 0;
  const confirmOk = confirm.length > 0 && password === confirm;
  const nameOk = fullName.trim().length >= 2;

  // Is the currently logged-in user the intended recipient?
  const isLoggedInAsRecipient =
    !!user && !!invitation && invitation.email.toLowerCase() === user.email.toLowerCase();

  /**
   * Core accept logic — shared by manual submit and the auto-accept effect.
   * `omitPassword` is true when the user is already authenticated (the backend
   * uses the JWT for identity instead of requiring a password).
   */
  const doAccept = useCallback(async (opts: { omitPassword: boolean }) => {
    if (!invitation || invitation.status !== 'pending') return;
    setSubmitting(true);
    try {
      await acceptInvitation(invitation.token, {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        password: opts.omitPassword ? undefined : password,
        userId: `u-${Date.now()}`,
      });
      // Mock-only: also persist a local user record so demo lists update.
      if (!invitation.id) {
        await save({
          id: `u-${Date.now()}`,
          name: fullName.trim(),
          email: invitation.email,
          phone: phone.trim() || undefined,
          role: invitation.role,
          companyId: invitation.companyId,
          disabled: false,
        });
      }
      toast.success('تم تفعيل حسابك! يمكنك الوصول إلى لوحة التحكم الآن.');
      navigate('/app');
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | undefined;
        if (err.status === 401 && body?.error === 'login_required') {
          // Email belongs to a registered account but visitor is not logged in.
          // Redirect to login with the invite token preserved so the user is
          // sent back here after a successful login.
          const redirectTo = `/accept-invite?token=${encodeURIComponent(token)}`;
          navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`);
          return;
        }
        if (err.status === 403 && body?.error === 'email_mismatch') {
          setEmailMismatch(true);
          return;
        }
        if (err.status === 403 && body?.error === 'seat_limit_reached') {
          setSeatLimitReached(true);
          return;
        }
        toast.error(err.message || 'تعذّر إكمال العملية');
      } else {
        toast.error('تعذّر إكمال العملية');
      }
    } finally {
      setSubmitting(false);
    }
  }, [invitation, fullName, phone, password, token, navigate, save]);

  /**
   * Auto-accept effect: fires once when the user is already authenticated as
   * the invitation recipient (e.g. they were redirected from login back here).
   * The ref guard prevents it from looping on re-renders.
   */
  useEffect(() => {
    if (!isLoggedInAsRecipient) return;
    if (invitation?.status !== 'pending') return;
    if (autoAcceptFiredRef.current) return;
    autoAcceptFiredRef.current = true;
    doAccept({ omitPassword: true });
  }, [isLoggedInAsRecipient, invitation, doAccept]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation || invitation.status !== 'pending') return;
    if (!nameOk) { toast.error('الاسم قصير جدًا'); return; }

    // Only validate password fields when the user is not already logged in.
    if (!isLoggedInAsRecipient) {
      if (!pwOk) { toast.error('كلمة المرور لا تستوفي الشروط'); return; }
      if (!confirmOk) { toast.error('كلمة المرور وتأكيدها غير متطابقتين'); return; }
    }

    await doAccept({ omitPassword: isLoggedInAsRecipient });
  };

  // ---------- States ----------
  if (invitation === undefined) {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground mt-3 text-center">جارٍ التحقق من الدعوة…</p>
      </Centered>
    );
  }

  if (!invitation) {
    return (
      <InvalidState
        title="رابط دعوة غير صالح"
        message="الرابط الذي استخدمته غير صحيح أو تم تعديله. يرجى التواصل مع مدير الشركة لإعادة إرسال الدعوة."
      />
    );
  }

  if (invitation.status === 'accepted') {
    return (
      <InvalidState
        title="تم قبول هذه الدعوة مسبقًا"
        message="حسابك مفعّل بالفعل. يمكنك تسجيل الدخول مباشرة."
        ctaTo="/login"
        ctaLabel="الذهاب لتسجيل الدخول"
      />
    );
  }

  if (invitation.status === 'revoked') {
    return <InvalidState title="تم إلغاء هذه الدعوة" message="ألغى مدير الشركة هذه الدعوة. يرجى التواصل معه للحصول على دعوة جديدة." />;
  }

  if (invitation.status === 'expired') {
    return <InvalidState title="انتهت صلاحية الدعوة" message="انتهت صلاحية هذا الرابط. اطلب من مدير الشركة إعادة إرسال الدعوة." />;
  }

  if (emailMismatch) {
    return (
      <InvalidState
        title="هذه الدعوة لحساب آخر"
        message={`هذه الدعوة مخصصة للبريد الإلكتروني ${invitation.email}. أنت مسجّل الدخول حاليًا بحساب مختلف. يرجى تسجيل الخروج والدخول بالحساب الصحيح لقبول الدعوة.`}
        ctaTo={`/login?redirect=${encodeURIComponent(`/accept-invite?token=${encodeURIComponent(token)}`)}`}
        ctaLabel="تسجيل الدخول بحساب آخر"
      />
    );
  }

  if (seatLimitReached) {
    return (
      <InvalidState
        title="تعذّر الانضمام إلى الشركة"
        message="وصل عدد المستخدمين في هذه الشركة إلى الحد الأقصى المسموح به. يرجى التواصل مع مدير الشركة."
      />
    );
  }

  // When the logged-in user is the recipient, show a "processing" spinner
  // while the auto-accept fires — prevents the form from flickering in.
  if (isLoggedInAsRecipient && submitting) {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground mt-3 text-center">جارٍ الانضمام إلى الشركة…</p>
      </Centered>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-8">
        <Card className="w-full max-w-md p-7 border-border/60 shadow-soft">
          <div className="mb-5">
            <BrandLogo size="lg" />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 mb-5">
            <div className="flex items-start gap-2.5">
              <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 text-start">
                <div className="text-sm font-medium">تمت دعوتك للانضمام</div>
                <div className="text-xs text-muted-foreground mt-0.5 break-all">
                  بصفة <span className="font-semibold text-foreground">{roleLabel(invitation.role)}</span> · {invitation.email}
                </div>
              </div>
            </div>
          </div>

          <h1 className="text-xl font-bold">أكمل إعداد حسابك</h1>
          <p className="text-sm text-muted-foreground mt-1">عيّن كلمة المرور وراجع بياناتك للمتابعة.</p>

          <form onSubmit={handleSubmit} className="space-y-4 mt-5">
            <div>
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" value={invitation.email} disabled className="mt-1.5" dir="ltr" />
            </div>
            <div>
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5"
                maxLength={80}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">رقم الجوال <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5"
                dir="ltr"
                placeholder="+25XXXXXXXX"
                maxLength={20}
              />
            </div>
            <div>
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
                required
              />
              {password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {['٨ أحرف على الأقل','حرف لاتيني واحد على الأقل','رقم واحد على الأقل'].map((req) => {
                    const met = !pwIssues.includes(req);
                    return (
                      <li key={req} className={`text-xs flex items-center gap-1.5 ${met ? 'text-success' : 'text-muted-foreground'}`}>
                        {met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-current" />}
                        {req}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1.5"
                required
              />
              {confirm.length > 0 && !confirmOk && (
                <p className="text-xs text-destructive mt-1.5 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> كلمة المرور غير متطابقة
                </p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={submitting || !nameOk || !pwOk || !confirmOk}>
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin ml-2" />جارٍ التفعيل…</>) : 'تفعيل الحساب والمتابعة'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-5">
            بمتابعتك فأنت توافق على <Link to="/" className="text-primary">الشروط والأحكام</Link>.
          </p>
        </Card>
      </div>
      <div className="hidden lg:block gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative h-full flex items-center justify-center p-12 text-primary-foreground">
          <div className="max-w-md text-start">
            <ShieldCheck className="h-10 w-10 mb-4 opacity-90" />
            <h2 className="text-3xl font-bold leading-tight">انضم لفريق شركتك بأمان.</h2>
            <p className="mt-4 text-white/85">سيتم إنشاء حسابك بصلاحيات محددة من مدير الشركة، ويمكنك تغيير بياناتك لاحقًا من الإعدادات.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
    <Card className="w-full max-w-md p-8 border-border/60 shadow-soft">{children}</Card>
  </div>
);

const InvalidState = ({ title, message, ctaTo, ctaLabel }: { title: string; message: string; ctaTo?: string; ctaLabel?: string }) => (
  <Centered>
    <div className="text-center">
      <div className="h-12 w-12 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">{message}</p>
      <div className="mt-5 flex gap-2 justify-center">
        <Button asChild variant="outline"><Link to="/">العودة للرئيسية</Link></Button>
        {ctaTo && <Button asChild><Link to={ctaTo}>{ctaLabel ?? 'متابعة'}</Link></Button>}
      </div>
    </div>
  </Centered>
);

export default AcceptInvite;
