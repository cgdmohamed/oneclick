-- Migration 006: Seed required plan rows
-- Inserts the free, pro, and enterprise plans used by the registration flow.
-- ON CONFLICT DO NOTHING makes this fully idempotent — safe to re-run at any time.

INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_invoices_monthly, features, is_active)
VALUES
  (
    'free',
    'مجاني',
    0.00,
    0.00,
    5,
    50,
    '{"pdf_export": true, "email_invoices": false, "whatsapp_invoices": false, "reports": false, "multi_user": false}'::jsonb,
    true
  ),
  (
    'pro',
    'احترافي',
    49.00,
    490.00,
    20,
    500,
    '{"pdf_export": true, "email_invoices": true, "whatsapp_invoices": true, "reports": true, "multi_user": true}'::jsonb,
    true
  ),
  (
    'enterprise',
    'مؤسسي',
    199.00,
    1990.00,
    -1,
    -1,
    '{"pdf_export": true, "email_invoices": true, "whatsapp_invoices": true, "reports": true, "multi_user": true, "custom_branding": true, "priority_support": true}'::jsonb,
    true
  )
ON CONFLICT (code) DO NOTHING;
