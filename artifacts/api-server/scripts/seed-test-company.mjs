#!/usr/bin/env node
/**
 * Seed script for Hesabat / ون كليك — inserts test accounts for local development.
 *
 * Test credentials
 * ─────────────────
 *   Super-admin : admin@test.com  / Test@12345
 *   Company user: company@test.com / Test@12345
 *   Company name: شركة الاختبار
 *
 * Usage:
 *   node artifacts/api-server/scripts/seed-test-company.mjs
 *   DATABASE_URL=postgres://... node artifacts/api-server/scripts/seed-test-company.mjs
 *
 * The script is fully idempotent — safe to run multiple times.
 * Existing rows are updated / upserted so credentials always match.
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[seed] ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const PASSWORD = 'Test@12345';
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    // ── 1. Super-admin user ──────────────────────────────────────────────────
    const { rows: [adminUser] } = await client.query(`
      INSERT INTO users (email, password_hash, name, is_super_admin, email_verified_at)
      VALUES ('admin@test.com', $1, 'مشرف النظام', true, now())
      ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            is_super_admin = true,
            email_verified_at = COALESCE(users.email_verified_at, now())
      RETURNING id
    `, [passwordHash]);

    await client.query(`
      INSERT INTO user_roles (user_id, company_id, role)
      SELECT $1, NULL, 'super_admin'
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = $1 AND company_id IS NULL AND role = 'super_admin'
      )
    `, [adminUser.id]);

    console.log(`[seed] Upserted super-admin: admin@test.com (id: ${adminUser.id})`);

    // ── 2. Company user ──────────────────────────────────────────────────────
    const { rows: [companyUser] } = await client.query(`
      INSERT INTO users (email, password_hash, name, is_super_admin, email_verified_at, onboarding_done)
      VALUES ('company@test.com', $1, 'مدير الشركة', false, now(), true)
      ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            email_verified_at = COALESCE(users.email_verified_at, now())
      RETURNING id
    `, [passwordHash]);

    const companyUserId = companyUser.id;
    console.log(`[seed] Upserted company user: company@test.com (id: ${companyUserId})`);

    // ── 3. Company row ───────────────────────────────────────────────────────
    let companyId;
    const { rows: [existingCompany] } = await client.query(`
      SELECT c.id FROM companies c
      JOIN user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND c.name = 'شركة الاختبار'
      LIMIT 1
    `, [companyUserId]);

    if (!existingCompany) {
      const { rows: [newCompany] } = await client.query(`
        INSERT INTO companies (name, email, currency)
        VALUES ('شركة الاختبار', 'company@test.com', 'SAR')
        RETURNING id
      `);
      companyId = newCompany.id;
      console.log(`[seed] Created company 'شركة الاختبار' (id: ${companyId})`);
    } else {
      companyId = existingCompany.id;
      console.log(`[seed] Company 'شركة الاختبار' already exists (id: ${companyId}) — skipped.`);
    }

    // Always ensure the user<->company link and role exist (idempotent upserts)
    await client.query(`
      INSERT INTO user_companies (user_id, company_id, is_default)
      VALUES ($1, $2, true)
      ON CONFLICT DO NOTHING
    `, [companyUserId, companyId]);

    await client.query(`
      INSERT INTO user_roles (user_id, company_id, role)
      VALUES ($1, $2, 'company_admin')
      ON CONFLICT DO NOTHING
    `, [companyUserId, companyId]);

    // ── 4. Free trial subscription ───────────────────────────────────────────
    const { rows: [freePlan] } = await client.query(
      `SELECT id FROM plans WHERE code = 'free' LIMIT 1`
    );

    if (!freePlan) {
      console.warn('[seed] WARNING: No free plan found. Skipping subscription.');
      console.warn("[seed] Seed a plan first: INSERT INTO plans (code, name, ...) VALUES ('free', ...)");
    } else {
      const { rows: [existingSub] } = await client.query(
        `SELECT id FROM subscriptions WHERE company_id = $1 LIMIT 1`,
        [companyId]
      );

      if (!existingSub) {
        await client.query(`
          INSERT INTO subscriptions (company_id, plan_id, status, expires_at)
          VALUES ($1, $2, 'trialing', now() + interval '30 days')
        `, [companyId, freePlan.id]);
        console.log('[seed] Created free-trial subscription for شركة الاختبار');
      } else {
        console.log('[seed] Subscription already exists — skipped.');
      }
    }

    await client.query('COMMIT');
    console.log('[seed] Done.');
    console.log('[seed] Credentials:');
    console.log('[seed]   Super-admin : admin@test.com  / Test@12345  → redirects to /admin');
    console.log('[seed]   Company user: company@test.com / Test@12345  → redirects to /app');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed] ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
