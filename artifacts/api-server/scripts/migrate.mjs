#!/usr/bin/env node
/**
 * Migration runner for Hesabat / ون كليك
 *
 * Reads all *.sql files from src/db/migrations/ in filename order, skips any
 * that have already been applied (tracked in schema_migrations), and runs the
 * remainder — each inside its own transaction. Safe to run on every deploy.
 *
 * Usage:
 *   node artifacts/api-server/scripts/migrate.mjs
 *   DATABASE_URL=postgres://... node artifacts/api-server/scripts/migrate.mjs
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../src/db/migrations');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[migrate] ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function run() {
  // Read migration files
  let files;
  try {
    files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexicographic order — 000 < 001 < 002 < ...
  } catch (err) {
    console.error(`[migrate] ERROR: Could not read migrations directory: ${MIGRATIONS_DIR}`);
    console.error(err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('[migrate] No migration files found. Nothing to do.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    // Ensure the tracking table exists (runs outside any transaction so it
    // survives even if a subsequent migration fails and rolls back).
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        ran_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Fetch already-applied filenames
    const { rows: applied } = await client.query(
      'SELECT filename FROM schema_migrations'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log('[migrate] All migrations already applied. Nothing to do.');
      return;
    }

    console.log(
      `[migrate] ${files.length} file(s) total, ${appliedSet.size} already applied, ${pending.length} pending.`
    );

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`[migrate] Applying: ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[migrate] Applied:  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[migrate] ERROR applying ${file}:`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log('[migrate] All pending migrations applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
