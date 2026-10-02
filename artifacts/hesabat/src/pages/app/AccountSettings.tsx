import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { User, Lock, Monitor, Loader2, Trash2, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, isApiConfigured } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Session {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

function parseBrowser(ua: string): string {
  if (!ua) return 'متصفح غير معروف';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  return 'متصفح آخر';
}

function parseDevice(ua: string): string {
  if (!ua) return 'جهاز غير معروف';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'جهاز آخر';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const ProfileSection = () => {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const [currentEmail, setCurrentEmail] = useState(user?.email ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [requestingEmail, setRequestingEmail] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setCurrentEmail(user?.email ?? '');
  }, [user]);

  const handleSaveName = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('الاسم يجب أن يكون حرفين على الأقل');
      return;
    }
    if (!isApiConfigured()) { toast.error('هذا الإجراء يتطلب الاتصال بالخادم'); return; }
    setSavingName(true);
    try {
      await api.patch('/api/auth/profile', { name: name.trim() });
      toast.success('تم تحديث الاسم بنجاح');
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message ?? 'تعذّر تحديث الاسم');
    } finally {
      setSavingName(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error('أدخل بريداً إلكترونياً صالحاً');
      return;
    }
    if (!isApiConfigured()) { toast.error('هذا الإجراء يتطلب الاتصال بالخادم'); return; }
    setRequestingEmail(true);
    try {
      await api.post('/api/auth/request-email-change', { newEmail: newEmail.trim() });
      setEmailRequested(true);
      toast.success('تم إرسال رابط التأكيد إلى بريدك الجديد');
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message ?? 'تعذّر إرسال بريد التأكيد');
    } finally {
      setRequestingEmail(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="p-6 border-border/60 space-y-4">
        <h3 className="font-semibold text-base">الاسم</h3>
        <div>
          <Label>الاسم الكامل</Label>
          <Input
            className="mt-1.5"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="اسمك الكامل"
          />
        </div>
        <Button onClick={handleSaveName} disabled={savingName}>
          {savingName && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          حفظ الاسم
        </Button>
      </Card>

      <Card className="p-6 border-border/60 space-y-4">
        <h3 className="font-semibold text-base">البريد الإلكتروني</h3>
        <div>
          <Label>البريد الحالي</Label>
          <Input className="mt-1.5" value={currentEmail} disabled dir="ltr" />
        </div>
        {!emailRequested ? (
          <>
            <div>
              <Label>البريد الجديد</Label>
              <Input
                className="mt-1.5"
                type="email"
                dir="ltr"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="new@example.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                سيُرسل رابط تأكيد إلى العنوان الجديد. سيُطبَّق التغيير فقط بعد النقر على الرابط.
              </p>
            </div>
            <Button
              onClick={handleRequestEmailChange}
              disabled={requestingEmail || !newEmail.trim()}
              variant="outline"
            >
              {requestingEmail && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              إرسال رابط التأكيد
            </Button>
          </>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground mb-1">تم إرسال رابط التأكيد</p>
            <p className="text-muted-foreground">
              تحقق من صندوق الوارد على <span className="font-mono font-medium">{newEmail}</span> وانقر على
              الرابط لتأكيد تغيير البريد الإلكتروني. سيتم تسجيل خروجك من جميع الجلسات تلقائياً عند التأكيد.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => { setEmailRequested(false); setNewEmail(''); }}
            >
              إلغاء وتعديل
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

const PasswordSection = () => {
  const [form, setForm] = useState({ current: '', new: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.current) { toast.error('أدخل كلمة المرور الحالية'); return; }
    if (form.new.length < 8) { toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'); return; }
    if (form.new !== form.confirm) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    if (!isApiConfigured()) { toast.error('هذا الإجراء يتطلب الاتصال بالخادم'); return; }
    setSaving(true);
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: form.current,
        newPassword: form.new,
      });
      setForm({ current: '', new: '', confirm: '' });
      toast.success('تم تغيير كلمة المرور بنجاح، وتسجيل خروجك من كل الجلسات الأخرى');
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message ?? 'تعذّر تغيير كلمة المرور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 border-border/60 space-y-4 max-w-xl">
      <h3 className="font-semibold text-base">تغيير كلمة المرور</h3>
      <div>
        <Label>كلمة المرور الحالية</Label>
        <Input
          className="mt-1.5"
          type="password"
          dir="ltr"
          value={form.current}
          onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
          placeholder="••••••••"
        />
      </div>
      <div>
        <Label>كلمة المرور الجديدة</Label>
        <Input
          className="mt-1.5"
          type="password"
          dir="ltr"
          value={form.new}
          onChange={e => setForm(f => ({ ...f, new: e.target.value }))}
          placeholder="8 أحرف على الأقل"
        />
      </div>
      <div>
        <Label>تأكيد كلمة المرور الجديدة</Label>
        <Input
          className="mt-1.5"
          type="password"
          dir="ltr"
          value={form.confirm}
          onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
          placeholder="••••••••"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        سيتم تسجيل خروجك تلقائياً من كل الجلسات الأخرى عند تغيير كلمة المرور، مع بقاء جلستك الحالية.
      </p>
      <Button onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
        تغيير كلمة المرور
      </Button>
    </Card>
  );
};

const TwoFactorSection = () => {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isApiConfigured()) { setEnabled(false); return; }
    api.get<{ totp_enabled: boolean }>('/api/auth/2fa/status')
      .then(r => setEnabled(r.totp_enabled))
      .catch(() => setEnabled(false));
  }, [user]);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ secret: string; qrDataUrl: string }>('/api/auth/2fa/setup');
      setSetup(res);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'تعذّر بدء الإعداد');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (code.trim().length < 6) { toast.error('أدخل رمز التحقق المكوّن من 6 أرقام'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; backupCodes: string[] }>('/api/auth/2fa/enable', { code: code.trim() });
      setBackupCodes(res.backupCodes);
      setSetup(null);
      setCode('');
      setEnabled(true);
      toast.success('تم تفعيل المصادقة الثنائية');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'رمز التحقق غير صحيح');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!disablePassword) { toast.error('أدخل كلمة المرور الحالية'); return; }
    setBusy(true);
    try {
      await api.post('/api/auth/2fa/disable', { password: disablePassword });
      setEnabled(false);
      setDisablePassword('');
      toast.success('تم إلغاء تفعيل المصادقة الثنائية');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'تعذّر إلغاء التفعيل');
    } finally {
      setBusy(false);
    }
  };

  if (!isApiConfigured()) {
    return (
      <Card className="p-6 border-border/60 text-center text-sm text-muted-foreground max-w-xl">
        المصادقة الثنائية تتطلب الاتصال بالخادم
      </Card>
    );
  }

  if (backupCodes) {
    return (
      <Card className="p-6 border-border/60 space-y-4 max-w-xl">
        <h3 className="font-semibold text-base">احفظ رموز الاسترداد الآن</h3>
        <p className="text-sm text-muted-foreground">
          استخدم أحد هذه الرموز إذا فقدت الوصول لتطبيق المصادقة. كل رمز يُستخدم مرة واحدة فقط، ولن تُعرض لك مرة أخرى.
        </p>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted/40 rounded-lg p-4" dir="ltr">
          {backupCodes.map(c => <div key={c}>{c}</div>)}
        </div>
        <Button onClick={() => setBackupCodes(null)}>تم الحفظ، إغلاق</Button>
      </Card>
    );
  }

  if (setup) {
    return (
      <Card className="p-6 border-border/60 space-y-4 max-w-xl">
        <h3 className="font-semibold text-base">امسح رمز QR</h3>
        <p className="text-sm text-muted-foreground">
          افتح تطبيق مصادقة (Google Authenticator أو ما شابه) وامسح الرمز، أو أدخل المفتاح يدويًا، ثم اكتب الرمز الظاهر للتأكيد.
        </p>
        <div className="flex justify-center">
          <img src={setup.qrDataUrl} alt="QR" className="rounded-lg border border-border/60" />
        </div>
        <div className="text-center">
          <Label className="text-xs text-muted-foreground">المفتاح (إدخال يدوي)</Label>
          <p className="font-mono text-sm mt-1" dir="ltr">{setup.secret}</p>
        </div>
        <div>
          <Label>رمز التحقق</Label>
          <Input className="mt-1.5 text-center tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={confirmEnable} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            تفعيل
          </Button>
          <Button variant="ghost" onClick={() => setSetup(null)}>إلغاء</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border/60 space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">المصادقة الثنائية (2FA)</h3>
        <Badge variant={enabled ? 'default' : 'outline'}>{enabled ? 'مفعّلة' : 'غير مفعّلة'}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        طبقة حماية إضافية: بعد إدخال كلمة المرور، سيُطلب منك رمز من تطبيق مصادقة على جوالك.
      </p>
      {enabled ? (
        <div className="space-y-3">
          <Label>كلمة المرور الحالية (للتأكيد قبل الإلغاء)</Label>
          <Input type="password" dir="ltr" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} />
          <Button variant="destructive" onClick={disable} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            إلغاء تفعيل المصادقة الثنائية
          </Button>
        </div>
      ) : (
        <Button onClick={startSetup} disabled={busy || enabled === null}>
          {busy && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          تفعيل المصادقة الثنائية
        </Button>
      )}
    </Card>
  );
};

