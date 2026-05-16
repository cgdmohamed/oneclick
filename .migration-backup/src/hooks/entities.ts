/**
 * Shared resource configs for common entities so multiple pages can read
 * the same lists (clients, products, accounts, invoices) without
 * duplicating row adapters.
 */
import type { Client, Product, FinancialAccount, Invoice, InvoiceStatus, Notification, User, Role, NotificationCategory } from '@/types';
import {
  clients as mockClients, products as mockProducts, accounts as mockAccounts,
  invoices as mockInvoices, notifications as mockNotifications, users as mockUsers,
} from '@/data/mock';
import { useResource, type ResourceConfig } from '@/hooks/useResource';

/* ---------- Clients ---------- */
interface ClientRow {
  id: string; company_id: string; name: string;
  phone: string | null; email: string | null; address: string | null;
  tax_number: string | null; created_at: string;
}
export const clientsCfg: ResourceConfig<Client, ClientRow> = {
  path: '/api/clients',
  key: 'clients',
  initial: mockClients,
  fromRow: (r) => ({
    id: r.id, companyId: r.company_id, name: r.name,
    phone: r.phone ?? '', email: r.email ?? '', address: r.address ?? '',
    taxNumber: r.tax_number ?? '', createdAt: r.created_at,
  }),
  toRow: (c) => ({
    name: c.name, phone: c.phone || null, email: c.email || null,
    address: c.address || null, tax_number: c.taxNumber || null,
  }),
};
export const useClients = () => useResource(clientsCfg);

/* ---------- Products ---------- */
interface ProductRow {
  id: string; company_id: string; sku: string | null; name: string;
  price: string | number; cost: string | number; quantity: number;
  alert_level: number; is_active: boolean;
}
export const productsCfg: ResourceConfig<Product, ProductRow> = {
  path: '/api/products',
  key: 'products',
  initial: mockProducts,
  fromRow: (r) => ({
    id: r.id, companyId: r.company_id, name: r.name, code: r.sku ?? '',
    price: Number(r.price), quantity: r.quantity, alertLevel: r.alert_level,
    status: r.is_active ? 'active' : 'inactive',
  }),
  toRow: (p) => ({
    name: p.name, sku: p.code || null, price: p.price, quantity: p.quantity,
    alert_level: p.alertLevel, is_active: p.status !== 'inactive',
  }),
};
export const useProducts = () => useResource(productsCfg);

/* ---------- Accounts ---------- */
interface AccountRow {
  id: string; company_id: string; name: string;
  type: 'cash' | 'bank' | 'wallet';
  balance: string | number; is_active: boolean;
}
export const accountsCfg: ResourceConfig<FinancialAccount, AccountRow> = {
  path: '/api/accounts',
  key: 'accounts',
  initial: mockAccounts,
  fromRow: (r) => ({
    id: r.id, companyId: r.company_id, name: r.name, type: r.type,
    balance: Number(r.balance), status: r.is_active ? 'active' : 'inactive',
  }),
  toRow: (a) => ({
    name: a.name, type: a.type, balance: a.balance,
    is_active: a.status !== 'inactive',
  }),
};
export const useAccounts = () => useResource(accountsCfg);

/* ---------- Invoices ---------- */
interface InvoiceRow {
  id: string; company_id: string; client_id: string; number: string;
  issue_date: string; due_date: string | null;
  subtotal: string | number; vat_amount: string | number;
  discount: string | number; total: string | number;
  paid: string | number; remaining: string | number;
  status: string; notes: string | null;
  client_name?: string;
}
const mapStatus = (s: string): InvoiceStatus => {
  if (s === 'paid' || s === 'partial' || s === 'overdue') return s;
  return 'unpaid';
};
export const invoicesCfg: ResourceConfig<Invoice & { clientName?: string }, InvoiceRow> = {
  path: '/api/invoices',
  key: 'invoices',
  initial: mockInvoices,
  fromRow: (r) => ({
    id: r.id, publicId: r.id, companyId: r.company_id, clientId: r.client_id,
    number: r.number,
    issueDate: r.issue_date,
    dueDate: r.due_date ?? r.issue_date,
    items: [],
    subtotal: Number(r.subtotal), tax: Number(r.vat_amount),
    discount: Number(r.discount), total: Number(r.total),
    paid: Number(r.paid), remaining: Number(r.remaining),
    status: mapStatus(r.status),
    notes: r.notes ?? undefined,
    clientName: r.client_name,
  }),
  toRow: () => ({}), // create handled separately (POST /api/invoices)
};
export const useInvoices = () => useResource(invoicesCfg);

/* ---------- Notifications ---------- */
interface NotificationRow {
  id: string; company_id: string; user_id: string | null;
  title: string; body: string | null;
  kind: 'info' | 'warning' | 'success' | 'error';
  created_at: string; read_at: string | null;
}
const kindToCategory = (k: string): NotificationCategory => {
  if (k === 'warning') return 'stock';
  if (k === 'success') return 'payment';
  if (k === 'error') return 'debt';
  return 'system';
};
export const notificationsCfg: ResourceConfig<Notification, NotificationRow> = {
  path: '/api/notifications',
  key: 'notifications',
  initial: mockNotifications,
  fromRow: (r) => ({
    id: r.id, companyId: r.company_id, category: kindToCategory(r.kind),
    title: r.title, body: r.body ?? '',
    date: r.created_at, read: !!r.read_at,
  }),
  toRow: (n) => ({ title: n.title, body: n.body ?? null, kind: 'info' }),
};
export const useNotifications = () => useResource(notificationsCfg);

/* ---------- Users (company team) ---------- */
interface UserRow {
  id: string; email: string; name: string;
  created_at: string; roles: (Role | null)[] | null;
}
export const usersCfg: ResourceConfig<User, UserRow> = {
  path: '/api/users',
  key: 'users',
  initial: mockUsers.filter((u) => u.role !== 'super_admin'),
  fromRow: (r) => ({
    id: r.id, name: r.name, email: r.email,
    role: ((r.roles ?? []).filter(Boolean)[0] as Role) ?? 'viewer',
  }),
  toRow: (u) => ({
    name: u.name, email: u.email, role: u.role,
    // password is added on the page (only for create)
  }),
};
export const useUsers = () => useResource(usersCfg);
