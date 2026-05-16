/**
 * Per-user role assignments made by the super admin (overrides the user's
 * default role coming from mock data). Maps userId -> role identifier where the
 * identifier may be either a built-in Role or a custom-role id.
 */
import { useEffect, useState } from 'react';

const KEY = 'oneclick.user-role-overrides.v1';
const EVT = 'oneclick-user-role-overrides-change';

type Overrides = Record<string, string>;

const read = (): Overrides => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch { return {}; }
};

const write = (next: Overrides) => {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
};

export const useUserRoleOverrides = () => {
  const [overrides, setOverrides] = useState<Overrides>(() => read());

  useEffect(() => {
    const sync = () => setOverrides(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const set = (userId: string, role: string) => write({ ...overrides, [userId]: role });
  const clear = (userId: string) => {
    const next = { ...overrides };
    delete next[userId];
    write(next);
  };

  return { overrides, set, clear };
};
