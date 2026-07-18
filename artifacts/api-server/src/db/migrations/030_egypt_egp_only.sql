-- Egypt-only / EGP-only migration note.
-- TODO(accounting-migration): existing numeric amounts are assumed to be EGP.
-- No currency conversion, FX rates, revaluation, or exchange gain/loss is performed.

ALTER TABLE companies
  ALTER COLUMN currency SET DEFAULT 'EGP';

ALTER TABLE clients
  ALTER COLUMN currency SET DEFAULT 'EGP';

UPDATE companies
SET currency = 'EGP',
    invoice_currency_symbol = 'ج.م',
    updated_at = NOW()
WHERE currency IS DISTINCT FROM 'EGP'
   OR invoice_currency_symbol IS DISTINCT FROM 'ج.م';

UPDATE clients
SET currency = 'EGP'
WHERE currency IS DISTINCT FROM 'EGP';

UPDATE platform_settings
SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{currency}', '"ج.م"', true),
    updated_at = NOW()
WHERE key = 'general';
