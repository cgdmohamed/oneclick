// Catalog of feature keys gated per plan. Keep in sync with the
// admin "Feature Access" matrix and the tenant sidebar navigation.

export interface PlanFeatureDef {
  key: string;
  label: string;
  /** Optional tenant route this feature unlocks. */
  route?: string;
}

export const PLAN_FEATURES: PlanFeatureDef[] = [
  { key: 'invoices',         label: 'إدارة الفواتير',        route: '/app/invoices' },
  { key: 'clients',          label: 'إدارة العملاء',         route: '/app/clients' },
  { key: 'payments',         label: 'تسجيل المدفوعات',       route: '/app/payments' },
  { key: 'products',         label: 'إدارة المنتجات',        route: '/app/products' },
  { key: 'inventory',        label: 'إدارة المخزون' },
  { key: 'accounts',         label: 'الحسابات المالية',      route: '/app/accounts' },
  { key: 'bank_accounts',    label: 'الحسابات البنكية' },
  { key: 'wallets',          label: 'المحافظ الإلكترونية' },
  { key: 'reports_basic',    label: 'تقارير أساسية',         route: '/app/reports' },
  { key: 'reports_advanced', label: 'التقارير المتقدمة' },
  { key: 'notifications',    label: 'التنبيهات',             route: '/app/notifications' },
  { key: 'sms_alerts',       label: 'تنبيهات SMS' },
  { key: 'rbac',             label: 'إدارة الصلاحيات',       route: '/app/users' },
  { key: 'activity_log',     label: 'سجل الأنشطة',           route: '/app/activity' },
  { key: 'api',              label: 'تكامل API' },
];

export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  PLAN_FEATURES.map(f => [f.key, f.label]),
);

// Defaults per built-in mock plan. New custom plans default to empty.
export const DEFAULT_PLAN_FEATURES: Record<string, string[]> = {
  'plan-basic': ['invoices', 'clients', 'payments', 'reports_basic', 'notifications'],
  'plan-pro': [
    'invoices', 'clients', 'payments', 'products', 'inventory',
    'accounts', 'bank_accounts', 'wallets', 'reports_basic',
    'reports_advanced', 'notifications', 'rbac', 'activity_log',
  ],
  'plan-business': PLAN_FEATURES.map(f => f.key),
};
