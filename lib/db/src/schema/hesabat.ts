import {
  pgTable, pgEnum, uuid, varchar, text, timestamp, integer, numeric,
  boolean, jsonb, primaryKey, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ---------- Enums ---------- */
export const roleEnum = pgEnum('app_role', [
  'super_admin', 'company_admin', 'accountant', 'sales', 'viewer',
]);
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled',
]);
export const accountTypeEnum = pgEnum('account_type', ['cash', 'bank', 'wallet']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active', 'trialing', 'past_due', 'cancelled', 'expired',
]);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending','accepted','revoked','expired',
]);

/* ---------- Core tables ---------- */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  onboardingDone: boolean('onboarding_done').notNull().default(false),
  disabled: boolean('disabled').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  taxNumber: varchar('tax_number', { length: 50 }),
  commercialRegister: varchar('commercial_register', { length: 50 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 30 }),
  address: text('address'),
  logoUrl: text('logo_url'),
  stampUrl: text('stamp_url'),
  invoicePrefix: varchar('invoice_prefix', { length: 20 }).notNull().default('INV'),
  invoiceSequence: integer('invoice_sequence').notNull().default(0),
  invoiceYearFormat: varchar('invoice_year_format', { length: 10 }).notNull().default('full'),
  invoicePadding: integer('invoice_padding').notNull().default(4),
  invoiceSeparator: varchar('invoice_separator', { length: 5 }).notNull().default('-'),
  invoiceSequenceStart: integer('invoice_sequence_start').notNull().default(1),
  invoiceTemplate: varchar('invoice_template', { length: 20 }).notNull().default('modern'),
  invoiceAccentColor: varchar('invoice_accent_color', { length: 20 }).notNull().default('#4F46E5'),
  invoiceTerms: text('invoice_terms'),
  invoiceFooter: text('invoice_footer'),
  invoiceCurrencySymbol: varchar('invoice_currency_symbol', { length: 20 }),
  ownerName: varchar('owner_name', { length: 200 }),
  currency: varchar('currency', { length: 10 }).notNull().default('SAR'),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull().default('15.00'),
  smtpSettings: jsonb('smtp_settings'),
  isActive: boolean('is_active').notNull().default(true),
  reviewStatus: varchar('review_status', { length: 20 }).notNull().default('approved'),
  reviewNotes: text('review_notes'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userCompanies = pgTable('user_companies', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.companyId] }),
}));

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq: uniqueIndex('user_roles_uq').on(t.userId, t.companyId, t.role),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  familyId: uuid('family_id'),
  replacedBy: uuid('replaced_by'),
  userAgent: text('user_agent'),
  ip: text('ip'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailChangeRequests = pgTable('email_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  newEmail: varchar('new_email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index('email_change_requests_user_idx').on(t.userId),
}));

