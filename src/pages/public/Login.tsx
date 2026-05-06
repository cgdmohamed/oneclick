import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

const Login = () => {
  const [email, setEmail] = useState('admin@alofok.sa');
  const [password, setPassword] = useState('demo1234');
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email);
    navigate('/app');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md p-8 border-border/60 shadow-soft">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-10 w-10 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
              <Calculator className="h-5 w-5" />
            </span>
            <span className="font-bold text-lg">حسابات</span>
          </div>
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
                <Link to="#" className="text-xs text-primary">نسيت كلمة المرور؟</Link>
              </div>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" required />
            </div>
            <Button type="submit" size="lg" className="w-full">تسجيل الدخول</Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-6">
            ليس لديك حساب؟ <Link to="/register" className="text-primary font-semibold">سجّل شركتك</Link>
          </p>
        </Card>
      </div>
      <div className="hidden lg:block gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative h-full flex items-center justify-center p-12 text-primary-foreground">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold leading-tight">إدارة محاسبة شركتك بأناقة وسهولة.</h2>
            <p className="mt-4 text-white/85">انضم لآلاف الشركات العربية التي تثق بحسابات لإدارة فواتيرها ومدفوعاتها.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
