import { pool } from '../db/client.js';

/**
 * Append-only internal record of sensitive admin actions, kept entirely
 * outside the application's visible surface — no API route or UI screen
 * reads this table, and it has no foreign-key relation to companies/users
 * so a row survives even if the company or user it refers to is later
 * deleted. Identifying details are snapshotted at write time for the same
 * reason. Viewable only via direct database access (psql).
 *
 * Never call this anywhere the acting user could see its result or
 * influence what gets recorded — it must stay outside the app entirely.
 */
export async function logInternalAdminAction(args: {
  actorUserId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  details?: Record<string, unknown> | null;
  requestId?: string | null;
  requestIp?: string | null;
}) {
  try {
    let actorEmail: string | null = null;
    let actorName: string | null = null;
    if (args.actorUserId) {
      const u = await pool.query(`SELECT email, name FROM users WHERE id = $1`, [args.actorUserId]);
      actorEmail = u.rows[0]?.email ?? null;
      actorName = u.rows[0]?.name ?? null;
    }
    await pool.query(
      `INSERT INTO internal_admin_actions_log
        (actor_user_id, actor_email, actor_name, action, target_type, target_id, target_label, details, request_id, request_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        args.actorUserId, actorEmail, actorName, args.action,
        args.targetType ?? null, args.targetId ?? null, args.targetLabel ?? null,
        args.details ? JSON.stringify(args.details) : null,
        args.requestId ?? null, args.requestIp ?? null,
      ],
    );
  } catch {
    /* never let logging break the real request */
  }
}
