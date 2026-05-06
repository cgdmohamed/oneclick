import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { payments, accounts, invoices } from '@/data/mock';
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Payment } from '@/types';

const Payments = () => {
  const [method, setMethod] = useState<string>('all');
  const flat = payments.flatMap(p => p.splits.map((s, i) => ({
    id: `${p.id}-${i}`,
    paymentId: p.id,
    invoiceId: p.invoiceId,
    date: p.date,
    method: s.method,
    accountId: s.accountId,
    amount: s.amount,
  })));
  const filtered = method === 'all' ? flat : flat.filter(f => f.method === method);

  const columns: Column<typeof filtered[0]>[] = [
    { key: 'date', header: 'التاريخ', cell: r => <span className="text-muted-foreground">{formatDateShort(r.date)}</span> },
    { key: 'inv', header: 'الفاتورة', cell: r => invoices.find(i => i.id === r.invoiceId)?.number ?? '—' },
    { key: 'method', header: 'الطريقة', cell: r => paymentMethodLabel(r.method) },
    { key: 'account', header: 'الحساب المالي', cell: r => accounts.find(a => a.id === r.accountId)?.name ?? '—' },
    { key: 'amount', header: 'المبلغ', cell: r => <span className="font-semibold">{formatCurrency(r.amount)}</span>, className: 'text-left' },
  ];

  return (
    <div>
      <PageHeader title="المدفوعات" description="جميع المدفوعات المسجلة على الفواتير" />
      <DataTable
        data={filtered}
        columns={columns as any}
        rightToolbar={
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الطرق</SelectItem>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="bank">تحويل بنكي</SelectItem>
              <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
};

export default Payments;
