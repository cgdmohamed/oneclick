import type pg from 'pg';

/** Best-effort audit log writer; never throws. */
export async function audit(
  db: pg.PoolClient | { query: pg.PoolClient['query'] },
  args: {
    companyId: string | null;
    userId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    data?: Record<string, unknown> | null;
  },
) {
  try {
    await db.query(
      `INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, data)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        args.companyId,
        args.userId,
        args.action,
        args.entity,
        args.entityId ?? null,
        args.data ? JSON.stringify(args.data) : null,
      ],
    );
  } catch {
    /* swallow — audit must never break a request */
  }
}
