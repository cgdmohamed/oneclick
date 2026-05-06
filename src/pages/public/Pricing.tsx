import { useState } from 'react';
import { plans } from '@/data/mock';
import { PlanCard } from '@/components/common/PlanCard';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom';

const Pricing = () => {
  const [yearly, setYearly] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="container py-16">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">الأسعار</span>
        <h1 className="text-4xl md:text-5xl font-extrabold mt-4">باقات تناسب جميع الأحجام</h1>
        <p className="text-muted-foreground mt-4 text-lg">اختر الباقة المناسبة لشركتك، يمكنك الترقية أو التراجع في أي وقت.</p>
        <div className="mt-7 inline-flex items-center gap-3 rounded-full bg-card border border-border p-1.5 px-3">
          <span className={!yearly ? 'font-semibold' : 'text-muted-foreground'}>شهري</span>
          <Switch checked={yearly} onCheckedChange={setYearly} />
          <span className={yearly ? 'font-semibold' : 'text-muted-foreground'}>سنوي</span>
          <span className="text-xs bg-success/15 text-success px-2 py-0.5 rounded-full font-medium">وفّر شهرين</span>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map(p => (
          <PlanCard key={p.id} plan={p} yearly={yearly} onSelect={() => navigate('/register')} />
        ))}
      </div>
    </div>
  );
};

export default Pricing;
