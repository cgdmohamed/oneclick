import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { toast } from 'sonner';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isApiConfigured()) {
        await api.post('/api/auth/forgot-password', { email });
      }
      setSent(true);
      toast.success('إذا كان البريد مسجلاً، ستصلك رسالة لإعادة التعيين');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر الإرسال');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center p-8">
      <Card className="w-full max-w-md p-8 border-border/60 shadow-soft">
        <div className="flex items-center gap-2 mb-6">
          <span className="h-10 w-10 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
            <Calculator className="h-5 w-5" />
          </span>
          <span className="font-bold text-lg">ون كليك</span>
        </div>
        <h1 className="text-2xl font-bold">نسيت كلمة المرور</h1>
        <p className="text-sm text-muted-foreground mt-1.5">أدخل بريدك وسنرسل لك رابط إعادة التعيين.</p>
        {sent ? (
          <div className="mt-6 p-4 rounded-lg bg-success/10 text-success text-sm">
            تم الإرسال. تحقق من صندوق الوارد لديك (الرابط صالح لمدة ساعة).
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-6">
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" required />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'جارٍ الإرسال…' : 'إرسال رابط الإعادة'}
            </Button>
          </form>
        )}
        <p className="text-sm text-muted-foreground text-center mt-6">
          <Link to="/login" className="text-primary font-semibold">العودة لتسجيل الدخول</Link>
        </p>
      </Card>
    </div>
  );
};

export default ForgotPassword;
