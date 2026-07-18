import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { ArrowRight, Landmark, Wallet } from 'lucide-react';
import type { DepreciationRunLine, FixedAsset } from './types';

const FixedAssetDetails = () => {
  const { id } = useParams();
  const { data: asset } = useQuery({ enabled: !!id, queryKey: ['fixed-asset', id], queryFn: async () => (await api.get<{ data: FixedAsset }>(`/api/fixed-assets/assets/${id}`)).data });
  if (!asset) return <div className="p-6 text-muted-foreground">جار التحميل...</div>;
  const history = (asset.depreciation_lines ?? []).map((line, idx) => ({ ...line, id: line.id ?? `${line.asset_id}-${idx}` }));
  const cols: Column<DepreciationRunLine & { id: string }>[] = [
    { key: 'period', header: 'الفترة', cell: (r) => r.period_name ?? '—' },
    { key: 'date', header: 'التاريخ', cell: (r) => r.run_date ? formatDateShort(r.run_date) : '—' },
    { key: 'amount', header: 'الإهلاك', cell: (r) => formatCurrency(Number(r.depreciation_amount)), className: 'text-end' },
    { key: 'acc', header: 'المجمع بعد التشغيل', cell: (r) => formatCurrency(Number(r.accumulated_depreciation_after)), className: 'text-end' },
    { key: 'journal', header: 'القيد', cell: (r) => r.journal_entry_id ? <Link className="text-primary" to={`/app/accounting/journals/${r.journal_entry_id}`}>عرض</Link> : '—' },
  ];
  return (
    <div className="space-y-5">
      <Link to="/app/accounting/assets" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> العودة للأصول</Link>
      <PageHeader title={`${asset.asset_code} - ${asset.name}`} description={asset.category_name ?? ''} />
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard title="تكلفة الاقتناء" value={formatCurrency(Number(asset.acquisition_cost))} icon={Wallet} accent="info" />
        <StatCard title="القيمة التخريدية" value={formatCurrency(Number(asset.salvage_value))} icon={Wallet} accent="warning" />
        <StatCard title="العمر الافتراضي" value={`${asset.useful_life_months} شهر`} icon={Landmark} accent="primary" />
        <StatCard title="الحالة" value={asset.status} icon={Landmark} accent="success" />
      </div>
      <Card className="p-4 border-border/60 text-sm grid sm:grid-cols-3 gap-3">
        <div><span className="text-muted-foreground">تاريخ الشراء:</span> {formatDateShort(asset.purchase_date)}</div>
        <div><span className="text-muted-foreground">بداية الإهلاك:</span> {formatDateShort(asset.depreciation_start_date)}</div>
        <div><span className="text-muted-foreground">ملاحظات:</span> {asset.notes ?? '—'}</div>
      </Card>
      <DataTable data={history} columns={cols} emptyTitle="لا توجد إهلاكات لهذا الأصل" />
    </div>
  );
};

export default FixedAssetDetails;
