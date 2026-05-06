import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { PlanCard } from '@/components/common/PlanCard';
import { Switch } from '@/components/ui/switch';
import { plans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const Plans = () => {
  const [yearly, setYearly] = useState(false);
  return (
    <div>
      <PageHeader title="الباقات" description="إدارة باقات الاشتراك"
        actions={<Button onClick={() => toast.message('إضافة باقة (placeholder)')}><Plus className="h-4 w-4 ml-1" /> باقة جديدة</Button>} />
      <div className="flex items-center gap-3 mb-6 text-sm">
        <span className={!yearly ? 'font-semibold' : 'text-muted-foreground'}>شهري</span>
        <Switch checked={yearly} onCheckedChange={setYearly} />
        <span className={yearly ? 'font-semibold' : 'text-muted-foreground'}>سنوي</span>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {plans.map(p => <PlanCard key={p.id} plan={p} yearly={yearly} cta="تعديل الباقة" onSelect={() => toast.message('تعديل (placeholder)')} />)}
      </div>
    </div>
  );
};

export default Plans;
