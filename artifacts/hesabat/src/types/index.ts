export type UUID = string;

export type Role = 'company_admin' | 'accountant' | 'sales' | 'viewer' | 'super_admin';

export interface User {
  id: UUID;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  companyId?: UUID;
  avatar?: string;
  disabled?: boolean;
}

export interface Company {
  id: UUID;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  address?: string;
  taxNumber?: string;
  status: 'active' | 'suspended' | 'expired';
  planId: UUID;
  createdAt: string;
}

export interface Client {
  id: UUID;
  companyId: UUID;
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  currency?: string;
  currencySymbol?: string;
  createdAt: string;
}

export interface Product {
  id: UUID;
  companyId: UUID;
  name: string;
  code: string;
  price: number;
  quantity: number;
  alertLevel: number;
  imageUrl?: string;
  category?: string;
  status: 'active' | 'inactive';
}

export interface StockMovement {
  id: UUID;
  productId: UUID;
  type: 'in' | 'out';
  quantity: number;
  reason: string;
  date: string;
}

export interface InvoiceItem {
  id: UUID;
  productId?: UUID;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discount?: number;
}

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';

export interface Invoice {
  id: UUID;
  publicId: string;
  companyId: UUID;
  clientId: UUID;
  number: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
  notes?: string;
}

export type PaymentMethod = 'cash' | 'bank' | 'wallet';

export interface FinancialAccount {
  id: UUID;
  companyId: UUID;
  name: string;
  type: 'cash' | 'bank' | 'wallet';
  balance: number;
  status: 'active' | 'inactive';
}

export interface PaymentSplit {
  method: PaymentMethod;
  accountId: UUID;
  amount: number;
}

export interface Payment {
  id: UUID;
  companyId: UUID;
  invoiceId: UUID;
  date: string;
  amount: number;
  splits: PaymentSplit[];
  notes?: string;
}

export type NotificationCategory = 'invoice' | 'payment' | 'debt' | 'product' | 'stock' | 'system';

export interface Notification {
  id: UUID;
  companyId?: UUID;
  category: NotificationCategory;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export interface PlanLimits {
  users: number;
  invoices: number;
  products: number;
  reports: number;
  notifications: number;
}

export interface Plan {
  id: UUID;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  limits: PlanLimits;
  features: string[];
  popular?: boolean;
}

export interface Subscription {
  id: UUID;
  companyId: UUID;
  planId: UUID;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'suspended';
  paid: boolean;
  amount: number;
}
