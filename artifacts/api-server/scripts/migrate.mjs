#!/usr/bin/env node
/**
 * Migration runner for Hesabat / ون كليك
 *
 * Reads all *.sql files from src/db/migrations/ in filename order and executes
 * each one against the database pointed to by DATABASE_URL. Every migration
 * uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so the runner is fully
 * idempotent — safe to run on every deploy.
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
  let files;
  try {
    files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexicographic order — 001 < 002 < ... < 005
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

  console.log(`[migrate] Found ${files.length} migration file(s) in ${MIGRATIONS_DIR}`);

  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`[migrate] Running: ${file}`);
      await client.query(sql);
      console.log(`[migrate] Done:    ${file}`);
    }
    console.log('[migrate] All migrations applied successfully.');
  } catch (err) {
    console.error(`[migrate] ERROR while applying migrations:`);
    console.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
