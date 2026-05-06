import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Role, User } from '@/types';
import { users, companies } from '@/data/mock';

interface AuthState {
  user: User | null;
  login: (email: string) => boolean;
  logout: () => void;
  setRole: (role: Role) => void;
  companyName: string;
}

const AuthContext = createContext<AuthState | null>(null);
const KEY = 'hesabat.auth';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  const value = useMemo<AuthState>(() => ({
    user,
    login: (email: string) => {
      const found = users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? users[0];
      setUser(found);
      return true;
    },
    logout: () => setUser(null),
    setRole: (role: Role) => {
      const candidate = users.find(u => u.role === role) ?? (user ? { ...user, role } : null);
      if (candidate) setUser(candidate);
    },
    companyName: user?.companyId ? (companies.find(c => c.id === user.companyId)?.name ?? '') : 'منصة حسابات',
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
