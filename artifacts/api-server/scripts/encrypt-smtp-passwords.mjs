/**
 * One-time migration: encrypt any plaintext SMTP passwords still in the DB.
 *
 * Safe to re-run — rows that are already encrypted (enc:v1: prefix) are skipped.
 *
 * Usage:
 *   DATABASE_URL=<connection_string> SMTP_ENCRYPTION_KEY=<64-hex-chars> \
 *     node artifacts/api-server/scripts/encrypt-smtp-passwords.mjs
 *
 * Dry-run (prints what would change, writes nothing):
 *   DRY_RUN=true DATABASE_URL=<connection_string> SMTP_ENCRYPTION_KEY=<64-hex-chars> \
 *     node artifacts/api-server/scripts/encrypt-smtp-passwords.mjs
 */

import pg from 'pg';
import { createCipheriv, randomBytes } from 'node:crypto';

const { Pool } = pg;

const ENC_PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const DRY_RUN = process.env.DRY_RUN === 'true';

function getKey() {
  const keyHex = process.env.SMTP_ENCRYPTION_KEY;
  if (!keyHex) {
    console.error('ERROR: SMTP_ENCRYPTION_KEY is not set.');
    console.error('Generate one with:');
    console.error("  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    process.exit(1);
  }
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) {
    console.error('ERROR: SMTP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
    process.exit(1);
  }
  return buf;
}

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const key = getKey();

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written to the database.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query(
      `SELECT id, name, smtp_settings->>'password' AS pwd
       FROM companies
       WHERE smtp_settings->>'password' IS NOT NULL
         AND smtp_settings->>'password' <> ''`
    );

    console.log(`Found ${rows.length} company row(s) with a non-empty SMTP password.\n`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.pwd.startsWith(ENC_PREFIX)) {
        console.log(`  SKIP     [${row.id}] ${row.name} — already encrypted`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  WOULD ENCRYPT  [${row.id}] ${row.name}`);
        updated++;
        continue;
      }

      const encrypted = encrypt(row.pwd, key);
      await pool.query(
        `UPDATE companies
         SET smtp_settings = jsonb_set(smtp_settings, '{password}', to_jsonb($1::text)),
             updated_at = now()
         WHERE id = $2`,
        [encrypted, row.id]
      );
      console.log(`  ENCRYPTED  [${row.id}] ${row.name}`);
      updated++;
    }

    console.log('');
    console.log('Done.');
    console.log(`  Plaintext passwords encrypted : ${updated}`);
    console.log(`  Already encrypted (skipped)  : ${skipped}`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
