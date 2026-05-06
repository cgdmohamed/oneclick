import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, FileText, Users, CreditCard, Wallet, Package, BarChart3, Bell, ShieldCheck, Cloud, Sparkles, Check, Building2 } from 'lucide-react';

const features = [
  { icon: FileText, title: 'إدارة الفواتير', desc: 'أنشئ فواتيرك الإلكترونية بسرعة وأرسلها لعملائك بضغطة زر.' },
  { icon: CreditCard, title: 'تحصيل المدفوعات', desc: 'سجّل المدفوعات الكاملة والجزئية وقسّمها على عدة طرق دفع.' },
  { icon: Wallet, title: 'حسابات مالية', desc: 'تابع خزائنك وحساباتك البنكية ومحافظك الإلكترونية في مكان واحد.' },
  { icon: Package, title: 'المنتجات والمخزون', desc: 'إدارة كاملة للمنتجات مع تنبيهات المخزون المنخفض.' },
  { icon: BarChart3, title: 'تقارير دقيقة', desc: 'تقارير مالية واضحة تساعدك على اتخاذ قرارات أعمالك.' },
  { icon: ShieldCheck, title: 'أمان وصلاحيات', desc: 'صلاحيات مرنة لكل مستخدم مع حماية كاملة لبياناتك.' },
];

const Home = () => {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-[0.97]" />
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="container relative py-20 md:py-28 text-primary-foreground">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-medium border border-white/20">
              <Sparkles className="h-3.5 w-3.5" /> منصة محاسبة سحابية للشركات العربية
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold leading-[1.15]">
              إدارة محاسبة شركتك<br />بسهولة وذكاء وأمان
            </h1>
            <p className="mt-5 text-lg text-white/85 max-w-2xl">
              حسابات منصة سحابية متكاملة لإصدار الفواتير، تحصيل المدفوعات، إدارة المخزون، ومتابعة أعمالك من مكان واحد، بواجهة عربية أصيلة وتجربة استخدام سلسة.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
                <Link to="/register">ابدأ الآن<ArrowLeft className="h-4 w-4 mr-2" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white">
                <Link to="/features">استعرض المميزات</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-white/80">
              <Stat label="شركة تثق بنا" value="+2,400" />
              <Stat label="فاتورة شهرياً" value="+180K" />
              <Stat label="جاهزية الخدمة" value="99.9%" />
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="container py-20">
        <SectionHeader eyebrow="المميزات" title="كل ما تحتاجه شركتك في منصة واحدة" desc="مصممة خصيصاً للسوق العربي بأحدث المعايير التقنية." />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {features.map(f => (
            <Card key={f.title} className="p-6 shadow-soft hover:shadow-elev transition-shadow border-border/60">
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Invoices showcase */}
      <section className="container py-16">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionEyebrow>إدارة الفواتير</SectionEyebrow>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 leading-tight">فواتير احترافية بالعربية، جاهزة للإرسال خلال ثوانٍ.</h2>
            <p className="text-muted-foreground mt-4">أنشئ فواتيرك بضرائبها وخصوماتها، وشارك رابط الفاتورة العام مع عميلك ليطلع عليها أو يطبعها مباشرة.</p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {['اختيار العميل من قاعدة بياناتك','إضافة المنتجات أو خدمات مخصصة','حساب الضريبة والخصم تلقائياً','رابط مشاركة عام لكل فاتورة','إرسال يدوي عبر البريد أو واتساب'].map(t => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{t}</li>
              ))}
            </ul>
          </div>
          <Card className="p-6 shadow-elev border-border/60">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xs text-muted-foreground">فاتورة رقم</div>
                <div className="font-bold text-lg">INV-2026-0001</div>
              </div>
              <span className="px-3 py-1 rounded-full bg-success/15 text-success text-xs font-semibold">مدفوعة</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <Field label="العميل" value="مؤسسة الزهور التجارية" />
              <Field label="تاريخ الإصدار" value="15 رمضان 1447" />
            </div>
            <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">المجموع</span><span>9,000 ر.س</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الضريبة 15%</span><span>1,350 ر.س</span></div>
              <div className="flex justify-between font-bold pt-2 border-t border-border"><span>الإجمالي</span><span>10,350 ر.س</span></div>
            </div>
          </Card>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-muted/30 border-y border-border/60">
        <div className="container py-20">
          <SectionHeader eyebrow="حلول متكاملة" title="من أول فاتورة إلى آخر تقرير" desc="كل ما تحتاجه لتسيير أعمالك المالية." />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {[
              { icon: CreditCard, title: 'مدفوعات مرنة', desc: 'دفع كامل أو جزئي، نقدي، تحويل بنكي، أو محفظة.' },
              { icon: Building2, title: 'الاشتراكات', desc: 'باقات مرنة تناسب حجم أعمالك وفريقك.' },
              { icon: Package, title: 'مخزون ذكي', desc: 'تنبيهات تلقائية عند انخفاض المنتجات.' },
              { icon: BarChart3, title: 'تقارير شاملة', desc: 'مبيعات، مدفوعات، متبقي، حسب الحساب أو الطريقة.' },
            ].map(p => (
              <Card key={p.title} className="p-6 border-border/60">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <p.icon className="h-5 w-5" />
                </div>
                <h4 className="font-bold mb-1">{p.title}</h4>
                <p className="text-sm text-muted-foreground">{p.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="container py-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <Card className="p-8 border-border/60 shadow-soft order-2 lg:order-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="h-6 w-6" /></div>
              <div>
                <div className="font-bold text-lg">أمان على مستوى المؤسسات</div>
                <div className="text-sm text-muted-foreground">تشفير كامل، نسخ احتياطي يومي، صلاحيات دقيقة.</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mt-6">
              {['تشفير TLS 1.3','عزل بيانات لكل شركة','نسخ احتياطي يومي','صلاحيات حسب الدور','سجلات مراجعة','استضافة سحابية موثوقة'].map(s => (
                <div key={s} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{s}</div>
              ))}
            </div>
          </Card>
          <div className="order-1 lg:order-2">
            <SectionEyebrow>الأمان</SectionEyebrow>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 leading-tight">بياناتك المالية محمية بأعلى المعايير.</h2>
            <p className="text-muted-foreground mt-4">نولي أمان بياناتك أولوية قصوى. نستخدم أحدث تقنيات التشفير والحماية ونوفر صلاحيات دقيقة لكل عضو في فريقك.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <Card className="relative overflow-hidden p-10 md:p-14 border-0 gradient-hero text-primary-foreground text-center">
          <div className="absolute inset-0 bg-grid opacity-10" />
          <div className="relative">
            <Cloud className="h-10 w-10 mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold">جاهز لتطوير محاسبة شركتك؟</h2>
            <p className="mt-3 text-white/85 max-w-xl mx-auto">ابدأ تجربتك الآن دون الحاجة لبطاقة ائتمان، واكتشف الفرق.</p>
            <div className="mt-7 flex justify-center gap-3 flex-wrap">
              <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90"><Link to="/register">ابدأ مجاناً</Link></Button>
              <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"><Link to="/pricing">عرض الأسعار</Link></Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-white/70">{label}</div>
  </div>
);
const SectionEyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{children}</span>
);
const SectionHeader = ({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) => (
  <div className="text-center max-w-2xl mx-auto">
    <SectionEyebrow>{eyebrow}</SectionEyebrow>
    <h2 className="text-3xl md:text-4xl font-bold mt-3">{title}</h2>
    {desc && <p className="text-muted-foreground mt-3">{desc}</p>}
  </div>
);
const Field = ({ label, value }: { label: string; value: string }) => (
  <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>
);

export default Home;
