/**
 * Lightweight typed API client for the Hesabat backend.
 * Set VITE_API_URL in `.env` (e.g. http://localhost:4000).
 *
 * Usage:
 *   import { api, setAccessToken } from '@/lib/api';
 *   const { data } = await api.get<{ data: Client[] }>('/api/clients');
 */

const TOKEN_KEY = 'hesabat.access_token';
const REFRESH_KEY = 'hesabat.refresh_token'; // legacy — cleared on load
const COMPANY_KEY = 'hesabat.company_id';

// When VITE_API_URL is the sentinel "same-origin" we use empty string so all
// fetch paths are relative (handled by the Vite dev proxy → /api/* → backend).
const _rawApiUrl: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';

export const API_URL: string = _rawApiUrl === 'same-origin' ? '' : _rawApiUrl;

// API is considered "configured" when VITE_API_URL is set to any non-empty value
// (including the sentinel "same-origin") OR when we're running in production.
export const isApiConfigured = () =>
  Boolean(_rawApiUrl) || import.meta.env.PROD;

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const setAccessToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

/**
 * SEC-01/02: refresh tokens now live in an httpOnly cookie set by the backend.
 * These helpers are kept for backward compatibility but always no-op / null.
 * Any legacy value still in localStorage is purged on load.
 */
try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
export const getRefreshToken = (): string | null => null;
export const setRefreshToken = (_t: string | null): void => { /* cookie-managed */ };


export const getActiveCompanyId = () => localStorage.getItem(COMPANY_KEY);
export const setActiveCompanyId = (id: string | null) =>
  id ? localStorage.setItem(COMPANY_KEY, id) : localStorage.removeItem(COMPANY_KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

/**
 * Global hook: called whenever any API response returns 403 with a
 * "pending review" message from the tenant middleware. AuthProvider
 * subscribes to this to show the PendingApproval screen without
 * needing each page/hook to handle it individually.
 */
let _pendingApprovalCb: (() => void) | null = null;
export const setPendingApprovalCallback = (cb: (() => void) | null) => {
  _pendingApprovalCb = cb;
};

/** True when the backend tenant middleware rejected with the canonical pending-review message. */
function isPendingReview(status: number, message: string): boolean {
  return status === 403 && message.toLowerCase().includes('pending review');
}

/** SEC-03: read the non-httpOnly CSRF cookie set by the backend. */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)hesabat_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  // API_URL is empty string in same-origin mode (proxy handles routing) — that's fine.
  // Only throw when neither same-origin nor an absolute URL is configured.
  if (!_rawApiUrl) throw new ApiError(0, 'API_URL not configured (set VITE_API_URL)');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = getActiveCompanyId();
  if (company) headers['x-company-id'] = company;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return request<T>(method, path, body, false);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (payload as { message?: string })?.message ?? `HTTP ${res.status}`;
    if (isPendingReview(res.status, msg)) _pendingApprovalCb?.();
    throw new ApiError(res.status, msg, payload);
  }
  return payload as T;
}

/**
 * Singleton in-flight refresh promise.
 * If a refresh is already in progress, all concurrent callers *in this tab*
 * share the same Promise instead of firing independent requests. This alone
 * does not protect against a second browser TAB doing the same thing at the
 * same time — see the cross-tab lock below.
 */
let _refreshInFlight: Promise<boolean> | null = null;

const REFRESH_LOCK_NAME = 'hesabat-refresh-token';

async function tryRefresh(): Promise<boolean> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = _lockedRefresh().finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

/**
 * The refresh token lives in one httpOnly cookie shared by every tab of this
 * browser. The backend rotates it on each /refresh call and treats a second
 * request bearing the now-superseded token as theft (reuse detection) —
 * nuking the whole session. Two tabs whose access tokens expire around the
 * same time would otherwise both fire /refresh with the same (soon-to-be-
 * stale) cookie value and one of them would trip that check, logging the
 * user out of both tabs for perfectly normal multi-tab use.
 *
 * The Web Locks API (supported in all current browsers) gives us a mutex
 * that is shared across tabs of the same origin, so only one tab's refresh
 * actually hits the network at a time; everyone else waits for it. Browsers
 * without navigator.locks fall back to the old per-tab-only behavior (no
 * worse than before this fix).
 */
async function _lockedRefresh(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return _doRefresh();
  }
  const tokenBeforeWait = getAccessToken();
  return navigator.locks.request(REFRESH_LOCK_NAME, async () => {
    // Another tab may have already refreshed (and updated the shared
    // localStorage access token) while we were waiting for the lock — skip
    // our own network round-trip, and more importantly skip sending the
    // refresh cookie a second time with a token the other tab just rotated.
    const tokenNow = getAccessToken();
    if (tokenNow && tokenNow !== tokenBeforeWait) return true;
    return _doRefresh();
  });
}

async function _doRefresh(): Promise<boolean> {
  // Refresh token is in an httpOnly cookie — sent automatically with credentials.
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const csrf = getCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { access_token?: string };
    if (json.access_token) { setAccessToken(json.access_token); return true; }
    return false;
  } catch { return false; }
}

/** Build auth headers for raw fetch calls (export downloads, etc.) */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = getActiveCompanyId();
  if (company) headers['x-company-id'] = company;
  return headers;
}

export const api = {
  get:    <T>(path: string) => request<T>('GET', path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch:  <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    // Same logic as request(): _rawApiUrl is the sentinel; API_URL may be '' in same-origin mode.
    if (!_rawApiUrl) throw new ApiError(0, 'API_URL not configured');
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const company = getActiveCompanyId();
    if (company) headers['x-company-id'] = company;
    const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form, credentials: 'include' });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = (payload as { message?: string })?.message ?? `HTTP ${res.status}`;
      if (isPendingReview(res.status, msg)) _pendingApprovalCb?.();
      throw new ApiError(res.status, msg, payload);
    }
    return payload as T;
  },
};

