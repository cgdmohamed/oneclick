/**
 * SEC-03: CSRF protection for cookie-authenticated endpoints (double-submit).
 *
 * The refresh-token cookie is httpOnly + SameSite=lax|none, which already
 * blocks most CSRF, but we add belt-and-braces double-submit:
 *
 *  - `setCsrfCookie(res)` issues a non-httpOnly `hesabat_csrf` cookie that
 *    the SPA can read from `document.cookie`.
 *  - `requireCsrf` rejects POST/PUT/PATCH/DELETE on cookie-auth endpoints
 *    unless the `x-csrf-token` header matches the cookie (constant-time).
 *
 * Bearer-auth API routes (`/api/...` with `Authorization`) do not need this
 * — an attacker page can't read or forge the bearer token from another origin.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

export const CSRF_COOKIE = 'hesabat_csrf';
const CSRF_HEADER = 'x-csrf-token';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOpts(path: string) {
  const sameSite = env.COOKIE_SAMESITE;
  const secure = env.COOKIE_SECURE ?? (sameSite === 'none' || env.NODE_ENV === 'production');
  return {
    httpOnly: false as const, // SPA needs to read this
    secure,
    sameSite,
    path,
    maxAge: THIRTY_DAYS_MS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setCsrfCookie(res: Response): string {
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, cookieOpts('/'));
  return token;
}

export function clearCsrfCookie(res: Response) {
  const { maxAge: _omit, ...opts } = cookieOpts('/');
  res.clearCookie(CSRF_COOKIE, opts);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  // Only state-changing methods need protection.
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const cookieVal = (req as Request & { cookies?: Record<string, string> }).cookies?.[CSRF_COOKIE];
  const headerVal = (req.headers[CSRF_HEADER] as string | undefined)?.trim();
  if (!cookieVal || !headerVal || !safeEqual(cookieVal, headerVal)) {
    return next(forbidden('CSRF token missing or invalid'));
  }
  next();
}
