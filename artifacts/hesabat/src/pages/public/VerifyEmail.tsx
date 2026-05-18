import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/common/BrandLogo';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

type State = 'loading' | 'success' | 'error';

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMsg('رابط التحقق غير صالح أو مفقود.');
      setState('error');
      return;
    }
    api.post<{ ok: boolean }>('/api/auth/verify-email', { token })
      .then(() => setState('success'))
      .catch((err) => {
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
        );
        setState('error');
      });
  }, [token]);

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center p-8">
      <Card className="w-full max-w-md p-8 border-border/60 shadow-soft text-center">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="lg" />
        </div>

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">جارٍ التحقق من بريدك الإلكتروني…</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <h1 className="text-2xl font-bold">تم التحقق بنجاح!</h1>
            <p className="text-muted-foreground">
              تم تأكيد عنوان بريدك الإلكتروني. يمكنك الآن تسجيل الدخول إلى حسابك.
            </p>
            <Button asChild size="lg" className="w-full mt-2">
              <Link to="/login">تسجيل الدخول</Link>
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <XCircle className="h-14 w-14 text-destructive" />
            <h1 className="text-2xl font-bold">فشل التحقق</h1>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button asChild variant="outline" size="lg" className="w-full mt-2">
              <Link to="/login">العودة لتسجيل الدخول</Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default VerifyEmail;
