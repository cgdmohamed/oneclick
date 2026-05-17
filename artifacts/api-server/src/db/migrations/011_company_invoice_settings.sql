-- Add missing company settings columns for invoice configuration and owner name.
-- All additions are idempotent via ADD COLUMN IF NOT EXISTS.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_sequence_start integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invoice_template varchar(20) NOT NULL DEFAULT 'modern',
  ADD COLUMN IF NOT EXISTS invoice_accent_color varchar(20) NOT NULL DEFAULT '#4F46E5',
  ADD COLUMN IF NOT EXISTS invoice_terms text,
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS invoice_currency_symbol varchar(20),
  ADD COLUMN IF NOT EXISTS owner_name varchar(200);
