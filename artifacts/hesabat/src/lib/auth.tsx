import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import type { Role, User } from '@/types';
import { users, companies } from '@/data/mock';
import {
  isApiConfigured, getAccessToken, setAccessToken, setRefreshToken,
  setActiveCompanyId, api, setPendingApprovalCallback,
} from '@/lib/api';
import { setCompanyCurrencyCode } from '@/lib/currency';

interface AuthState {
  user: User | null;
  onboardingDone: boolean;
  pendingApproval: boolean;
  markOnboardingDone: () => Promise<void>;
  login: (email: string, password?: string) => boolean;
  logout: () => void;
  setRole: (role: Role) => void;
  companyName: string;
}

const AuthContext = createContext<AuthState | null>(null);
const KEY = 'hesabat.auth';

interface MeResponse {
  user: { id: string; email: string; name: string; is_super_admin: boolean; onboarding_done: boolean };
  companies: { id: string; name: string; is_default: boolean }[];
  roles: { role: Role; company_id: string | null }[];
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const cached = raw ? (JSON.parse(raw) as User) : null;
      if (cached && !cached.companyId && cached.role !== 'super_admin') {
        const match = users.find(u => u.email.toLowerCase() === cached.email.toLowerCase());
        if (match?.companyId) return { ...cached, companyId: match.companyId };
      }
      return cached;
    } catch { return null; }
  });
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [apiCompanyName, setApiCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  useEffect(() => {
    setPendingApprovalCallback(() => setPendingApproval(true));
    return () => { setPendingApprovalCallback(null); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isApiConfigured() || !getAccessToken()) return;
    (async () => {
      try {
        const me = await api.get<MeResponse>('/api/auth/me');
        if (cancelled) return;
        setPendingApproval(false);
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
        setOnboardingDone(!!me.user.onboarding_done);
        setApiCompanyName(defaultCompany?.name ?? null);

        if (defaultCompany?.id) {
          try {
            const co = await api.get<{ data: { currency?: string } }>('/api/companies/me');
            if (!cancelled && co?.data?.currency) {
              setCompanyCurrencyCode(co.data.currency);
            }
          } catch { /* ignore — currency stays at default */ }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { status?: number; message?: string };
        if (e?.status === 403 && e?.message?.toLowerCase().includes('pending review')) {
          setPendingApproval(true);
        } else {
          setAccessToken(null);
          setRefreshToken(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const markOnboardingDone = useCallback(async () => {
    setOnboardingDone(true);
    if (isApiConfigured()) {
      try {
        await api.post('/api/users/me/onboarding-done', {});
      } catch { /* best-effort */ }
    }
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    onboardingDone,
    pendingApproval,
    markOnboardingDone,
    login: (email: string, password?: string) => {
      if (isApiConfigured()) return false;
      if (import.meta.env.PROD) return false;
      if (!email || !password) return false;
      const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!found || found.role === 'super_admin') return false;
      setUser(found);
      return true;
    },
    logout: () => {
      setUser(null);
      setOnboardingDone(false);
      setPendingApproval(false);
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
    companyName: (() => {
      if (apiCompanyName) return apiCompanyName;
      if (!user) return '';
      if (user.role === 'super_admin') return 'منصة ون كليك';
      let companyId = user.companyId;
      if (!companyId) {
        const match = users.find(u => u.email.toLowerCase() === user.email.toLowerCase());
        companyId = match?.companyId;
      }
      const co = companyId ? companies.find(c => c.id === companyId) : null;
      return co?.name ?? 'شركتي';
    })(),
  }), [user, onboardingDone, pendingApproval, markOnboardingDone, apiCompanyName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
