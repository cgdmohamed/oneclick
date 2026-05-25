export interface PlanFeatureDef {
  key: string;
  label: string;
  route?: string;
}

export const PLAN_FEATURES: PlanFeatureDef[] = [
  { key: 'invoices',              label: 'إدارة الفواتير',             route: '/app/invoices' },
  { key: 'clients',               label: 'إدارة العملاء',              route: '/app/clients' },
  { key: 'payments',              label: 'تسجيل التحصيلات',            route: '/app/payments' },
  { key: 'suppliers',             label: 'إدارة الموردين',             route: '/app/suppliers' },
  { key: 'payouts',               label: 'المصروفات والمدفوعات',       route: '/app/payouts' },
  { key: 'products',              label: 'إدارة المنتجات',             route: '/app/products' },
  { key: 'inventory',             label: 'إدارة المخزون' },
  { key: 'stock_movements',       label: 'حركة المخزون' },
  { key: 'accounts',              label: 'الحسابات المالية',           route: '/app/accounts' },
  { key: 'bank_accounts',         label: 'الحسابات البنكية' },
  { key: 'wallets',               label: 'المحافظ الإلكترونية' },
  { key: 'reports_basic',         label: 'تقارير أساسية',              route: '/app/reports' },
  { key: 'reports_advanced',      label: 'التقارير المتقدمة' },
  { key: 'notifications',         label: 'التنبيهات',                  route: '/app/notifications' },
  { key: 'sms_alerts',            label: 'تنبيهات SMS' },
  { key: 'rbac',                  label: 'إدارة الصلاحيات',            route: '/app/users' },
  { key: 'activity_log',          label: 'سجل الأنشطة',                route: '/app/activity' },
  { key: 'api',                   label: 'تكامل API' },
];

export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  PLAN_FEATURES.map(f => [f.key, f.label]),
);

export const DEFAULT_PLAN_FEATURES: Record<string, string[]> = {
  'plan-basic': ['invoices', 'clients', 'payments', 'reports_basic', 'notifications'],
  'plan-pro': [
    'invoices', 'clients', 'payments', 'suppliers', 'payouts',
    'products', 'inventory', 'stock_movements',
    'accounts', 'bank_accounts', 'wallets',
    'reports_basic', 'reports_advanced', 'notifications', 'rbac', 'activity_log',
  ],
  'plan-business': PLAN_FEATURES.map(f => f.key),
};
