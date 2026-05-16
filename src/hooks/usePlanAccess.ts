import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { companies, plans as mockPlans } from '@/data/mock';
import { DEFAULT_PLAN_FEATURES, PLAN_FEATURES } from '@/lib/planFeatures';

const KEY = 'oneclick.planAccess.v1';

export interface PlanAccess {
  /** Enabled feature keys (from PLAN_FEATURES catalog). */
  features: string[];
  /** Marketing bullet items shown on the public Plans page. */
  items: string[];
  /** Highlight as "most popular" on the marketing page. */
  popular: boolean;
}

type Store = Record<string, PlanAccess>;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let cachedRaw: string | null = null;
let cachedSnapshot: Store = {};

const read = (): Store => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    cachedSnapshot = raw ? (JSON.parse(raw) as Store) : {};
    return cachedSnapshot;
  } catch { return cachedSnapshot; }
};
const write = (s: Store) => {
  const raw = JSON.stringify(s);
  localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cachedSnapshot = s;
  emit();
};

const seed = (): Store => {
  const current = read();
  const s = { ...current };
  let mutated = false;
  for (const p of mockPlans) {
    if (s[p.id]) continue;
    s[p.id] = {
      features: DEFAULT_PLAN_FEATURES[p.id] ?? [],
      items: p.features ?? [],
      popular: !!p.popular,
    };
    mutated = true;
  }
  if (mutated) write(s);
  return s;
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cachedRaw = null; cb(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
};

let seeded = false;
export const usePlanAccessStore = () => {
  if (!seeded) { seeded = true; seed(); }
  return useSyncExternalStore(subscribe, read, () => cachedSnapshot);
};

export const useSetPlanAccess = () => {
  return useCallback((planId: string, patch: Partial<PlanAccess>) => {
    const s = read();
    const prev: PlanAccess = s[planId] ?? { features: [], items: [], popular: false };
    s[planId] = { ...prev, ...patch };
    write(s);
  }, []);
};

export const useRemovePlanAccess = () => {
  return useCallback((planId: string) => {
    const s = read();
    if (planId in s) { delete s[planId]; write(s); }
  }, []);
};

export const usePlanAccess = (planId?: string): PlanAccess => {
  const store = usePlanAccessStore();
  return useMemo<PlanAccess>(() => {
    if (!planId) return { features: [], items: [], popular: false };
    return store[planId] ?? {
      features: DEFAULT_PLAN_FEATURES[planId] ?? [],
      items: mockPlans.find(p => p.id === planId)?.features ?? [],
      popular: !!mockPlans.find(p => p.id === planId)?.popular,
    };
  }, [store, planId]);
};

/** Feature keys enabled for the signed-in tenant. Super admins get everything. */
export const useCurrentFeatureSet = (): Set<string> => {
  const { user } = useAuth();
  const store = usePlanAccessStore();
  return useMemo(() => {
    if (!user || user.role === 'super_admin') return new Set(PLAN_FEATURES.map(f => f.key));
    const planId = companies.find(c => c.id === user.companyId)?.planId;
    if (!planId) return new Set(PLAN_FEATURES.map(f => f.key));
    const access = store[planId];
    const keys = access?.features ?? DEFAULT_PLAN_FEATURES[planId] ?? PLAN_FEATURES.map(f => f.key);
    return new Set(keys);
  }, [user, store]);
};

export const hasFeature = (set: Set<string>, key?: string) => !key || set.has(key);
