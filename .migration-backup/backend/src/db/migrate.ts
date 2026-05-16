import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'migrations');

async function main() {
  // Ensure tracking table exists before reading state.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ version: string }>(`SELECT version FROM schema_migrations`))
      .rows.map((r) => r.version),
  );

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));
  console.log(`[migrate] ${files.length} on disk, ${pending.length} pending`);

  for (const f of pending) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`  → ${f}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [f],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  console.log('[migrate] done.');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
