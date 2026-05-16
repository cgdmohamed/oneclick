import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

export interface AuthClaims { sub: string; }

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: string };
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Missing token'));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthClaims;
    req.auth = { userId: payload.sub };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}
