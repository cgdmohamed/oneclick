import type { Response } from 'express';
import { env } from '../config/env.js';

export const REFRESH_COOKIE = 'hesabat_rt';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOpts() {
  const sameSite = env.COOKIE_SAMESITE; // 'lax' | 'strict' | 'none'
  const secure = env.COOKIE_SECURE ?? (sameSite === 'none' || env.NODE_ENV === 'production');
  return {
    httpOnly: true as const,
    secure,
    sameSite,
    path: '/api/auth',
    maxAge: THIRTY_DAYS_MS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, cookieOpts());
}

export function clearRefreshCookie(res: Response) {
  const { maxAge: _omit, ...opts } = cookieOpts();
  res.clearCookie(REFRESH_COOKIE, opts);
}
