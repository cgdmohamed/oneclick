import { getCurrencySymbol } from './currency';

export const formatCurrency = (n: number, currency?: string): string => {
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
  return `${formatted} ${currency ?? getCurrencySymbol()}`;
};

export const formatDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export const formatDateShort = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export const paymentMethodLabel = (m: string): string => {
  switch (m) {
    case 'cash': return 'نقدي';
    case 'bank': return 'تحويل بنكي';
    case 'wallet': return 'محفظة إلكترونية';
    default: return m;
  }
};

export const accountTypeLabel = (t: string): string => {
  switch (t) {
    case 'cash': return 'خزنة';
    case 'bank': return 'حساب بنكي';
    case 'wallet': return 'محفظة إلكترونية';
    default: return t;
  }
};

export const invoiceStatusLabel = (s: string): string => {
  switch (s) {
    case 'paid': return 'مدفوعة';
    case 'partial': return 'مدفوعة جزئياً';
    case 'unpaid': return 'غير مدفوعة';
    case 'overdue': return 'متأخرة';
    default: return s;
  }
};

export const roleLabel = (r: string): string => {
  switch (r) {
    case 'company_admin': return 'مدير الشركة';
    case 'accountant': return 'محاسب';
    case 'sales': return 'مبيعات';
    case 'viewer': return 'مشاهدة فقط';
    case 'super_admin': return 'مشرف عام';
    default: return r;
  }
};

export const companyStatusLabel = (s: string): string => {
  switch (s) {
    case 'active': return 'نشطة';
    case 'suspended': return 'موقوفة';
    case 'expired': return 'منتهية الاشتراك';
    default: return s;
  }
};

export const notificationCategoryLabel = (c: string): string => {
  switch (c) {
    case 'invoice': return 'فواتير';
    case 'payment': return 'مدفوعات';
    case 'debt': return 'ديون';
    case 'product': return 'منتجات';
    case 'stock': return 'مخزون';
    case 'system': return 'النظام';
    default: return c;
  }
};
