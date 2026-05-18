import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the migrations directory in a way that works both in the
 * TypeScript source tree (dev) and the esbuild bundle (production).
 *
 * The production bundle is a single `dist/index.mjs`, so `__dirname` is
 * `artifacts/api-server/dist/` — relative paths from it are unreliable.
 * `process.cwd()` is always the artifact root (`artifacts/api-server/`)
 * when the server is started via `node dist/index.mjs`, so we use that
 * as the primary candidate.
 */
function resolveMigrationsDir(): string {
  const candidates = [
    // Production: cwd = artifacts/api-server/, src/ is committed alongside dist/
    path.resolve(process.cwd(), 'src/db/migrations'),
    // Dev / ts-node: __dirname = src/db/, so '.' is migrations/
    path.resolve(__dirname, 'migrations'),
    // Fallback: __dirname = dist/ → one level up lands at api-server/
    path.resolve(__dirname, '../src/db/migrations'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch { /* not found — try next */ }
  }
  // Last resort: return the cwd-based path even if it doesn't exist yet;
  // the caller will surface a clear error.
  return candidates[0];
}

/**
 * Run any pending SQL migrations from the migrations/ directory.
 *
 * Called automatically at server startup so that deploying a new build
 * always applies pending migrations (including the public_get_invoice
 * function) before the server begins accepting requests.
 *
 * Each migration runs in its own transaction and is tracked in the
 * schema_migrations table. Re-running is fully safe (idempotent).
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = resolveMigrationsDir();

  let files: string[];
  try {
    files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    console.error('[migrate] ERROR: Could not read migrations directory:', migrationsDir);
    throw err;
  }

  if (files.length === 0) {
    console.log('[migrate] No migration files found. Nothing to do.');
    return;
  }

  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        ran_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(applied.map((r: { filename: string }) => r.filename));
    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log('[migrate] All migrations already applied. Nothing to do.');
      return;
    }

    console.log(
      `[migrate] ${files.length} file(s) total, ${appliedSet.size} already applied, ${pending.length} pending.`,
    );

    for (const file of pending) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`[migrate] Applying: ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] Applied:  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[migrate] ERROR applying ${file}:`, (err as Error).message);
        throw err;
      }
    }

    console.log('[migrate] All pending migrations applied successfully.');
  } finally {
    await client.end();
  }
}
