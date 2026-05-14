import bcrypt from 'bcryptjs';
import { pool } from './client.js';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Plans
    const plansRes = await c.query(`
      INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_invoices_monthly, features)
      VALUES
        ('free',    'مجاني',  0,    0,    1, 20,  '{"reports":false,"api":false}'::jsonb),
        ('starter', 'مبتدئ',  99,   990,  3, 200, '{"reports":true,"api":false}'::jsonb),
        ('pro',     'احترافي',299,  2990, 10,2000,'{"reports":true,"api":true}'::jsonb),
        ('business','أعمال',  799,  7990, 50,99999,'{"reports":true,"api":true,"multi_branch":true}'::jsonb)
      ON CONFLICT (code) DO NOTHING
      RETURNING id, code;
    `);
    console.log(`[seed] plans: ${plansRes.rowCount ?? 0}`);

    // Super admin
    const superHash = await bcrypt.hash('Aa123456!', 12);
    const superRes = await c.query(`
      INSERT INTO users (email, password_hash, name, is_super_admin, email_verified_at)
      VALUES ('owner@hesabat.sa', $1, 'مالك حسابات', true, now())
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `, [superHash]);
    if (superRes.rowCount) {
      await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1, NULL, 'super_admin')`, [superRes.rows[0].id]);
    }

    // Demo company + admin
    const compRes = await c.query(`
      INSERT INTO companies (name, legal_name, tax_number, email, phone, address, currency, vat_rate)
      VALUES ('شركة الأفق التجارية','شركة الأفق التجارية المحدودة','310123456700003','info@alofok.sa','+966500000000','الرياض، حي العليا','SAR',15.00)
      RETURNING id;
    `);
    const companyId = compRes.rows[0].id;

    const adminHash = await bcrypt.hash('Aa123456!', 12);
    const adminRes = await c.query(`
      INSERT INTO users (email, password_hash, name, email_verified_at)
      VALUES ('admin@alofok.sa', $1, 'مدير الأفق', now())
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [adminHash]);
    const adminId = adminRes.rows[0].id;

    await c.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true) ON CONFLICT DO NOTHING`, [adminId, companyId]);
    await c.query(`INSERT INTO user_roles (user_id, company_id, role) VALUES ($1,$2,'company_admin') ON CONFLICT DO NOTHING`, [adminId, companyId]);

    // Subscription on starter plan
    await c.query(`
      INSERT INTO subscriptions (company_id, plan_id, status, started_at, expires_at)
      SELECT $1, id, 'active', now(), now() + interval '1 year' FROM plans WHERE code='starter'
    `, [companyId]);

    // Sample data — set tenant context to bypass RLS via super_admin? simpler: set company.
    await c.query(`SELECT set_config('app.current_company', $1, true)`, [companyId]);
    await c.query(`SELECT set_config('app.current_user', $1, true)`, [adminId]);

    await c.query(`
      INSERT INTO clients (company_id, name, email, phone, tax_number) VALUES
        ($1, 'مؤسسة النور',  'noor@example.com',  '+966511111111', '300000000000003'),
        ($1, 'شركة البحر',   'sea@example.com',   '+966522222222', '300000000000013'),
        ($1, 'متجر السلام',  'salam@example.com', '+966533333333', NULL);
    `, [companyId]);

    await c.query(`
      INSERT INTO products (company_id, sku, name, price, cost, quantity, alert_level) VALUES
        ($1, 'P-001', 'لاب توب Pro 14',  6500, 5400, 12, 3),
        ($1, 'P-002', 'شاشة 27 بوصة',    1200, 950,  8,  2),
        ($1, 'P-003', 'لوحة مفاتيح',     350,  220,  40, 5);
    `, [companyId]);

    await c.query(`
      INSERT INTO accounts (company_id, name, type, balance) VALUES
        ($1, 'الخزينة الرئيسية', 'cash', 12500),
        ($1, 'حساب الراجحي',     'bank', 84300);
    `, [companyId]);

    await c.query('COMMIT');
    console.log('[seed] done.');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
