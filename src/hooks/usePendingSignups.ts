/**
 * Pending signups awaiting super-admin review.
 * Stored in localStorage so the mock flow survives reloads.
 */
import { useEffect, useState } from 'react';

export type SignupStatus = 'pending' | 'approved' | 'declined';

export interface PendingSignup {
  id: string;
  companyName: string;
  ownerName: string;
  email: string;
  phone?: string;
  requestedAt: string;
  status: SignupStatus;
  /** Plan id assigned on approval. */
  planId?: string;
  /** Billing cycle assigned on approval. */
  cycle?: 'monthly' | 'yearly' | 'trial';
  /** Trial length in days when cycle === 'trial'. */
  trialDays?: number;
  /** Reason supplied by admin on decline. */
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

const KEY = 'oneclick.pending-signups.v1';
const EVT = 'oneclick-pending-signups-change';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const seed: PendingSignup[] = [
  { id: 'ps-1', companyName: 'مؤسسة الفجر للتجارة', ownerName: 'عبدالرحمن المالكي', email: 'fajr@example.eg', phone: '+2551234567', requestedAt: daysAgo(0), status: 'pending' },
  { id: 'ps-2', companyName: 'شركة الديار العقارية', ownerName: 'ليلى الزهراني', email: 'diyar@example.eg', phone: '+2551234568', requestedAt: daysAgo(1), status: 'pending' },
  { id: 'ps-3', companyName: 'متجر الرفاهية', ownerName: 'سعد الغامدي', email: 'rifahia@example.eg', phone: '+2551234569', requestedAt: daysAgo(2), status: 'pending' },
  { id: 'ps-4', companyName: 'بيت الإبداع للتسويق', ownerName: 'نوف القرني', email: 'ebda3@example.eg', phone: '+2551234570', requestedAt: daysAgo(4), status: 'approved', planId: 'plan-pro', cycle: 'yearly', reviewedAt: daysAgo(3), reviewedBy: 'مالك المنصة' },
  { id: 'ps-5', companyName: 'تكنو سوفت', ownerName: 'مجهول', email: 'spam@example.eg', requestedAt: daysAgo(6), status: 'declined', reason: 'بيانات غير مكتملة / مشتبه به', reviewedAt: daysAgo(5), reviewedBy: 'مالك المنصة' },
];

const read = (): PendingSignup[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as PendingSignup[];
  } catch { return seed; }
};

const write = (rows: PendingSignup[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
};

/** Append a fresh signup request (used by the public Register form). */
export const submitSignupRequest = (input: { companyName: string; ownerName: string; email: string; phone?: string }) => {
  const rows = read();
  const fresh: PendingSignup = {
    id: `ps-${Date.now().toString(36)}`,
    ...input,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };
  write([fresh, ...rows]);
  return fresh;
};

/** Count of pending signups (cheap helper for sidebar badges). */
export const usePendingSignupsCount = () => {
  const { signups } = usePendingSignups();
  return signups.filter(s => s.status === 'pending').length;
};

export const usePendingSignups = () => {
  const [signups, setSignups] = useState<PendingSignup[]>(() => read());

  useEffect(() => {
    const sync = () => setSignups(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const approve = (id: string, payload: { planId: string; cycle: 'monthly' | 'yearly' | 'trial'; trialDays?: number; reviewedBy?: string }) => {
    write(signups.map(s => s.id === id ? {
      ...s, status: 'approved',
      planId: payload.planId, cycle: payload.cycle, trialDays: payload.trialDays,
      reviewedAt: new Date().toISOString(),
      reviewedBy: payload.reviewedBy ?? 'مالك المنصة',
      reason: undefined,
    } : s));
  };

  const decline = (id: string, payload: { reason: string; reviewedBy?: string }) => {
    write(signups.map(s => s.id === id ? {
      ...s, status: 'declined',
      reason: payload.reason,
      reviewedAt: new Date().toISOString(),
      reviewedBy: payload.reviewedBy ?? 'مالك المنصة',
    } : s));
  };

  const reset = (id: string) => {
    write(signups.map(s => s.id === id ? { ...s, status: 'pending', reason: undefined, planId: undefined, cycle: undefined, trialDays: undefined, reviewedAt: undefined, reviewedBy: undefined } : s));
  };

  const remove = (id: string) => write(signups.filter(s => s.id !== id));

  return { signups, approve, decline, reset, remove };
};
