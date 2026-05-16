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
    throw new ApiError(res.status, msg, payload);
  }
  return payload as T;
}

async function tryRefresh(): Promise<boolean> {
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

export async function loginRequest(email: string, password: string) {
  const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
  setAccessToken(res.access_token);
  if (res.company?.id) setActiveCompanyId(res.company.id);
  return res;
}

export async function logoutRequest() {
  try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
  setAccessToken(null);
  setActiveCompanyId(null);
}

export async function registerRequest(input: { email: string; password: string; name: string; companyName: string }) {
  const res = await api.post<LoginResponse>('/api/auth/register', input);
  setAccessToken(res.access_token);
  if (res.company?.id) setActiveCompanyId(res.company.id);
  return res;
}

