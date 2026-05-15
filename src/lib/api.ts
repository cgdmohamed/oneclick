/**
 * Lightweight typed API client for the Hesabat backend.
 * Set VITE_API_URL in `.env` (e.g. http://localhost:4000).
 *
 * Usage:
 *   import { api, setAccessToken } from '@/lib/api';
 *   const { data } = await api.get<{ data: Client[] }>('/api/clients');
 */

const TOKEN_KEY = 'hesabat.access_token';
const REFRESH_KEY = 'hesabat.refresh_token';
const COMPANY_KEY = 'hesabat.company_id';

export const API_URL: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';

export const isApiConfigured = () => Boolean(API_URL);

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const setAccessToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const setRefreshToken = (t: string | null) =>
  t ? localStorage.setItem(REFRESH_KEY, t) : localStorage.removeItem(REFRESH_KEY);

export const getActiveCompanyId = () => localStorage.getItem(COMPANY_KEY);
export const setActiveCompanyId = (id: string | null) =>
  id ? localStorage.setItem(COMPANY_KEY, id) : localStorage.removeItem(COMPANY_KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'API_URL not configured (set VITE_API_URL)');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = getActiveCompanyId();
  if (company) headers['x-company-id'] = company;

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
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
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
};

/* ---------- Auth helpers ---------- */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; name: string; isSuperAdmin?: boolean };
  company: { id: string; name: string } | null;
  roles: { role: string; company_id: string | null }[];
}

export async function loginRequest(email: string, password: string) {
  const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
  setAccessToken(res.access_token);
  setRefreshToken(res.refresh_token);
  if (res.company?.id) setActiveCompanyId(res.company.id);
  return res;
}

export async function logoutRequest() {
  const refresh = getRefreshToken();
  try { await api.post('/api/auth/logout', { refresh_token: refresh }); } catch { /* ignore */ }
  setAccessToken(null);
  setRefreshToken(null);
  setActiveCompanyId(null);
}

export async function registerRequest(input: { email: string; password: string; name: string; companyName: string }) {
  const res = await api.post<LoginResponse>('/api/auth/register', input);
  setAccessToken(res.access_token);
  setRefreshToken(res.refresh_token);
  if (res.company?.id) setActiveCompanyId(res.company.id);
  return res;
}
