import { Card } from '@/components/ui/card';
import { Target, Eye, Heart } from 'lucide-react';

const About = () => (
  <div className="container py-16">
    <div className="max-w-3xl mx-auto text-center mb-14">
      <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">من نحن</span>
      <h1 className="text-4xl md:text-5xl font-extrabold mt-4">نبني المستقبل المالي للشركات العربية</h1>
      <p className="text-muted-foreground mt-5 text-lg leading-relaxed">
        حسابات منصة سحابية متخصصة في تقديم حلول محاسبية مرنة وسهلة للشركات الصغيرة والمتوسطة في العالم العربي. نؤمن بأن إدارة الحسابات يجب أن تكون بسيطة وممتعة، حتى يتفرّغ أصحاب الأعمال لما يهم: تنمية أعمالهم.
      </p>
    </div>

    <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
      {[
        { icon: Target, title: 'مهمتنا', desc: 'تبسيط المحاسبة للشركات العربية بأدوات تقنية متطورة وواجهة سهلة.' },
        { icon: Eye, title: 'رؤيتنا', desc: 'أن نكون المنصة الأولى للمحاسبة السحابية في المنطقة العربية بحلول 2030.' },
        { icon: Heart, title: 'قيمنا', desc: 'الشفافية، الموثوقية، الابتكار، وخدمة العميل العربي بعقلية محلية.' },
      ].map(c => (
        <Card key={c.title} className="p-7 border-border/60 shadow-soft text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
            <c.icon className="h-6 w-6" />
          </div>
          <h3 className="font-bold text-lg mb-2">{c.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
        </Card>
      ))}
    </div>
  </div>
);

export default About;
