import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const ConfirmEmailChange = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMsg('رابط التأكيد غير صالح');
      setStatus('error');
      return;
    }
    api.post('/api/auth/confirm-email-change', { token })
      .then(() => setStatus('success'))
      .catch((e: unknown) => {
        const err = e as { message?: string };
        setErrorMsg(err?.message ?? 'الرابط غير صالح أو منتهي الصلاحية');
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full rounded-2xl border border-border/60 bg-card p-8 text-center shadow-soft space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-semibold">جاري التحقق…</h2>
            <p className="text-sm text-muted-foreground">يرجى الانتظار بينما نؤكد بريدك الإلكتروني الجديد.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-semibold">تم تغيير البريد الإلكتروني بنجاح</h2>
            <p className="text-sm text-muted-foreground">
              تم تحديث بريدك الإلكتروني. ستحتاج إلى تسجيل الدخول من جديد بالبريد الجديد.
            </p>
            <Button asChild className="mt-2">
              <Link to="/login">تسجيل الدخول</Link>
            </Button>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">فشل التأكيد</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/login">العودة لتسجيل الدخول</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default ConfirmEmailChange;
