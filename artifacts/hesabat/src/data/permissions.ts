import type { Role } from '@/types';

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'manage';

export interface PermissionRow {
  key: string;
  module: string;
  action: string;
}

export const permissionRows: PermissionRow[] = [
  { key: 'invoices.view',   module: 'الفواتير',     action: 'عرض' },
  { key: 'invoices.create', module: 'الفواتير',     action: 'إنشاء' },
  { key: 'invoices.edit',   module: 'الفواتير',     action: 'تعديل' },
  { key: 'invoices.delete', module: 'الفواتير',     action: 'حذف' },

  { key: 'payments.view',   module: 'التحصيلات',    action: 'عرض' },
  { key: 'payments.create', module: 'التحصيلات',    action: 'تسجيل تحصيل' },
  { key: 'payments.delete', module: 'التحصيلات',    action: 'حذف' },

  { key: 'clients.view',    module: 'العملاء',      action: 'عرض' },
  { key: 'clients.manage',  module: 'العملاء',      action: 'إضافة/تعديل/حذف' },

  { key: 'suppliers.view',   module: 'الموردون',    action: 'عرض' },
  { key: 'suppliers.manage', module: 'الموردون',    action: 'إضافة/تعديل/حذف' },

  { key: 'products.view',   module: 'المنتجات',     action: 'عرض' },
  { key: 'products.manage', module: 'المنتجات',     action: 'إضافة/تعديل/حذف' },

  { key: 'accounts.view',   module: 'الحسابات المالية', action: 'عرض' },
  { key: 'accounts.manage', module: 'الحسابات المالية', action: 'إدارة' },

  { key: 'branches.view',   module: 'الفروع', action: 'عرض' },
  { key: 'branches.manage', module: 'الفروع', action: 'إدارة' },

  { key: 'cost_centers.view',   module: 'مراكز التكلفة', action: 'عرض' },
  { key: 'cost_centers.manage', module: 'مراكز التكلفة', action: 'إدارة' },

  { key: 'payouts.view',    module: 'المصروفات',    action: 'عرض' },
  { key: 'payouts.create',  module: 'المصروفات',    action: 'تسجيل مصروف' },
  { key: 'payouts.delete',  module: 'المصروفات',    action: 'حذف' },

  { key: 'expense_categories.manage', module: 'تصنيفات المصروفات', action: 'إدارة' },

  { key: 'stock_movements.view',   module: 'حركة المخزون', action: 'عرض' },
  { key: 'stock_movements.manage', module: 'حركة المخزون', action: 'إدارة' },
  { key: 'inventory_writeoffs.view', module: 'شطب المخزون', action: 'عرض' },
  { key: 'inventory_writeoffs.create', module: 'شطب المخزون', action: 'إنشاء' },
  { key: 'inventory_writeoffs.post', module: 'شطب المخزون', action: 'ترحيل' },
  { key: 'inventory_writeoffs.cancel', module: 'شطب المخزون', action: 'إلغاء / عكس' },

  { key: 'reports.view',    module: 'التقارير',     action: 'عرض' },
  { key: 'reports.export',  module: 'التقارير',     action: 'تصدير' },

  { key: 'accounting.view', module: 'المحاسبة', action: 'عرض' },
  { key: 'accounting.manage', module: 'المحاسبة', action: 'إدارة' },
  { key: 'journal_entries.view', module: 'قيود اليومية', action: 'عرض' },
  { key: 'journal_entries.create', module: 'قيود اليومية', action: 'إنشاء' },
  { key: 'journal_entries.post', module: 'قيود اليومية', action: 'ترحيل' },
  { key: 'journal_entries.reverse', module: 'قيود اليومية', action: 'عكس' },
  { key: 'chart_accounts.view', module: 'دليل الحسابات', action: 'عرض' },
  { key: 'chart_accounts.manage', module: 'دليل الحسابات', action: 'إدارة' },
  { key: 'fiscal_periods.manage', module: 'الفترات المالية', action: 'إدارة' },
  { key: 'accounting_settings.manage', module: 'إعدادات المحاسبة', action: 'إدارة' },
  { key: 'purchases.view', module: 'المشتريات', action: 'عرض' },
  { key: 'purchases.manage', module: 'المشتريات', action: 'إدارة' },
  { key: 'supplier_payments.view', module: 'دفعات الموردين', action: 'عرض' },
  { key: 'supplier_payments.manage', module: 'دفعات الموردين', action: 'إدارة' },
  { key: 'financial_reports.view', module: 'التقارير المالية', action: 'عرض' },

  { key: 'users.manage',    module: 'المستخدمون',   action: 'إدارة الفريق' },
  { key: 'settings.manage', module: 'الإعدادات',    action: 'تعديل إعدادات الشركة' },
  { key: 'subscription.manage', module: 'الاشتراك', action: 'إدارة الاشتراك' },
];

export const matrixRoles: { role: Role; label: string }[] = [
  { role: 'company_admin', label: 'مدير الشركة' },
  { role: 'accountant',    label: 'محاسب' },
  { role: 'sales',         label: 'مبيعات' },
  { role: 'viewer',        label: 'مشاهدة فقط' },
];

export const rolePermissionMap: Record<Role, Set<string>> = {
  super_admin: new Set(permissionRows.map((p) => p.key)),
  company_admin: new Set(permissionRows.map((p) => p.key)),
  accountant: new Set([
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.create', 'payments.delete',
    'clients.view', 'clients.manage',
    'suppliers.view', 'suppliers.manage',
    'products.view',
    'accounts.view', 'accounts.manage',
    'branches.view', 'branches.manage',
    'cost_centers.view', 'cost_centers.manage',
    'payouts.view', 'payouts.create', 'payouts.delete',
    'expense_categories.manage',
    'stock_movements.view', 'stock_movements.manage',
    'inventory_writeoffs.view', 'inventory_writeoffs.create', 'inventory_writeoffs.post', 'inventory_writeoffs.cancel',
    'reports.view', 'reports.export',
    'accounting.view', 'accounting.manage',
    'journal_entries.view', 'journal_entries.create', 'journal_entries.post', 'journal_entries.reverse',
    'chart_accounts.view', 'chart_accounts.manage',
    'fiscal_periods.manage', 'accounting_settings.manage',
    'purchases.view', 'purchases.manage',
    'supplier_payments.view', 'supplier_payments.manage',
    'financial_reports.view',
  ]),
  sales: new Set([
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.create',
    'clients.view', 'clients.manage',
    'suppliers.view',
    'products.view',
    'branches.view', 'cost_centers.view',
    'stock_movements.view',
    'inventory_writeoffs.view',
    'reports.view',
    'accounting.view', 'journal_entries.view', 'chart_accounts.view',
    'purchases.view', 'supplier_payments.view', 'financial_reports.view',
  ]),
  viewer: new Set([
    'invoices.view', 'payments.view', 'clients.view',
    'suppliers.view',
    'products.view', 'accounts.view', 'reports.view',
    'branches.view', 'cost_centers.view',
    'payouts.view', 'stock_movements.view',
    'inventory_writeoffs.view',
    'accounting.view', 'journal_entries.view', 'chart_accounts.view',
    'purchases.view', 'supplier_payments.view', 'financial_reports.view',
  ]),
};

export const roleHasPermission = (role: Role, key: string): boolean =>
  rolePermissionMap[role]?.has(key) ?? false;
