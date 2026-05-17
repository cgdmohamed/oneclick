/**
 * Pending signups awaiting super-admin review.
 * Fetches from the real backend: GET /api/platform/signups
 *
 * After any mutation (approve/decline/reset/remove) a 'pending-signups-changed'
 * DOM event is dispatched so usePendingSignupsCount (sidebar badge) stays fresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { isApiConfigured } from '@/lib/api';

const CHANGE_EVENT = 'pending-signups-changed';
const notifyChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));

export type SignupStatus = 'pending' | 'approved' | 'declined';

export interface PendingSignup {
  id: string;
  name: string;
  companyName: string;
  ownerName: string;
  email: string;
  phone?: string;
  requestedAt: string;
  status: SignupStatus;
  planId?: string;
  planName?: string;
  cycle?: 'monthly' | 'yearly' | 'trial';
  trialDays?: number;
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface ApiSignup {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  review_status: SignupStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  created_at: string;
  owner_name: string | null;
  plan_name: string | null;
  plan_id: string | null;
  sub_status: string | null;
}

function mapSignup(s: ApiSignup): PendingSignup {
  return {
    id: s.id,
    name: s.name,
    companyName: s.name,
    ownerName: s.owner_name ?? '',
    email: s.email,
    phone: s.phone ?? undefined,
    requestedAt: s.created_at,
    status: s.review_status,
    planId: s.plan_id ?? undefined,
    planName: s.plan_name ?? undefined,
    reason: s.review_notes ?? undefined,
    reviewedAt: s.reviewed_at ?? undefined,
    reviewedBy: s.reviewed_by_name ?? s.reviewed_by ?? undefined,
  };
}

interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  page?: number;
}

export const usePendingSignupsCount = () => {
  const [count, setCount] = useState(0);

  const fetch = useCallback(() => {
    if (!isApiConfigured()) return;
    api.get<PaginatedResponse<ApiSignup>>('/api/platform/signups?status=pending&page_size=1')
      .then(r => setCount(r.total ?? r.data.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch();

    const interval = setInterval(fetch, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetch();
    };

    window.addEventListener(CHANGE_EVENT, fetch);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener(CHANGE_EVENT, fetch);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetch]);

  return count;
};

export const usePendingSignups = () => {
  const [signups, setSignups] = useState<PendingSignup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isApiConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedResponse<ApiSignup>>('/api/platform/signups?page_size=200');
      setSignups(res.data.map(mapSignup));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (
    id: string,
    payload: { planId: string; cycle: 'monthly' | 'yearly' | 'trial'; trialDays?: number },
  ) => {
    const res = await api.patch<{ data: ApiSignup }>(`/api/platform/signups/${id}/approve`, {
      plan_id: payload.planId,
      cycle: payload.cycle,
      trial_days: payload.trialDays ?? 14,
    });
    setSignups(prev => prev.map(s => s.id === id ? mapSignup(res.data) : s));
    notifyChange();
  };

  const decline = async (id: string, payload: { reason: string }) => {
    const res = await api.patch<{ data: ApiSignup }>(`/api/platform/signups/${id}/decline`, {
      reason: payload.reason,
    });
    setSignups(prev => prev.map(s => s.id === id ? mapSignup(res.data) : s));
    notifyChange();
  };

  const reset = async (id: string) => {
    const res = await api.patch<{ data: ApiSignup }>(`/api/platform/signups/${id}/reset`, {});
    setSignups(prev => prev.map(s => s.id === id ? mapSignup(res.data) : s));
    notifyChange();
  };

  const remove = async (id: string) => {
    await api.delete(`/api/platform/signups/${id}`);
    setSignups(prev => prev.filter(s => s.id !== id));
    notifyChange();
  };

  return { signups, loading, error, approve, decline, reset, remove, reload: load };
};
