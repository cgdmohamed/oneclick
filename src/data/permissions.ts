import type { Role } from '@/types';

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'manage';

export interface PermissionRow {
  /** stable key */
  key: string;
  /** module label (Arabic) */
  module: string;
  /** action label (Arabic) */
  action: string;
}

/** Modules × actions shown in the matrix (rows). */
export const permissionRows: PermissionRow[] = [
  { key: 'invoices.view',   module: 'الفواتير',     action: 'عرض' },
  { key: 'invoices.create', module: 'الفواتير',     action: 'إنشاء' },
  { key: 'invoices.edit',   module: 'الفواتير',     action: 'تعديل' },
  { key: 'invoices.delete', module: 'الفواتير',     action: 'حذف' },

  { key: 'payments.view',   module: 'المدفوعات',    action: 'عرض' },
  { key: 'payments.create', module: 'المدفوعات',    action: 'تسجيل دفعة' },
  { key: 'payments.delete', module: 'المدفوعات',    action: 'حذف' },

  { key: 'clients.view',    module: 'العملاء',      action: 'عرض' },
  { key: 'clients.manage',  module: 'العملاء',      action: 'إضافة/تعديل/حذف' },

  { key: 'products.view',   module: 'المنتجات',     action: 'عرض' },
  { key: 'products.manage', module: 'المنتجات',     action: 'إضافة/تعديل/حذف' },

  { key: 'accounts.view',   module: 'الحسابات المالية', action: 'عرض' },
  { key: 'accounts.manage', module: 'الحسابات المالية', action: 'إدارة' },

  { key: 'reports.view',    module: 'التقارير',     action: 'عرض' },
  { key: 'reports.export',  module: 'التقارير',     action: 'تصدير' },

  { key: 'users.manage',    module: 'المستخدمون',   action: 'إدارة الفريق' },
  { key: 'settings.manage', module: 'الإعدادات',    action: 'تعديل إعدادات الشركة' },
  { key: 'subscription.manage', module: 'الاشتراك', action: 'إدارة الاشتراك' },
];

/** Roles shown as columns of the matrix. */
export const matrixRoles: { role: Role; label: string }[] = [
  { role: 'company_admin', label: 'مدير الشركة' },
  { role: 'accountant',    label: 'محاسب' },
  { role: 'sales',         label: 'مبيعات' },
  { role: 'viewer',        label: 'مشاهدة فقط' },
];

/** Source of truth: which permission keys each role has. */
export const rolePermissionMap: Record<Role, Set<string>> = {
  super_admin: new Set(permissionRows.map((p) => p.key)),
  company_admin: new Set(permissionRows.map((p) => p.key)),
  accountant: new Set([
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.create', 'payments.delete',
    'clients.view', 'clients.manage',
    'products.view',
    'accounts.view', 'accounts.manage',
    'reports.view', 'reports.export',
  ]),
  sales: new Set([
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.create',
    'clients.view', 'clients.manage',
    'products.view',
    'reports.view',
  ]),
  viewer: new Set([
    'invoices.view', 'payments.view', 'clients.view',
    'products.view', 'accounts.view', 'reports.view',
  ]),
};

export const roleHasPermission = (role: Role, key: string): boolean =>
  rolePermissionMap[role]?.has(key) ?? false;
