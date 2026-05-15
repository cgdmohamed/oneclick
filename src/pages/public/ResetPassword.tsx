import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, isApiConfigured, ApiError } from '@/lib/api';
import { toast } from 'sonner';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    if (password !== confirm) return toast.error('كلمتا المرور غير متطابقتين');
    if (!token) return toast.error('رابط غير صالح');
    setLoading(true);
    try {
      if (isApiConfigured()) {
        await api.post('/api/auth/reset-password', { token, password });
      }
      toast.success('تم تحديث كلمة المرور');
      navigate('/login');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر إعادة التعيين');
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
          <span className="font-bold text-lg">حسابات</span>
        </div>
        <h1 className="text-2xl font-bold">تعيين كلمة مرور جديدة</h1>
        <p className="text-sm text-muted-foreground mt-1.5">اختر كلمة مرور قوية لحسابك.</p>
        <form onSubmit={submit} className="space-y-4 mt-6">
          <div>
            <Label>كلمة المرور الجديدة</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" required minLength={8} />
          </div>
          <div>
            <Label>تأكيد كلمة المرور</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" required />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-6">
          <Link to="/login" className="text-primary font-semibold">العودة لتسجيل الدخول</Link>
        </p>
      </Card>
    </div>
  );
};

export default ResetPassword;
