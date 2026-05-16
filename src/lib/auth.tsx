import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Role, User } from '@/types';
import { users, companies } from '@/data/mock';
import {
  isApiConfigured, getAccessToken, setAccessToken, setRefreshToken,
  setActiveCompanyId, api,
} from '@/lib/api';

interface AuthState {
  user: User | null;
  login: (email: string, password?: string) => boolean;
  logout: () => void;
  setRole: (role: Role) => void;
  companyName: string;
}

const AuthContext = createContext<AuthState | null>(null);
const KEY = 'hesabat.auth';

interface MeResponse {
  user: { id: string; email: string; name: string; is_super_admin: boolean };
  companies: { id: string; name: string; is_default: boolean }[];
  roles: { role: Role; company_id: string | null }[];
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [apiCompanyName, setApiCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  // When API mode is on AND we have a token, hydrate from /api/auth/me
  useEffect(() => {
    let cancelled = false;
    if (!isApiConfigured() || !getAccessToken()) return;
    (async () => {
      try {
        const me = await api.get<MeResponse>('/api/auth/me');
        if (cancelled) return;
        const defaultCompany = me.companies.find((c) => c.is_default) ?? me.companies[0];
        if (defaultCompany) setActiveCompanyId(defaultCompany.id);
        const role: Role = me.user.is_super_admin
          ? 'super_admin'
          : (me.roles[0]?.role ?? 'company_admin');
        setUser({
          id: me.user.id,
          name: me.user.name,
          email: me.user.email,
          role,
          companyId: defaultCompany?.id,
        });
        setApiCompanyName(defaultCompany?.name ?? null);
      } catch {
        // token invalid — clear
        setAccessToken(null);
        setRefreshToken(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    login: (email: string) => {
      const found = users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? users[0];
      setUser(found);
      return true;
    },
    logout: () => {
      setUser(null);
      if (isApiConfigured()) {
        setAccessToken(null);
        setRefreshToken(null);
        setActiveCompanyId(null);
      }
    },
    setRole: (role: Role) => {
      const candidate = users.find(u => u.role === role) ?? (user ? { ...user, role } : null);
      if (candidate) setUser(candidate);
    },
    companyName: apiCompanyName ?? (user?.companyId
      ? (companies.find(c => c.id === user.companyId)?.name ?? '')
      : 'منصة حسابات'),
  }), [user, apiCompanyName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
