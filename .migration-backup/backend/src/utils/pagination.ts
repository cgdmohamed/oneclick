/**
 * SCL-05: Tiny pagination helper for list endpoints.
 *
 * Reads `page` (1-indexed) and `page_size` (default 25, max 200) from the
 * querystring and exposes a single `applyTo(sql, params)` helper that adds
 * `LIMIT $n OFFSET $m`. Use `countSql` to get the unfiltered count when the
 * client wants a total. The response shape is back-compatible: `data` is
 * still a plain array, with extra `page`, `page_size`, and `total` fields.
 *
 * No third-party deps — pure SQL.
 *
 *   const p = parsePagination(req);
 *   const rs = await t.db.query(p.applyTo('SELECT * FROM invoices ORDER BY created_at DESC'));
 *   const total = await p.total(t.db, 'SELECT count(*) FROM invoices');
 *   res.json(p.respond(rs.rows, total));
 */
import type { Request } from 'express';
import type { PoolClient } from 'pg';

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  applyTo: (sql: string, params?: unknown[]) => { sql: string; params: unknown[] };
  total: (db: { query: PoolClient['query'] }, sql: string, params?: unknown[]) => Promise<number>;
  respond: <T>(rows: T[], total?: number) => {
    data: T[];
    page: number;
    page_size: number;
    total: number | null;
  };
}

const DEFAULT_SIZE = 25;
const MAX_SIZE = 200;

export function parsePagination(req: Request): Pagination {
  const q = req.query as Record<string, string | undefined>;
  const rawPage = Number.parseInt(q.page ?? '1', 10);
  const rawSize = Number.parseInt(q.page_size ?? String(DEFAULT_SIZE), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(
    MAX_SIZE,
    Math.max(1, Number.isFinite(rawSize) ? rawSize : DEFAULT_SIZE),
  );
  const offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    limit: pageSize,
    offset,
    applyTo(sql, params = []) {
      const i = params.length;
      return {
        sql: `${sql} LIMIT $${i + 1} OFFSET $${i + 2}`,
        params: [...params, pageSize, offset],
      };
    },
    async total(db, sql, params = []) {
      const rs = await db.query(sql, params);
      return Number(rs.rows[0]?.count ?? 0);
    },
    respond(rows, total) {
      return {
        data: rows,
        page,
        page_size: pageSize,
        total: total ?? null,
      };
    },
  };
}
