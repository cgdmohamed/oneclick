/**
 * One-time migration: encrypt any plaintext SMTP passwords still in the DB.
 *
 * Safe to re-run — rows that are already encrypted (enc:v1: prefix) are skipped.
 *
 * Usage:
 *   DATABASE_URL=<connection_string> SMTP_ENCRYPTION_KEY=<64-hex-chars> \
 *     node artifacts/api-server/scripts/encrypt-smtp-passwords.mjs
 */

import pg from 'pg';
import { createCipheriv, randomBytes } from 'node:crypto';

const { Pool } = pg;

const ENC_PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function getKey() {
  const keyHex = process.env.SMTP_ENCRYPTION_KEY;
  if (!keyHex) throw new Error('SMTP_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) throw new Error('SMTP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const key = getKey();

  const { rows } = await pool.query(
    `SELECT id, smtp_settings->>'password' AS pwd
     FROM companies
     WHERE smtp_settings->>'password' IS NOT NULL`
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.pwd.startsWith(ENC_PREFIX)) {
      skipped++;
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
    updated++;
  }

  console.log(`Done. Encrypted: ${updated}, already encrypted (skipped): ${skipped}.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
