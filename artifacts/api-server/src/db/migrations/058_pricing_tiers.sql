-- Migration 058: Realistic pricing tiers (أساسية / قياسية / احترافية) + a
-- dedicated 7-day trial plan, replacing the original placeholder seed from
-- 006_seed.sql (free/pro/enterprise at 0/49/199 EGP — far below actual
-- operating cost per customer).
--
-- The old plans are DEACTIVATED, not deleted: existing subscriptions still
-- reference their plan_id, and `plans.code` is UNIQUE so we can't reuse
-- those codes for the new tiers anyway. Deactivating removes them from the
-- public pricing page (`GET /api/plans` filters `is_active = true`) without
-- breaking any company currently on one of them.
--
-- Feature gating is driven by `feature_access` (joined in
-- GET /api/subscriptions/features), not just the `features` jsonb column on
-- `plans` — both are written here so the admin "Plans" screen and the
-- actual feature-gating path agree, matching what `syncFeatureAccess()` in
-- modules/plans/routes.ts does for an admin-initiated edit.
--
-- Feature key granularity note: payroll, fixed assets, branches and
-- multi-dimension (cost centers/projects) are all currently gated under the
-- single 'accounting' key (see AppLayout.tsx sidebar config) — there is no
-- finer-grained key yet to separate "قياسية has accounting but not
-- payroll/fixed assets" as a standalone toggle. All three tiers below use
-- the feature keys that actually exist in planFeatures.ts.

UPDATE plans SET is_active = false WHERE code IN ('free', 'pro', 'enterprise');

INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_invoices_monthly, features, is_active)
VALUES
  (
    'trial-7',
    'الباقة التجريبية',
    0.00,
    0.00,
    1,
    1000,
    '{"access": ["invoices","clients","payments","suppliers","payouts","products","inventory","stock_movements","accounts","bank_accounts","wallets","reports_basic","reports_advanced","accounting","purchases","notifications","sms_alerts","rbac","activity_log","api"]}'::jsonb,
    true
  ),
  (
    'basic',
    'الباقة الأساسية',
    799.00,
    7990.00,
    2,
    150,
    '{"access": ["invoices","clients","payments","suppliers","payouts","products","reports_basic","notifications"]}'::jsonb,
    true
  ),
  (
    'standard',
    'الباقة القياسية',
    1399.00,
    13990.00,
    5,
    1000,
    '{"access": ["invoices","clients","payments","suppliers","payouts","products","reports_basic","inventory","stock_movements","accounts","bank_accounts","wallets","purchases","reports_advanced","accounting","notifications","activity_log"]}'::jsonb,
    true
  ),
  (
    'professional',
    'الباقة الاحترافية',
    2499.00,
    24990.00,
    -1,
    -1,
    '{"access": ["invoices","clients","payments","suppliers","payouts","products","reports_basic","inventory","stock_movements","accounts","bank_accounts","wallets","purchases","reports_advanced","accounting","notifications","activity_log","rbac","sms_alerts","api"]}'::jsonb,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_users = EXCLUDED.max_users,
  max_invoices_monthly = EXCLUDED.max_invoices_monthly,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- Sync feature_access from the `features.access` array above for each of
-- the four new/updated plans (same effect as syncFeatureAccess() in
-- modules/plans/routes.ts, done here directly in SQL since this is a
-- one-shot data migration, not an API-driven edit).
INSERT INTO feature_access (plan_id, feature_key, enabled)
SELECT p.id, k, true
FROM plans p
CROSS JOIN LATERAL jsonb_array_elements_text(p.features->'access') AS k
WHERE p.code IN ('trial-7', 'basic', 'standard', 'professional')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true;

-- Any pre-existing feature_access row for these plans whose key is no
-- longer in the current access list gets disabled (not deleted), same
-- "preserve for audit" convention as syncFeatureAccess().
UPDATE feature_access fa
SET enabled = false
WHERE fa.plan_id IN (SELECT id FROM plans WHERE code IN ('trial-7', 'basic', 'standard', 'professional'))
  AND NOT EXISTS (
    SELECT 1 FROM plans p, jsonb_array_elements_text(p.features->'access') AS k
    WHERE p.id = fa.plan_id AND k = fa.feature_key
  );
