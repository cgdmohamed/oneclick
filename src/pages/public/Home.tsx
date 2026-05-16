import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  ArrowLeft, FileText, Users, CreditCard, Wallet, Package, BarChart3, Bell,
  ShieldCheck, Cloud, Sparkles, Check, Building2, Star, Receipt, type LucideIcon,
} from 'lucide-react';
import { useLandingContent, type BentoItem } from '@/hooks/useLandingContent';

const ICONS: Record<string, LucideIcon> = {
  FileText, Users, CreditCard, Wallet, Package, BarChart3, Bell, ShieldCheck,
  Cloud, Sparkles, Receipt, Building2,
};

/** Bento size → tailwind grid span classes (4-col grid on lg) */
const sizeClass = (size: BentoItem['size']) => {
  if (size === 'lg') return 'sm:col-span-2 lg:col-span-2 lg:row-span-2';
  if (size === 'md') return 'sm:col-span-2 lg:col-span-2';
  return 'lg:col-span-1';
};

const toneClass = (tone: BentoItem['tone']) => {
  if (tone === 'accent') return 'bg-primary text-primary-foreground border-primary';
  if (tone === 'dark') return 'bg-foreground text-background border-foreground';
  return 'bg-card border-border/60';
};

const Home = () => {
  const { content: c } = useLandingContent();

  return (
    <div>
      {/* ============= HERO ============= */}
      {c.hero.enabled && (
        <section className="relative overflow-hidden bg-gradient-to-b from-secondary/40 to-background">
          <div className="absolute inset-0 bg-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
          <div className="container relative py-20 md:py-28">
            <div className={`grid gap-12 items-center ${c.hero.showImage ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
              <div className={`flex flex-col ${c.hero.showImage ? 'items-start text-start' : 'items-center text-center max-w-3xl mx-auto'}`}>
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/5 border border-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  {c.hero.eyebrow}
                </span>
                <h1 className="mt-6 text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.15] tracking-tight text-foreground">
                  {c.hero.title}
                  {c.hero.titleHighlight && (<><br /><span className="text-primary">{c.hero.titleHighlight}</span></>)}
                </h1>
                <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">{c.hero.subtitle}</p>
                <div className={`mt-10 flex flex-col sm:flex-row items-stretch gap-3 w-full ${c.hero.showImage ? '' : 'justify-center'}`}>
                  <Button asChild size="lg" className="h-12 px-8 shadow-elev">
                    <Link to={c.hero.primary.url}>{c.hero.primary.label}<ArrowLeft className="h-4 w-4 ms-2" /></Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 px-8 bg-card">
                    <Link to={c.hero.secondary.url}>{c.hero.secondary.label}</Link>
                  </Button>
                </div>
                <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex -space-x-2 space-x-reverse">
                    {['س','م','ن','ع'].map((l, i) => (
                      <span key={i} className="h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center border-2 border-background">{l}</span>
                    ))}
                  </div>
                  <span>تجربة مجانية بلا بطاقة ائتمان</span>
                </div>
              </div>

              {c.hero.showImage && c.hero.imageUrl && (
                <div className="relative">
                  <div className="absolute -inset-6 bg-primary/10 rounded-3xl blur-3xl" />
                  <div className="relative rounded-2xl overflow-hidden border border-border/60 shadow-elev bg-card">
                    <img
                      src={c.hero.imageUrl}
                      alt="معاينة منصة حسابات"
                      width={1280}
                      height={960}
                      className="w-full h-auto"
                    />
                  </div>
                  <Card className="absolute -bottom-4 -start-4 hidden md:flex items-center gap-3 p-3 shadow-elev border-border/60 bg-card/95 backdrop-blur">
                    <div className="h-9 w-9 rounded-lg bg-success/15 text-success flex items-center justify-center"><Check className="h-5 w-5" /></div>
                    <div>
                      <div className="text-xs text-muted-foreground">فاتورة جديدة</div>
                      <div className="text-sm font-bold">تم الدفع بالكامل</div>
                    </div>
                  </Card>
                </div>
              )}
            </div>

            {/* Stats inside hero */}
            {c.stats.enabled && c.stats.items.length > 0 && (
              <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-border pt-10">
                {c.stats.items.map(s => (
                  <div key={s.id} className="text-center md:text-start">
                    <div className="text-2xl md:text-3xl font-bold text-foreground">{s.value}</div>
                    <div className="text-xs md:text-sm text-muted-foreground font-medium mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============= LOGOS / SOCIAL PROOF ============= */}
      {c.logos.enabled && c.logos.items.length > 0 && (
        <section className="border-y border-border/60 bg-muted/30">
          <div className="container py-10">
            <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">{c.logos.title}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 items-center">
              {c.logos.items.map(l => (
                <div key={l.id} className="flex items-center justify-center gap-2 text-muted-foreground opacity-70 hover:opacity-100 transition-opacity">
                  <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-sm">{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============= BENTO FEATURES ============= */}
      {c.bento.enabled && c.bento.items.length > 0 && (
        <section className="container py-20">
          <SectionHeader eyebrow={c.bento.eyebrow} title={c.bento.title} desc={c.bento.desc} />
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">
            {c.bento.items.map(item => {
              const Icon = ICONS[item.icon] ?? Sparkles;
              const tone = toneClass(item.tone);
              const size = sizeClass(item.size);
              const isLarge = item.size === 'lg';
              return (
                <Card
                  key={item.id}
                  className={`relative overflow-hidden p-6 border shadow-soft hover:shadow-elev transition-all ${tone} ${size}`}
                >
                  {item.tone === 'accent' && <div className="absolute inset-0 bg-grid opacity-10" />}
                  <div className="relative flex flex-col h-full">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center mb-4 ${
                      item.tone === 'accent' ? 'bg-white/15' : item.tone === 'dark' ? 'bg-background/10' : 'bg-primary/10 text-primary'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className={`font-bold ${isLarge ? 'text-2xl' : 'text-lg'} mb-2`}>{item.title}</h3>
                    <p className={`text-sm leading-relaxed ${
                      item.tone === 'accent' ? 'text-primary-foreground/85' :
                      item.tone === 'dark' ? 'text-background/75' : 'text-muted-foreground'
                    }`}>{item.desc}</p>
                    {isLarge && (
                      <div className="mt-auto pt-6 flex items-center gap-2 text-sm font-semibold">
                        <Sparkles className="h-4 w-4" />
                        <span>مُدمج بشكل أصلي في المنصة</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ============= INVOICE SHOWCASE ============= */}
      {c.showcase.enabled && (
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
      )}

      {/* ============= TESTIMONIALS ============= */}
      {c.testimonials.enabled && c.testimonials.items.length > 0 && (
        <section className="bg-muted/30 border-y border-border/60">
          <div className="container py-20">
            <SectionHeader eyebrow={c.testimonials.eyebrow} title={c.testimonials.title} />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
              {c.testimonials.items.map(t => (
                <Card key={t.id} className="p-6 border-border/60 shadow-soft flex flex-col">
                  <div className="flex gap-1 mb-3 text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="text-sm leading-relaxed flex-1">«{t.quote}»</p>
                  <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border/60">
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">{t.initials}</div>
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============= FAQ ============= */}
      {c.faq.enabled && c.faq.items.length > 0 && (
        <section className="container py-20">
          <SectionHeader eyebrow={c.faq.eyebrow} title={c.faq.title} />
          <div className="max-w-3xl mx-auto mt-10">
            <Accordion type="single" collapsible className="space-y-3">
              {c.faq.items.map(f => (
                <AccordionItem key={f.id} value={f.id} className="border border-border/60 rounded-xl px-5 bg-card">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline text-start">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* ============= CTA ============= */}
      {c.cta.enabled && (
        <section className="container pb-24">
          <Card className="relative overflow-hidden p-10 md:p-14 border-0 gradient-hero text-primary-foreground text-center">
            <div className="absolute inset-0 bg-grid opacity-10" />
            <div className="relative">
              <Cloud className="h-10 w-10 mx-auto mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold">{c.cta.title}</h2>
              <p className="mt-3 text-white/85 max-w-xl mx-auto">{c.cta.subtitle}</p>
              <div className="mt-7 flex justify-center gap-3 flex-wrap">
                <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90"><Link to={c.cta.primary.url}>{c.cta.primary.label}</Link></Button>
                <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"><Link to={c.cta.secondary.url}>{c.cta.secondary.label}</Link></Button>
              </div>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
};

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
