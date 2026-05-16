import { Card } from '@/components/ui/card';
import { FileText, Users, CreditCard, SplitSquareHorizontal, Wallet, Package, Bell, BarChart3, ShieldCheck } from 'lucide-react';

const items = [
  { icon: FileText, title: 'إدارة الفواتير', desc: 'إنشاء وإرسال ومتابعة الفواتير مع حالات واضحة (مدفوعة، جزئية، متأخرة).' },
  { icon: Users, title: 'إدارة العملاء', desc: 'قاعدة بيانات منظمة لعملائك مع كامل بياناتهم الضريبية وسجل تعاملاتهم.' },
  { icon: CreditCard, title: 'تسجيل المدفوعات', desc: 'سجّل كل دفعة بتاريخها وطريقتها واربطها بالحساب المالي المناسب.' },
  { icon: SplitSquareHorizontal, title: 'التحصيل الجزئي والكلي', desc: 'مرونة كاملة في التحصيل: دفعة واحدة كاملة أو دفعات متعددة على فترات.' },
  { icon: Wallet, title: 'الحسابات البنكية والمحافظ', desc: 'إدارة موحدة للخزائن والحسابات البنكية والمحافظ الإلكترونية.' },
  { icon: Package, title: 'إدارة المنتجات والمخزون', desc: 'تتبع الكميات وحركة المخزون مع تنبيهات الحد الأدنى.' },
  { icon: Bell, title: 'التنبيهات', desc: 'تنبيهات فورية للفواتير المتأخرة، المدفوعات، والمخزون المنخفض.' },
  { icon: BarChart3, title: 'التقارير المالية', desc: 'تقارير المبيعات، المتبقي، المدفوعات، حسب الحساب أو وسيلة الدفع.' },
  { icon: ShieldCheck, title: 'إدارة المستخدمين والصلاحيات', desc: 'صلاحيات مرنة لكل دور: مدير، محاسب، مبيعات، مشاهدة.' },
];

const Features = () => (
  <div className="container py-16">
    <div className="text-center max-w-2xl mx-auto mb-12">
      <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">المميزات</span>
      <h1 className="text-4xl md:text-5xl font-extrabold mt-4">منصة محاسبة متكاملة</h1>
      <p className="text-muted-foreground mt-4 text-lg">كل أدوات المحاسبة التي تحتاجها شركتك في مكان واحد، بواجهة عربية احترافية.</p>
    </div>
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map(f => (
        <Card key={f.title} className="p-6 border-border/60 shadow-soft hover:shadow-elev transition-shadow">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
            <f.icon className="h-6 w-6" />
          </div>
          <h3 className="font-bold text-lg mb-2">{f.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
        </Card>
      ))}
    </div>
  </div>
);

export default Features;