const SessionsSection = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!isApiConfigured()) { setLoading(false); return; }
    try {
      const res = await api.get<{ sessions: Session[] }>('/api/auth/sessions');
      setSessions(res.sessions ?? []);
    } catch {
      toast.error('تعذّر تحميل الجلسات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const revokeSession = async (id: string) => {
    setRevoking(id);
    try {
      await api.delete(`/api/auth/sessions/${id}`);
      setSessions(s => s.filter(x => x.id !== id));
      toast.success('تم إنهاء الجلسة');
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message ?? 'تعذّر إنهاء الجلسة');
    } finally {
      setRevoking(null);
    }
  };

  const revokeOthers = async () => {
    setRevokingAll(true);
    try {
      await api.delete('/api/auth/sessions?others=true');
      setSessions(s => s.filter(x => x.isCurrent));
      toast.success('تم تسجيل الخروج من جميع الجلسات الأخرى');
    } catch {
      toast.error('تعذّر إنهاء الجلسات الأخرى');
    } finally {
      setRevokingAll(false);
    }
  };

  const otherSessions = sessions.filter(s => !s.isCurrent);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">الجلسات النشطة</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            قائمة بجميع الأجهزة التي سجّلت الدخول بها حالياً
          </p>
        </div>
        {otherSessions.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={revokingAll}>
                {revokingAll && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                <LogOut className="h-4 w-4 ml-2" />
                تسجيل الخروج من كل مكان آخر
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تسجيل الخروج من كل مكان آخر</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم إنهاء {otherSessions.length} جلسة أخرى. جلستك الحالية ستبقى نشطة.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={revokeOthers}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !isApiConfigured() ? (
        <Card className="p-6 border-border/60 text-center text-sm text-muted-foreground">
          إدارة الجلسات تتطلب الاتصال بالخادم
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="p-6 border-border/60 text-center text-sm text-muted-foreground">
          لا توجد جلسات نشطة
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <Card key={session.id} className="p-4 border-border/60">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {parseBrowser(session.userAgent)} — {parseDevice(session.userAgent)}
                    </span>
                    {session.isCurrent && (
                      <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-emerald-500/10 text-emerald-600 border-0">
                        الجلسة الحالية
                      </Badge>
                    )}
                  </div>
                  {session.ip && (
                    <div className="text-xs text-muted-foreground mt-0.5 font-mono">{session.ip}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    آخر نشاط: {formatDate(session.lastUsedAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    بدأت في: {formatDate(session.createdAt)}
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                    disabled={revoking === session.id}
                    onClick={() => revokeSession(session.id)}
                    title="إنهاء هذه الجلسة"
                  >
                    {revoking === session.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const AccountSettings = () => {
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'profile';

  return (
    <div>
      <PageHeader
        title="إعدادات الحساب الشخصي"
        description="إدارة بيانات حسابك وكلمة المرور وجلسات تسجيل الدخول"
      />
      <Tabs dir="rtl" value={tab} onValueChange={v => setSearch({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 ml-2" />
            الملف الشخصي
          </TabsTrigger>
          <TabsTrigger value="password">
            <Lock className="h-4 w-4 ml-2" />
            كلمة المرور
          </TabsTrigger>
          <TabsTrigger value="2fa">
            <ShieldCheck className="h-4 w-4 ml-2" />
            المصادقة الثنائية
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Monitor className="h-4 w-4 ml-2" />
            الجلسات النشطة
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="password" className="mt-4">
          <PasswordSection />
        </TabsContent>
        <TabsContent value="2fa" className="mt-4">
          <TwoFactorSection />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AccountSettings;