/** Prefix relative backend URLs (e.g. /uploads/abc.png) with the API origin. */
export const resolveAssetUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (!API_URL) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

/* ---------- Auth helpers ---------- */
export interface LoginResponse {
  access_token: string;
  user: { id: string; email: string; name: string; isSuperAdmin?: boolean };
  company: { id: string; name: string } | null;
  roles: { role: string; company_id: string | null }[];
}

/** Returned by /login (and /google) instead of LoginResponse when the account has 2FA enabled. */
export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
}

function isMfaChallenge(res: LoginResponse | MfaChallengeResponse): res is MfaChallengeResponse {
  return (res as MfaChallengeResponse).mfaRequired === true;
}

function applySession(res: LoginResponse) {
  setAccessToken(res.access_token);
  if (res.company?.id) setActiveCompanyId(res.company.id);
}

export async function loginRequest(email: string, password: string) {
  const res = await api.post<LoginResponse | MfaChallengeResponse>('/api/auth/login', { email, password });
  if (isMfaChallenge(res)) return res;
  applySession(res);
  return res;
}

/** Second step of login when loginRequest/googleLoginRequest returned an MFA challenge. */
export async function verify2faRequest(mfaToken: string, code: string) {
  const res = await api.post<LoginResponse>('/api/auth/2fa/verify', { mfaToken, code });
  applySession(res);
  return res;
}

/** Returned by /google when the Google account has no matching local user yet. */
export interface GoogleNeedsCompanyResponse {
  needsCompanyName: true;
  googleSignupToken: string;
}

function isNeedsCompany(res: LoginResponse | MfaChallengeResponse | GoogleNeedsCompanyResponse): res is GoogleNeedsCompanyResponse {
  return (res as GoogleNeedsCompanyResponse).needsCompanyName === true;
}

export async function googleLoginRequest(idToken: string) {
  const res = await api.post<LoginResponse | MfaChallengeResponse | GoogleNeedsCompanyResponse>('/api/auth/google', { idToken });
  if (isNeedsCompany(res) || isMfaChallenge(res)) return res;
  applySession(res);
  return res;
}

export async function googleCompleteRequest(googleSignupToken: string, companyName: string) {
  return api.post<{ ok: boolean; pendingReview?: boolean }>('/api/auth/google/complete', { googleSignupToken, companyName });
}

/* ---------- Impersonation (super admin "view as user") ---------- */

const IMPERSONATION_ADMIN_TOKEN_KEY = 'hesabat.impersonation.admin_token';
const IMPERSONATION_ADMIN_COMPANY_KEY = 'hesabat.impersonation.admin_company';
const IMPERSONATION_TARGET_NAME_KEY = 'hesabat.impersonation.target_name';

export const isImpersonating = () => sessionStorage.getItem(IMPERSONATION_ADMIN_TOKEN_KEY) !== null;
export const getImpersonatedName = () => sessionStorage.getItem(IMPERSONATION_TARGET_NAME_KEY);

/**
 * AuthProvider caches the hydrated user object (including role) under this
 * key and reads it synchronously on mount, before the fresh /api/auth/me
 * call resolves. If we swap the access token without also clearing this, the
 * next page loads briefly (or, if a role-based redirect fires first,
 * permanently) with the PREVIOUS session's cached role — e.g. exiting
 * impersonation would flash/stick on the impersonated user's role until
 * something else happened to re-trigger the admin check. Must be cleared on
 * every token swap outside the normal login flow.
 */
const AUTH_CACHE_KEY = 'hesabat.auth';

/** Starts viewing the app as another user. Full page reload lands the admin in /app as that user. */
export async function startImpersonation(targetUserId: string, targetName: string) {
  const res = await api.post<{ access_token: string; user: { id: string; isSuperAdmin: boolean }; company: { id: string } | null }>(
    `/api/platform/users/${targetUserId}/impersonate`,
  );
  const adminToken = getAccessToken();
  const adminCompany = getActiveCompanyId();
  if (adminToken) sessionStorage.setItem(IMPERSONATION_ADMIN_TOKEN_KEY, adminToken);
  if (adminCompany) sessionStorage.setItem(IMPERSONATION_ADMIN_COMPANY_KEY, adminCompany);
  sessionStorage.setItem(IMPERSONATION_TARGET_NAME_KEY, targetName);
  localStorage.removeItem(AUTH_CACHE_KEY);
  setAccessToken(res.access_token);
  if (res.company?.id) setActiveCompanyId(res.company.id);
  window.location.href = '/app';
}

/** Restores the admin's own session and sends them back to the admin panel. */
export function exitImpersonation() {
  const adminToken = sessionStorage.getItem(IMPERSONATION_ADMIN_TOKEN_KEY);
  const adminCompany = sessionStorage.getItem(IMPERSONATION_ADMIN_COMPANY_KEY);
  sessionStorage.removeItem(IMPERSONATION_ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(IMPERSONATION_ADMIN_COMPANY_KEY);
  sessionStorage.removeItem(IMPERSONATION_TARGET_NAME_KEY);
  localStorage.removeItem(AUTH_CACHE_KEY);
  setAccessToken(adminToken);
  setActiveCompanyId(adminCompany);
  window.location.href = '/admin';
}

export async function logoutRequest() {
  try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
  setAccessToken(null);
  setActiveCompanyId(null);
}

export async function registerRequest(input: { email: string; password: string; name: string; companyName: string; phone?: string; website?: string }) {
  const res = await api.post<{ ok: boolean; pendingReview?: boolean }>('/api/auth/register', input);
  return res;
}

