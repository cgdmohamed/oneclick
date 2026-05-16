/**
 * Invitation client. When the backend API is configured (VITE_API_URL) we
 * call real endpoints; otherwise we fall back to a localStorage shim so the
 * demo mode keeps working with no server.
 *
 * Important: the API is async, the shim is sync. To keep callers simple,
 * everything is exposed as async — the shim just resolves immediately.
 */
import type { Role } from '@/types';
import { api, isApiConfigured } from '@/lib/api';

export interface Invitation {
  token: string;             // raw token (only known at creation / via link)
  id?: string;               // server id (API mode)
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  companyId: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  acceptedAt?: string;
  acceptedUserId?: string;
}

const KEY = 'hesabat.invitations';
const TTL_DAYS = 7;

const listeners = new Set<() => void>();
const notify = () => { listeners.forEach((l) => l()); };

export const subscribeInvitations = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export const buildInviteUrl = (token: string) =>
  `${window.location.origin}/accept-invite?token=${token}`;

/* ============================ localStorage shim ============================ */

const readLocal = (): Invitation[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Invitation[]) : [];
  } catch { return []; }
};
const writeLocal = (next: Invitation[]) => {
  localStorage.setItem(KEY, JSON.stringify(next));
  notify();
};
const withExpiry = (inv: Invitation): Invitation =>
  inv.status === 'pending' && new Date(inv.expiresAt).getTime() < Date.now()
    ? { ...inv, status: 'expired' }
    : inv;

const randomToken = () => {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

/* =============================== Public API =============================== */

export interface CreateInvitationInput {
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  companyId: string;
  invitedBy: string;
}

interface ApiInvitationRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  status: Invitation['status'];
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
}

const fromApiRow = (r: ApiInvitationRow, companyId: string): Invitation => ({
  token: r.id, // server doesn't expose raw token after creation; id is opaque
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  phone: r.phone ?? undefined,
  role: r.role,
  companyId,
  invitedBy: '',
  invitedAt: r.invited_at,
  expiresAt: r.expires_at,
  status: r.status,
  acceptedAt: r.accepted_at ?? undefined,
});

/** List invites for the current company. */
export const listInvitations = async (companyId: string): Promise<Invitation[]> => {
  if (isApiConfigured()) {
    const res = await api.get<{ data: ApiInvitationRow[] }>('/api/invitations');
    return res.data.map((r) => fromApiRow(r, companyId));
  }
  return readLocal()
    .filter((i) => i.companyId === companyId)
    .map(withExpiry)
    .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));
};

/** Create an invite. Returns the invitation plus the one-time shareable URL. */
export const createInvitation = async (
  input: CreateInvitationInput,
): Promise<{ invitation: Invitation; url: string }> => {
  if (isApiConfigured()) {
    const res = await api.post<{ data: ApiInvitationRow; invite_url: string }>(
      '/api/invitations',
      { email: input.email, fullName: input.fullName, phone: input.phone, role: input.role },
    );
    return { invitation: fromApiRow(res.data, input.companyId), url: res.invite_url };
  }
  const now = new Date();
  const inv: Invitation = {
    token: randomToken(),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || undefined,
    role: input.role,
    companyId: input.companyId,
    invitedBy: input.invitedBy,
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_DAYS * 86400_000).toISOString(),
    status: 'pending',
  };
  const next = readLocal().map((e) =>
    e.email === inv.email && e.companyId === inv.companyId && e.status === 'pending'
      ? { ...e, status: 'revoked' as const } : e,
  );
  next.push(inv);
  writeLocal(next);
  return { invitation: inv, url: buildInviteUrl(inv.token) };
};

export const revokeInvitation = async (idOrToken: string) => {
  if (isApiConfigured()) {
    await api.post(`/api/invitations/${idOrToken}/revoke`);
    notify();
    return;
  }
  writeLocal(readLocal().map((i) =>
    i.token === idOrToken && i.status === 'pending' ? { ...i, status: 'revoked' as const } : i,
  ));
};

export const resendInvitation = async (
  idOrToken: string,
  companyId: string,
): Promise<{ invitation: Invitation; url: string } | null> => {
  if (isApiConfigured()) {
    const res = await api.post<{ data: ApiInvitationRow; invite_url: string }>(
      `/api/invitations/${idOrToken}/resend`,
    );
    return { invitation: fromApiRow(res.data, companyId), url: res.invite_url };
  }
  const inv = readLocal().find((i) => i.token === idOrToken);
  if (!inv) return null;
  const refreshed: Invitation = {
    ...inv,
    status: 'pending',
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_DAYS * 86400_000).toISOString(),
  };
  writeLocal(readLocal().map((i) => (i.token === idOrToken ? refreshed : i)));
  return { invitation: refreshed, url: buildInviteUrl(refreshed.token) };
};

/** Look up an invite by its raw token (from the email link). */
export const findInvitationByToken = async (
  token: string,
): Promise<(Invitation & { companyName?: string }) | null> => {
  if (isApiConfigured()) {
    try {
      const res = await api.get<{ data: {
        email: string; full_name: string; phone: string | null; role: Role;
        status: Invitation['status']; expires_at: string; company_name: string;
      } }>(`/api/public/invitations/${encodeURIComponent(token)}`);
      const d = res.data;
      return {
        token,
        email: d.email,
        fullName: d.full_name,
        phone: d.phone ?? undefined,
        role: d.role,
        companyId: '',
        companyName: d.company_name,
        invitedBy: '',
        invitedAt: '',
        expiresAt: d.expires_at,
        status: d.status,
      };
    } catch { return null; }
  }
  const inv = readLocal().find((i) => i.token === token);
  return inv ? withExpiry(inv) : null;
};

/** Accept an invitation: sets the user's password and activates membership. */
export const acceptInvitation = async (
  token: string,
  payload: { fullName: string; phone?: string; password: string; userId?: string },
): Promise<{ email: string }> => {
  if (isApiConfigured()) {
    return api.post<{ ok: true; email: string }>(
      `/api/public/invitations/${encodeURIComponent(token)}/accept`,
      { full_name: payload.fullName, phone: payload.phone, password: payload.password },
    );
  }
  const inv = readLocal().find((i) => i.token === token);
  if (!inv) throw new Error('not found');
  writeLocal(readLocal().map((i) =>
    i.token === token
      ? { ...i, status: 'accepted' as const, acceptedAt: new Date().toISOString(),
          acceptedUserId: payload.userId ?? `u-${Date.now()}`,
          fullName: payload.fullName, phone: payload.phone ?? i.phone }
      : i,
  ));
  return { email: inv.email };
};
