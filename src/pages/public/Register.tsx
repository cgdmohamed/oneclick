import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { isApiConfigured, registerRequest, ApiError } from '@/lib/api';
import { submitSignupRequest } from '@/hooks/usePendingSignups';
import { logActivity } from '@/lib/activityLog';
import { toast } from 'sonner';

const Register = () => {
  const [form, setForm] = useState({ company: '', owner: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company || !form.owner || !form.email || !form.password) {
      return toast.error('يرجى تعبئة كل الحقول المطلوبة');
    }
    setLoading(true);
    try {
      if (isApiConfigured()) {
        await registerRequest({
          email: form.email, password: form.password,
          name: form.owner, companyName: form.company,
        });
      }
      submitSignupRequest({
        companyName: form.company,
        ownerName: form.owner,
        email: form.email,
        phone: form.phone,
      });
      logActivity({
        module: 'user', action: 'create',
        description: `طلب تسجيل جديد من ${form.company} (${form.email}) — بانتظار المراجعة`,
        userName: form.owner, userEmail: form.email,
      });
      toast.success('تم إرسال طلب تسجيل شركتك للمراجعة');
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذّر إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="container py-12">
        <div className="max-w-xl mx-auto">
          <Card className="p-10 border-border/60 shadow-soft text-center">
            <div className="h-16 w-16 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold mb-2">تم استلام طلبك</h1>
            <p className="text-muted-foreground mb-1">طلب تسجيل <b>{form.company}</b> قيد المراجعة من فريق ون كليك.</p>
            <p className="text-sm text-muted-foreground mb-6">سنرسل لك بريداً إلكترونياً على <b dir="ltr">{form.email}</b> فور اعتماد حسابك وتفعيل الباقة المناسبة.</p>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline"><Link to="/">العودة للرئيسية</Link></Button>
              <Button asChild><Link to="/login">صفحة تسجيل الدخول</Link></Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-12">
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 border-border/60 shadow-soft">
          <div className="flex items-center gap-2 mb-6 justify-center">
            <span className="h-10 w-10 rounded-xl gradient-hero text-primary-foreground flex items-center justify-center">
              <Calculator className="h-5 w-5" />
            </span>
            <span className="font-bold text-lg">ون كليك</span>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">سجّل شركتك مجاناً</h1>
            <p className="text-muted-foreground mt-2">أرسل طلبك وسيقوم فريقنا بمراجعته وتفعيل حسابك خلال 24 ساعة.</p>
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
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? 'جارٍ الإرسال…' : 'إرسال طلب التسجيل'}
              </Button>
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