/* ---------- Plans / Subscriptions (system-wide) ---------- */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  priceMonthly: numeric('price_monthly', { precision: 10, scale: 2 }).notNull().default('0'),
  priceYearly: numeric('price_yearly', { precision: 10, scale: 2 }).notNull().default('0'),
  maxUsers: integer('max_users').notNull().default(1),
  maxInvoicesMonthly: integer('max_invoices_monthly').notNull().default(50),
  features: jsonb('features').notNull().default(sql`'{}'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCompany: index('subscriptions_company_idx').on(t.companyId),
}));

export const featureAccess = pgTable('feature_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  featureKey: varchar('feature_key', { length: 100 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (t) => ({
  uq: uniqueIndex('feature_access_uq').on(t.planId, t.featureKey),
}));

/* ---------- Tenant-scoped tables ---------- */
const tenantColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const suppliers = pgTable('suppliers', {
  ...tenantColumns,
  name:      varchar('name', { length: 200 }).notNull(),
  phone:     varchar('phone', { length: 30 }),
  email:     varchar('email', { length: 255 }),
  address:   text('address'),
  taxNumber: varchar('tax_number', { length: 50 }),
  notes:     text('notes'),
  isActive:  boolean('is_active').notNull().default(true),
}, (t) => ({
  byCompany: index('suppliers_company_idx').on(t.companyId),
}));

export const clients = pgTable('clients', {
  ...tenantColumns,
  name: varchar('name', { length: 200 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 30 }),
  taxNumber: varchar('tax_number', { length: 50 }),
  address: text('address'),
  notes: text('notes'),
}, (t) => ({
  byCompany: index('clients_company_idx').on(t.companyId),
}));

export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCompany: index('product_categories_company_idx').on(t.companyId),
}));

export const products = pgTable('products', {
  ...tenantColumns,
  sku: varchar('sku', { length: 50 }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
  cost: numeric('cost', { precision: 12, scale: 2 }).notNull().default('0'),
  quantity: integer('quantity').notNull().default(0),
  alertLevel: integer('alert_level').notNull().default(0),
  unit: varchar('unit', { length: 20 }).notNull().default('قطعة'),
  isActive: boolean('is_active').notNull().default(true),
  categoryId:  uuid('category_id').references(() => productCategories.id, { onDelete: 'set null' }),
  supplierId:  uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
}, (t) => ({
  byCompany:  index('products_company_idx').on(t.companyId),
  bySupplier: index('products_supplier_idx').on(t.companyId, t.supplierId),
}));

export const accounts = pgTable('accounts', {
  ...tenantColumns,
  name: varchar('name', { length: 120 }).notNull(),
  type: accountTypeEnum('type').notNull().default('cash'),
  bankName: varchar('bank_name', { length: 120 }),
  iban: varchar('iban', { length: 50 }),
  balance: numeric('balance', { precision: 14, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({
  byCompany: index('accounts_company_idx').on(t.companyId),
}));

export const invoices = pgTable('invoices', {
  ...tenantColumns,
  number: varchar('number', { length: 50 }).notNull(),
  publicId: uuid('public_id').notNull().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp('due_date', { withTimezone: true }),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  vatAmount: numeric('vat_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  paid: numeric('paid', { precision: 14, scale: 2 }).notNull().default('0'),
  remaining: numeric('remaining', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
}, (t) => ({
  byCompany: index('invoices_company_idx').on(t.companyId),
  byPublic: uniqueIndex('invoices_public_idx').on(t.publicId),
  byNumber: uniqueIndex('invoices_number_uq').on(t.companyId, t.number),
}));

export const invoiceItems = pgTable('invoice_items', {
  ...tenantColumns,
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  description: varchar('description', { length: 300 }).notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull().default('15.00'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
}, (t) => ({
  byInvoice: index('invoice_items_invoice_idx').on(t.invoiceId),
}));

export const payments = pgTable('payments', {
  ...tenantColumns,
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  method: varchar('method', { length: 30 }).notNull().default('cash'),
  reference: varchar('reference', { length: 100 }),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
}, (t) => ({
  byInvoice: index('payments_invoice_idx').on(t.invoiceId),
  byCompany: index('payments_company_idx').on(t.companyId),
}));

export const expenseCategories = pgTable('expense_categories', {
  id:        uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name:      varchar('name', { length: 200 }).notNull(),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCompany: index('expense_categories_company_idx').on(t.companyId),
}));

export const payouts = pgTable('payouts', {
  ...tenantColumns,
  supplierId:        uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  expenseCategoryId: uuid('expense_category_id').references(() => expenseCategories.id, { onDelete: 'set null' }),
  accountId:         uuid('account_id').notNull().references(() => accounts.id),
  amount:            numeric('amount', { precision: 14, scale: 2 }).notNull(),
  method:            varchar('method', { length: 30 }).notNull().default('cash'),
  paidAt:            timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  reference:         varchar('reference', { length: 100 }),
  notes:             text('notes'),
  createdBy:         uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  byCompany:  index('payouts_company_idx').on(t.companyId),
  bySupplier: index('payouts_supplier_idx').on(t.companyId, t.supplierId),
  byAccount:  index('payouts_account_idx').on(t.accountId),
}));

export const stockMovements = pgTable('stock_movements', {
  id:         uuid('id').primaryKey().defaultRandom(),
  companyId:  uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  productId:  uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  invoiceId:  uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  type:       varchar('type', { length: 20 }).notNull(),
  quantity:   numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  reason:     varchar('reason', { length: 200 }),
  createdBy:  uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCompany: index('stock_movements_company_idx').on(t.companyId),
  byProduct: index('stock_movements_product_idx').on(t.companyId, t.productId),
  byInvoice: index('stock_movements_invoice_idx').on(t.invoiceId),
}));

export const notifications = pgTable('notifications', {
  ...tenantColumns,
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  kind: varchar('kind', { length: 30 }).notNull().default('info'),
  readAt: timestamp('read_at', { withTimezone: true }),
}, (t) => ({
  byCompany: index('notifications_company_idx').on(t.companyId),
}));

export const systemNotifications = pgTable('system_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  audience: varchar('audience', { length: 30 }).notNull().default('all'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entity: varchar('entity', { length: 50 }).notNull(),
  entityId: uuid('entity_id'),
  data: jsonb('data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  role: roleEnum('role').notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: invitationStatusEnum('status').notNull().default('pending'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedUserId: uuid('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  byCompany: index('invitations_company_idx').on(t.companyId, t.invitedAt),
}));

/* ---------- File uploads ---------- */
export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull().default(0),
  url: text('url').notNull().default(''),
  kind: varchar('kind', { length: 30 }).notNull().default('attachment'),
  isPublic: boolean('is_public').notNull().default(false),
  diskName: varchar('disk_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCompany: index('uploads_company_idx').on(t.companyId),
}));

/* ---------- Platform (super-admin billing) ---------- */
export const platformWallets = pgTable('platform_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('cash'),
  balance: numeric('balance', { precision: 14, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionPayments = pgTable('subscription_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id').notNull().references(() => platformWallets.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  method: varchar('method', { length: 30 }).notNull().default('cash'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  reference: varchar('reference', { length: 100 }),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bySubscription: index('sub_payments_subscription_idx').on(t.subscriptionId),
  byWallet: index('sub_payments_wallet_idx').on(t.walletId),
}));

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformCustomRoles = pgTable('platform_custom_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default(sql`'[]'::jsonb`),
  color: varchar('color', { length: 20 }),
  scope: varchar('scope', { length: 20 }).notNull().default('company'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
