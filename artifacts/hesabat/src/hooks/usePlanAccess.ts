import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { api, isApiConfigured } from '@/lib/api';
import { PLAN_FEATURES } from '@/lib/planFeatures';

export interface PlanAccess {
  features: string[];
  items: string[];
  popular: boolean;
}

type Store = Record<string, PlanAccess>;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let snapshot: Store = {};

const read = (): Store => snapshot;
const write = (s: Store) => { snapshot = s; emit(); };

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const usePlanAccessStore = () =>
  useSyncExternalStore(subscribe, read, () => snapshot);

export const useSetPlanAccess = () =>
  useCallback((planId: string, patch: Partial<PlanAccess>) => {
    const s = read();
    const prev: PlanAccess = s[planId] ?? { features: [], items: [], popular: false };
    write({ ...s, [planId]: { ...prev, ...patch } });
  }, []);

export const useRemovePlanAccess = () =>
  useCallback((planId: string) => {
    const s = { ...read() };
    if (planId in s) { delete s[planId]; write(s); }
  }, []);

export const usePlanAccess = (planId?: string): PlanAccess => {
  const store = usePlanAccessStore();
  return useMemo<PlanAccess>(() => {
    if (!planId) return { features: [], items: [], popular: false };
    return store[planId] ?? { features: [], items: [], popular: false };
  }, [store, planId]);
};

/** Feature keys enabled for the signed-in tenant. Fetched from the API; super admins get everything. */
export const useCurrentFeatureSet = (): Set<string> => {
  const { user } = useAuth();
  const allFeatureKeys = useMemo(() => PLAN_FEATURES.map((f) => f.key), []);

  const [features, setFeatures] = useState<Set<string>>(() =>
    !user || user.role === 'super_admin' ? new Set(allFeatureKeys) : new Set(),
  );

  useEffect(() => {
    if (!user) { setFeatures(new Set()); return; }
    if (user.role === 'super_admin') {
      setFeatures(new Set(allFeatureKeys));
      return;
    }
    if (!isApiConfigured()) {
      setFeatures(new Set(allFeatureKeys));
      return;
    }
    let cancelled = false;
    api.get<{ data: string[] }>('/api/subscriptions/features')
      .then((res) => {
        if (!cancelled) setFeatures(new Set(res?.data ?? []));
      })
      .catch(() => {
        // On failure keep existing set — don't promote to all-access
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.role, allFeatureKeys]);

  return features;
};

export const hasFeature = (set: Set<string>, key?: string) => !key || set.has(key);
