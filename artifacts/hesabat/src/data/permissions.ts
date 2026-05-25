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

  { key: 'payouts.view',    module: 'المصروفات',    action: 'عرض' },
  { key: 'payouts.create',  module: 'المصروفات',    action: 'تسجيل مصروف' },
  { key: 'payouts.delete',  module: 'المصروفات',    action: 'حذف' },

  { key: 'expense_categories.manage', module: 'تصنيفات المصروفات', action: 'إدارة' },

  { key: 'stock_movements.view',   module: 'حركة المخزون', action: 'عرض' },
  { key: 'stock_movements.manage', module: 'حركة المخزون', action: 'إدارة' },

  { key: 'reports.view',    module: 'التقارير',     action: 'عرض' },
  { key: 'reports.export',  module: 'التقارير',     action: 'تصدير' },

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
    'payouts.view', 'payouts.create', 'payouts.delete',
    'expense_categories.manage',
    'stock_movements.view', 'stock_movements.manage',
    'reports.view', 'reports.export',
  ]),
  sales: new Set([
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.create',
    'clients.view', 'clients.manage',
    'suppliers.view',
    'products.view',
    'stock_movements.view',
    'reports.view',
  ]),
  viewer: new Set([
    'invoices.view', 'payments.view', 'clients.view',
    'suppliers.view',
    'products.view', 'accounts.view', 'reports.view',
    'payouts.view', 'stock_movements.view',
  ]),
};

export const roleHasPermission = (role: Role, key: string): boolean =>
  rolePermissionMap[role]?.has(key) ?? false;
