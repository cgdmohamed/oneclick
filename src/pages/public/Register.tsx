import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

const Register = () => {
  const [form, setForm] = useState({ company: '', owner: '', email: '', phone: '', password: '' });
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company || !form.owner || !form.email || !form.password) {
      return toast.error('يرجى تعبئة كل الحقول المطلوبة');
    }
    login('admin@alofok.sa');
    toast.success('تم إنشاء حساب شركتك بنجاح');
    navigate('/app');
  };

  return (
    <div className="container py-12">
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 border-border/60 shadow-soft">
          <div className="flex items-center gap-2 mb-6 justify-center">
            <span className="h-10 w-10 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
              <Calculator className="h-5 w-5" />
            </span>
            <span className="font-bold text-lg">حسابات</span>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">سجّل شركتك مجاناً</h1>
            <p className="text-muted-foreground mt-2">أنشئ حسابك خلال أقل من دقيقة وابدأ تجربتك.</p>
          </div>
          <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
            <Field label="اسم الشركة" name="company" form={form} setForm={setForm} />
            <Field label="اسم المسؤول" name="owner" form={form} setForm={setForm} />
            <Field label="البريد الإلكتروني" name="email" type="email" form={form} setForm={setForm} />
            <Field label="رقم الهاتف" name="phone" form={form} setForm={setForm} />
            <div className="sm:col-span-2">
              <Field label="كلمة المرور" name="password" type="password" form={form} setForm={setForm} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" className="w-full">إنشاء الحساب</Button>
            </div>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-6">
            لديك حساب بالفعل؟ <Link to="/login" className="text-primary font-semibold">سجّل دخولك</Link>
          </p>
        </Card>
      </div>
    </div>
  );
};

const Field = ({ label, name, type = 'text', form, setForm }: any) => (
  <div>
    <Label>{label}</Label>
    <Input type={type} value={form[name]} onChange={(e) => setForm((f: any) => ({ ...f, [name]: e.target.value }))} className="mt-1.5" />
  </div>
);

export default Register;
