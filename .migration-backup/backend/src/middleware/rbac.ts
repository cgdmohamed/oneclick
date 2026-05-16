import type { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/errors.js';

export function requireRole(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) return next(forbidden());
    if (req.tenant.isSuperAdmin) return next();
    const ok = req.tenant.roles.some((r) => allowed.includes(r));
    if (!ok) return next(forbidden('Insufficient role'));
    next();
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.tenant?.isSuperAdmin) return next(forbidden('Super admin required'));
  next();
}
