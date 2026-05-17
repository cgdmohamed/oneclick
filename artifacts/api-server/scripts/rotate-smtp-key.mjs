/**
 * SMTP encryption key rotation script.
 *
 * Decrypts every stored SMTP password with OLD_KEY and re-encrypts it with
 * NEW_KEY inside a single database transaction, so the rotation is atomic.
 *
 * Rows that are NOT encrypted (legacy plaintext) are encrypted with NEW_KEY
 * as part of the same pass — combining rotation with any leftover back-fill.
 *
 * Usage:
 *   OLD_KEY=<64-hex-chars> NEW_KEY=<64-hex-chars> \
 *     DATABASE_URL=<connection_string> \
 *     node artifacts/api-server/scripts/rotate-smtp-key.mjs
 *
 * Dry-run (prints what would change, writes nothing):
 *   DRY_RUN=true OLD_KEY=<64-hex-chars> NEW_KEY=<64-hex-chars> \
 *     DATABASE_URL=<connection_string> \
 *     node artifacts/api-server/scripts/rotate-smtp-key.mjs
 *
 * Idempotent — safe to re-run at any time:
 * - If a row is already encrypted with NEW_KEY (e.g. after a previous
 *   successful rotation), it is detected and skipped automatically.
 * - If OLD_KEY === NEW_KEY every row is a no-op (already-on-new-key).
 *
 * Generate a new key with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import pg from 'pg';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const { Pool } = pg;

const ENC_PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const DRY_RUN = process.env.DRY_RUN === 'true';

function parseKey(envVar) {
  const hex = process.env[envVar];
  if (!hex) {
    console.error(`ERROR: ${envVar} is not set.`);
    process.exit(1);
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    console.error(`ERROR: ${envVar} must be exactly 64 hex characters (32 bytes). Got ${hex.length} hex chars.`);
    process.exit(1);
  }
  return buf;
}

function decrypt(stored, key) {
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }
  const body = stored.slice(ENC_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) throw new Error(`Invalid encrypted format — expected 3 colon-delimited parts, got ${parts.length}`);
  const [ivHex, authTagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedBuf = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encryptedBuf).toString('utf8') + decipher.final('utf8');
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

  const oldKey = parseKey('OLD_KEY');
  const newKey = parseKey('NEW_KEY');

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written to the database.\n');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT id, name, smtp_settings->>'password' AS pwd
       FROM companies
       WHERE smtp_settings->>'password' IS NOT NULL
         AND smtp_settings->>'password' <> ''`
    );

    console.log(`Found ${rows.length} company row(s) with a non-empty SMTP password.\n`);

    if (rows.length === 0) {
      console.log('Nothing to do. Exiting.');
      return;
    }

    let rotated = 0;
    let encryptedFromPlaintext = 0;
    let alreadyOnNewKey = 0;
    let errors = 0;

    const updates = [];

    for (const row of rows) {
      const wasPlaintext = !row.pwd.startsWith(ENC_PREFIX);

      if (wasPlaintext) {
        const reEncrypted = encrypt(row.pwd, newKey);
        console.log(`  ENCRYPT  [${row.id}] ${row.name} — was plaintext, now encrypted with NEW_KEY`);
        encryptedFromPlaintext++;
        updates.push({ id: row.id, reEncrypted });
        continue;
      }

      let decrypted;

      try {
        decrypted = decrypt(row.pwd, oldKey);
      } catch (_oldKeyErr) {
        try {
          decrypt(row.pwd, newKey);
          console.log(`  SKIP     [${row.id}] ${row.name} — already encrypted with NEW_KEY`);
          alreadyOnNewKey++;
          continue;
        } catch (_newKeyErr) {
          console.error(`  ERROR    [${row.id}] ${row.name} — cannot decrypt with OLD_KEY or NEW_KEY`);
          errors++;
          continue;
        }
      }

      const reEncrypted = encrypt(decrypted, newKey);
      console.log(`  ROTATE   [${row.id}] ${row.name} — re-encrypted with NEW_KEY`);
      rotated++;
      updates.push({ id: row.id, reEncrypted });
    }

    console.log('');

    if (errors > 0) {
      console.error(`Aborting — ${errors} row(s) could not be decrypted with either key. No changes written.`);
      process.exit(1);
    }

    if (DRY_RUN) {
      console.log('[DRY RUN] Summary (no writes performed):');
      console.log(`  Would rotate (encrypted → re-encrypted) : ${rotated}`);
      console.log(`  Would encrypt (plaintext → encrypted)   : ${encryptedFromPlaintext}`);
      console.log(`  Already on NEW_KEY (skipped)            : ${alreadyOnNewKey}`);
      return;
    }

    if (updates.length === 0) {
      console.log('All rows are already encrypted with NEW_KEY. Nothing to write.');
    } else {
      await client.query('BEGIN');
      try {
        for (const { id, reEncrypted } of updates) {
          await client.query(
            `UPDATE companies
             SET smtp_settings = jsonb_set(smtp_settings, '{password}', to_jsonb($1::text)),
                 updated_at = now()
             WHERE id = $2`,
            [reEncrypted, id]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Done.');
    console.log(`  Rotated  (encrypted → re-encrypted) : ${rotated}`);
    console.log(`  Encrypted (plaintext → encrypted)   : ${encryptedFromPlaintext}`);
    console.log(`  Already on NEW_KEY (skipped)        : ${alreadyOnNewKey}`);
    console.log(`  Errors                              : ${errors}`);
    if (updates.length > 0) {
      console.log('');
      console.log('Next step: update SMTP_ENCRYPTION_KEY in your environment/secrets to NEW_KEY and redeploy.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Rotation failed:', err.message);
  process.exit(1);
});
