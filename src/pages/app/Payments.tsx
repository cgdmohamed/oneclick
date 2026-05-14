import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { payments as mockPayments, accounts as mockAccounts, invoices as mockInvoices } from '@/data/mock';
import { formatCurrency, formatDateShort, paymentMethodLabel } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useResource } from '@/hooks/useResource';
import type { PaymentMethod } from '@/types';

interface PaymentRowApi {
  id: string;
  amount: string | number;
  paid_at: string;
  method: string;
  account_id: string;
  account_name: string;
  invoice_id: string;
  invoice_number: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  accountName: string;
  invoiceNumber: string;
}

// Flatten mock payments (with splits) into one row per split, matching the API shape
const initialFlat: PaymentRow[] = mockPayments.flatMap(p => p.splits.map((s, i) => ({
  id: `${p.id}-${i}`,
  amount: s.amount,
  date: p.date,
  method: s.method,
  accountName: mockAccounts.find(a => a.id === s.accountId)?.name ?? '—',
  invoiceNumber: mockInvoices.find(inv => inv.id === p.invoiceId)?.number ?? '—',
})));

const Payments = () => {
  const { list } = useResource<PaymentRow, PaymentRowApi>({
    path: '/api/payments',
    key: 'payments',
    initial: initialFlat,
    fromRow: (r) => ({
      id: r.id,
      amount: Number(r.amount),
      date: r.paid_at,
      method: (r.method as PaymentMethod) ?? 'cash',
      accountName: r.account_name,
      invoiceNumber: r.invoice_number,
    }),
    toRow: () => ({}),
  });

  const [method, setMethod] = useState<string>('all');
  const filtered = useMemo(
    () => method === 'all' ? list : list.filter(f => f.method === method),
    [method, list],
  );

  const columns: Column<PaymentRow>[] = [
    { key: 'date', header: 'التاريخ', cell: r => <span className="text-muted-foreground">{formatDateShort(r.date)}</span> },
    { key: 'inv', header: 'الفاتورة', cell: r => r.invoiceNumber },
    { key: 'method', header: 'الطريقة', cell: r => paymentMethodLabel(r.method) },
    { key: 'account', header: 'الحساب المالي', cell: r => r.accountName },
    { key: 'amount', header: 'المبلغ', cell: r => <span className="font-semibold">{formatCurrency(r.amount)}</span>, className: 'text-left' },
  ];

  return (
    <div>
      <PageHeader title="المدفوعات" description="جميع المدفوعات المسجلة على الفواتير" />
      <DataTable
        data={filtered}
        columns={columns}
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
