import type { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/errors.js';

export function requireFeature(...features: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const t = req.tenant;
    if (!t || t.isSuperAdmin || features.length === 0) return next();

    const rs = await t.db.query(
      `WITH current_subscription AS (
         SELECT plan_id
         FROM subscriptions
         WHERE company_id = $1
           AND status IN ('active', 'trialing')
         ORDER BY created_at DESC
         LIMIT 1
       )
       SELECT 1
       FROM current_subscription s
       JOIN feature_access fa ON fa.plan_id = s.plan_id
       WHERE fa.enabled = true
         AND fa.feature_key = ANY($2::text[])
       LIMIT 1`,
      [t.companyId, features],
    );

    if (!rs.rowCount) {
      return next(forbidden('هذه الميزة غير مفعّلة في باقتك'));
    }
    next();
  };
}
