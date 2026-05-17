import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Building2, Users, Package, FileText, Bell, CheckCircle2, ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface Step {
  key: string;
  icon: typeof Sparkles;
  title: string;
  description: string;
  tips?: string[];
  cta?: { label: string; to: string };
}

const buildSteps = (companyName: string): Step[] => [
  {
    key: 'welcome',
    icon: Sparkles,
    title: `أهلًا بك في ${companyName} 👋`,
    description: 'سنرشدك خلال خطوات سريعة لإعداد نظامك المحاسبي والبدء في إصدار فواتيرك خلال دقائق.',
    tips: [
      'يمكنك تخطي الجولة في أي وقت والعودة إليها لاحقًا.',
      'كل خطوة تستغرق أقل من دقيقة.',
      'سنرافقك حتى أول فاتورة لك.',
    ],
  },
  {
    key: 'company',
    icon: Building2,
    title: 'إعدادات الشركة',
    description: 'ابدأ بإدخال بيانات شركتك الأساسية: الاسم، الرقم الضريبي، وشعار الشركة.',
    tips: [
      'بياناتك ستظهر تلقائيًا على جميع الفواتير.',
      'يمكنك تعديلها لاحقًا من صفحة الإعدادات.',
    ],
    cta: { label: 'فتح الإعدادات', to: '/app/settings' },
  },
  {
    key: 'clients',
    icon: Users,
    title: 'أضف أول عميل',
    description: 'سجّل عملاءك للوصول السريع إليهم عند إنشاء الفواتير وتتبع مديونياتهم.',
    tips: ['يمكنك استيراد قائمة العملاء دفعة واحدة لاحقًا.'],
    cta: { label: 'إدارة العملاء', to: '/app/clients' },
  },
  {
    key: 'products',
    icon: Package,
    title: 'أضف منتجاتك أو خدماتك',
    description: 'أنشئ كتالوج المنتجات والخدمات مع أسعارها لتسريع إنشاء الفواتير وتتبع المخزون.',
    tips: ['اضبط حد التنبيه لكل منتج ليصلك إشعار عند انخفاض المخزون.'],
    cta: { label: 'إدارة المنتجات', to: '/app/products' },
  },
  {
    key: 'invoice',
    icon: FileText,
    title: 'أنشئ أول فاتورة',
    description: 'الآن جاهز لإصدار فاتورتك الأولى بكل سهولة، مع طباعتها أو إرسالها لعميلك.',
    cta: { label: 'فاتورة جديدة', to: '/app/invoices/new' },
  },
  {
    key: 'notifications',
    icon: Bell,
    title: 'فعّل التنبيهات',
    description: 'استلم تنبيهات لحظية عن الفواتير المستحقة، المدفوعات الجديدة، وانخفاض المخزون.',
    cta: { label: 'إعدادات التنبيهات', to: '/app/notifications' },
  },
  {
    key: 'done',
    icon: Rocket,
    title: 'كل شيء جاهز! 🚀',
    description: 'أكملت الإعداد الأساسي بنجاح. يمكنك الآن استكشاف باقي الميزات أو البدء فورًا في عملك اليومي.',
    tips: ['يمكنك إعادة هذه الجولة في أي وقت من قائمة المستخدم في الأعلى.'],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const OnboardingWizard = ({ open, onOpenChange }: Props) => {
  const { companyName, markOnboardingDone } = useAuth();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const steps = useMemo(() => buildSteps(companyName || 'نظامك المحاسبي'), [companyName]);

  useEffect(() => { if (open) setIndex(0); }, [open]);

  const step = steps[index];
  const Icon = step.icon;
  const isLast = index === steps.length - 1;
  const isFirst = index === 0;
  const progress = ((index + 1) / steps.length) * 100;

  const finish = () => {
    markOnboardingDone();
    onOpenChange(false);
  };

  const handleCta = () => {
    if (step.cta) {
      navigate(step.cta.to);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); else onOpenChange(o); }}>
      <DialogContent dir="rtl" className="max-w-lg p-0 overflow-hidden gap-0">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              الخطوة {index + 1} من {steps.length}
            </span>
            {!isLast && (
              <button
                onClick={finish}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                تخطي الجولة
              </button>
            )}
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0 text-start">
              <DialogHeader className="space-y-2 text-start">
                <DialogTitle className="text-xl text-start">{step.title}</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-start">
                  {step.description}
                </DialogDescription>
              </DialogHeader>

              {step.tips && step.tips.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {step.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      <span className="text-start">{tip}</span>
                    </li>
                  ))}
                </ul>
              )}

              {step.cta && (
                <div className="mt-5">
                  <Button variant="secondary" size="sm" onClick={handleCta} className="gap-1.5">
                    {step.cta.label}
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 flex-row justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="gap-1"
          >
            <ArrowRight className="h-4 w-4" />
            السابق
          </Button>
          {isLast ? (
            <Button size="sm" onClick={finish} className="gap-1.5">
              <Rocket className="h-4 w-4" />
              ابدأ الآن
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="gap-1"
            >
              التالي
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
