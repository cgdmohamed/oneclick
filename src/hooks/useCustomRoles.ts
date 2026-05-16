/**
 * Custom platform roles created via the role generator.
 * Stored in localStorage so they persist across reloads in the mock environment.
 */
import { useEffect, useState } from 'react';

export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  color?: string;
  scope: 'company' | 'platform';
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

const KEY = 'oneclick.custom-roles.v1';
const EVT = 'oneclick-custom-roles-change';

const seed: CustomRole[] = [
  {
    id: 'r-cashier',
    name: 'كاشير',
    description: 'دور مخصص للكاشير: إصدار فواتير وتسجيل دفعات فقط.',
    permissions: ['invoices.view', 'invoices.create', 'payments.view', 'payments.create', 'clients.view', 'products.view'],
    color: '#3b82f6',
    scope: 'company',
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    enabled: true,
  },
  {
    id: 'r-auditor',
    name: 'مراجع مالي',
    description: 'اطّلاع كامل على التقارير والفواتير دون أي تعديل.',
    permissions: ['invoices.view', 'payments.view', 'clients.view', 'products.view', 'accounts.view', 'reports.view', 'reports.export'],
    color: '#0ea5e9',
    scope: 'company',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    enabled: true,
  },
];

const read = (): CustomRole[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomRole[]) : seed;
  } catch { return seed; }
};

const write = (rows: CustomRole[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
};

export const useCustomRoles = () => {
  const [roles, setRoles] = useState<CustomRole[]>(() => read());

  useEffect(() => {
    const sync = () => setRoles(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const upsert = (role: CustomRole) => {
    const next = roles.some(r => r.id === role.id)
      ? roles.map(r => (r.id === role.id ? { ...role, updatedAt: new Date().toISOString() } : r))
      : [{ ...role, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...roles];
    write(next);
  };

  const remove = (id: string) => write(roles.filter(r => r.id !== id));
  const toggle = (id: string) => write(roles.map(r => r.id === id ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() } : r));

  return { roles, upsert, remove, toggle };
};
