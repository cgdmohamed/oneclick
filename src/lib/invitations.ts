/**
 * Mock invitation store backed by localStorage.
 * Simulates "subscriber invites a user → user clicks email link → sets
 * password & profile → account activated" without a real backend.
 */
import type { Role } from '@/types';

export interface Invitation {
  token: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  companyId: string;
  invitedBy: string;
  invitedAt: string; // ISO
  expiresAt: string; // ISO
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  acceptedAt?: string;
  acceptedUserId?: string;
}

const KEY = 'hesabat.invitations';
const TTL_DAYS = 7;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const read = (): Invitation[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Invitation[]) : [];
  } catch {
    return [];
  }
};

const write = (next: Invitation[]) => {
  localStorage.setItem(KEY, JSON.stringify(next));
  notify();
};

export const subscribeInvitations = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export const getInvitations = (): Invitation[] => read();

export const getInvitationsForCompany = (companyId: string) =>
  read()
    .filter((i) => i.companyId === companyId)
    .map((i) => withExpiryCheck(i))
    .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));

const withExpiryCheck = (inv: Invitation): Invitation => {
  if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() < Date.now()) {
    return { ...inv, status: 'expired' };
  }
  return inv;
};

export const findInvitationByToken = (token: string): Invitation | null => {
  const inv = read().find((i) => i.token === token);
  return inv ? withExpiryCheck(inv) : null;
};

const randomToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export interface CreateInvitationInput {
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  companyId: string;
  invitedBy: string;
}

export const createInvitation = (input: CreateInvitationInput): Invitation => {
  const now = new Date();
  const expires = new Date(now.getTime() + TTL_DAYS * 86400_000);
  const inv: Invitation = {
    token: randomToken(),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || undefined,
    role: input.role,
    companyId: input.companyId,
    invitedBy: input.invitedBy,
    invitedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    status: 'pending',
  };

  // Revoke any prior pending invites for same email+company to keep it clean.
  const next = read().map((existing) =>
    existing.email === inv.email &&
    existing.companyId === inv.companyId &&
    existing.status === 'pending'
      ? { ...existing, status: 'revoked' as const }
      : existing
  );
  next.push(inv);
  write(next);
  return inv;
};

export const revokeInvitation = (token: string) => {
  const next = read().map((i) =>
    i.token === token && i.status === 'pending' ? { ...i, status: 'revoked' as const } : i
  );
  write(next);
};

export const resendInvitation = (token: string): Invitation | null => {
  const inv = read().find((i) => i.token === token);
  if (!inv) return null;
  const expires = new Date(Date.now() + TTL_DAYS * 86400_000).toISOString();
  const refreshed: Invitation = { ...inv, status: 'pending', expiresAt: expires, invitedAt: new Date().toISOString() };
  const next = read().map((i) => (i.token === token ? refreshed : i));
  write(next);
  return refreshed;
};

export const acceptInvitation = (
  token: string,
  payload: { fullName: string; phone?: string; userId: string }
) => {
  const next = read().map((i) =>
    i.token === token
      ? {
          ...i,
          status: 'accepted' as const,
          acceptedAt: new Date().toISOString(),
          acceptedUserId: payload.userId,
          fullName: payload.fullName,
          phone: payload.phone ?? i.phone,
        }
      : i
  );
  write(next);
};

export const buildInviteUrl = (token: string) =>
  `${window.location.origin}/accept-invite?token=${token}`;
