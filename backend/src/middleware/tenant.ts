import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/client.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import type pg from 'pg';

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: {
      companyId: string;
      isSuperAdmin: boolean;
      roles: string[];
      /** Pre-acquired Postgres client with tenant context set; release in `finally`. */
      db: pg.PoolClient;
      release: () => void;
    };
  }
}

/**
 * Resolves the active company for the request:
 *   - explicit header `x-company-id` (must belong to user)
 *   - default user_companies row
 * Then opens a DB client with `app.current_company` and `app.current_user` set,
 * which RLS policies rely on. Caller MUST call req.tenant.release() at end.
 */
export async function tenantContext(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  const userId = req.auth.userId;

  const userInfo = await pool.query(
    `SELECT is_super_admin FROM users WHERE id = $1`, [userId],
  );
  if (!userInfo.rowCount) return next(unauthorized('User not found'));
  const isSuperAdmin: boolean = userInfo.rows[0].is_super_admin;

  const headerCompany = (req.header('x-company-id') ?? '').trim() || null;
  let companyId: string | null = headerCompany;

  if (!companyId) {
    const def = await pool.query(
      `SELECT company_id FROM user_companies WHERE user_id = $1 ORDER BY is_default DESC LIMIT 1`,
      [userId],
    );
    companyId = def.rows[0]?.company_id ?? null;
  } else if (!isSuperAdmin) {
    const ok = await pool.query(
      `SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [userId, companyId],
    );
    if (!ok.rowCount) return next(forbidden('Not a member of this company'));
  }

  // Super admin endpoints may operate without a company context.
  const rolesRes = await pool.query(
    `SELECT role FROM user_roles WHERE user_id = $1 AND (company_id = $2 OR company_id IS NULL)`,
    [userId, companyId],
  );
  const roles: string[] = rolesRes.rows.map((r) => r.role);

  const client = await pool.connect();
  try {
    if (companyId) await client.query(`SELECT set_config('app.current_company', $1, false)`, [companyId]);
    await client.query(`SELECT set_config('app.current_user', $1, false)`, [userId]);
  } catch (e) {
    client.release();
    return next(e as Error);
  }

  req.tenant = {
    companyId: companyId ?? '',
    isSuperAdmin,
    roles,
    db: client,
    release: () => client.release(),
  };

  // Auto-release on response end
  const origEnd = _res.end.bind(_res);
  // @ts-expect-error narrow
  _res.end = (...args: unknown[]) => { try { req.tenant?.release(); } catch {} return origEnd(...args); };

  next();
}
