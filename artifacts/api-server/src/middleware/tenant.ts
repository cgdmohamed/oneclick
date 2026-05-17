import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/client.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import type pg from 'pg';

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: {
      /** Null only for super-admin requests that operate without a company scope. */
      companyId: string | null;
      isSuperAdmin: boolean;
      roles: string[];
      /**
       * Postgres client with an OPEN TRANSACTION and tenant context applied
       * via `SET LOCAL`. Settings are scoped to this transaction only and
       * cannot leak to the next request on the same pooled connection.
       *
       * Do not call BEGIN/COMMIT manually inside handlers — the middleware
       * commits on a 2xx/3xx response and rolls back on >=400 or `close`.
       */
      db: pg.PoolClient;
      release: () => void;
    };
  }
}

/**
 * Resolves the active company, opens a dedicated pg client in a transaction,
 * and sets `app.current_company` / `app.current_user` with TRANSACTION scope
 * (`SET LOCAL`) so that RLS policies cannot leak across requests via the pool.
 *
 * The transaction is committed when the response finishes successfully
 * (<400) and rolled back otherwise. This also makes every authenticated
 * handler atomic by default — no more partial writes when an INSERT in the
 * middle of a multi-step flow throws.
 */
export async function tenantContext(req: Request, res: Response, next: NextFunction) {
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

  // Non-super-admin users must have a valid company association.
  if (!companyId && !isSuperAdmin) {
    return next(forbidden('No company associated with this account'));
  }

  const rolesRes = await pool.query(
    `SELECT role FROM user_roles WHERE user_id = $1 AND (company_id = $2 OR company_id IS NULL)`,
    [userId, companyId],
  );
  const roles: string[] = rolesRes.rows.map((r) => r.role);

  const client = await pool.connect();
  let released = false;
  const settle = async (commit: boolean) => {
    if (released) return;
    released = true;
    try {
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    } catch { /* ignore */ }
    finally { client.release(); }
  };

  try {
    await client.query('BEGIN');
    // SET LOCAL — tenant context dies with the transaction, cannot leak.
    if (companyId) {
      await client.query(`SELECT set_config('app.current_company', $1, true)`, [companyId]);
    }
    await client.query(`SELECT set_config('app.current_user', $1, true)`, [userId]);
  } catch (e) {
    await settle(false);
    return next(e as Error);
  }

  req.tenant = {
    companyId,
    isSuperAdmin,
    roles,
    db: client,
    release: () => { void settle(false); },
  };

  // Commit on 2xx/3xx, roll back otherwise.
  res.on('finish', () => { void settle(res.statusCode < 400); });
  res.on('close', () => { void settle(false); });

  next();
}
