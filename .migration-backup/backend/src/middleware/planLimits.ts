import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/client.js';
import { forbidden } from '../utils/errors.js';

interface PlanRow {
  max_users: number;
  max_invoices_monthly: number;
  status: string;
  expires_at: string | null;
}

async function getActivePlan(companyId: string): Promise<PlanRow | null> {
  const rs = await pool.query(
    `SELECT p.max_users, p.max_invoices_monthly, s.status, s.expires_at
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.company_id = $1
       AND s.status IN ('active','trialing','past_due')
     ORDER BY s.created_at DESC LIMIT 1`,
    [companyId],
  );
  return rs.rows[0] ?? null;
}

/** Block requests on expired/cancelled subscriptions (read-only routes still pass). */
export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  const t = req.tenant;
  if (!t || t.isSuperAdmin) return next();
  const plan = await getActivePlan(t.companyId);
  if (!plan) return next(forbidden('No active subscription'));
  if (plan.status === 'expired' || plan.status === 'cancelled') {
    return next(forbidden('Subscription expired'));
  }
  if (plan.expires_at && new Date(plan.expires_at) < new Date()) {
    // soft-expire: mark and refuse writes, allow GETs
    if (req.method !== 'GET') return next(forbidden('Subscription expired'));
  }
  next();
}

export function enforceInvoiceLimit() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    const t = req.tenant;
    if (!t || t.isSuperAdmin) return next();
    const plan = await getActivePlan(t.companyId);
    if (!plan) return next();
    if (plan.max_invoices_monthly <= 0) return next();
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM invoices
       WHERE company_id = $1 AND date_trunc('month', issue_date) = date_trunc('month', now())`,
      [t.companyId],
    );
    if (cnt.rows[0].n >= plan.max_invoices_monthly) {
      return next(forbidden(`Monthly invoice limit (${plan.max_invoices_monthly}) reached for your plan`));
    }
    next();
  };
}

export function enforceUserLimit() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    const t = req.tenant;
    if (!t || t.isSuperAdmin) return next();
    const plan = await getActivePlan(t.companyId);
    if (!plan) return next();
    if (plan.max_users <= 0) return next();
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM user_companies WHERE company_id = $1`,
      [t.companyId],
    );
    if (cnt.rows[0].n >= plan.max_users) {
      return next(forbidden(`User seats limit (${plan.max_users}) reached for your plan`));
    }
    next();
  };
}
