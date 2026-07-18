-- Products accounting V1:
-- Existing numeric amounts and product costs are assumed to be EGP. No currency
-- conversion, FX rates, or multi-currency product accounting is introduced here.

DO $$
BEGIN
  CREATE TYPE product_type AS ENUM ('stock', 'service', 'non_stock', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE product_vat_status AS ENUM ('taxable', 'exempt', 'zero_rated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type product_type NOT NULL DEFAULT 'stock';
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_status product_vat_status NOT NULL DEFAULT 'taxable';
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);

UPDATE products p
SET vat_rate = c.vat_rate
FROM companies c
WHERE p.company_id = c.id AND p.vat_rate IS NULL;

ALTER TABLE products ALTER COLUMN vat_rate SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_barcode_uq
  ON products(company_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE INDEX IF NOT EXISTS products_company_barcode_idx
  ON products(company_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS sales_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS sales_returns_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS purchase_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS inventory_adjustment_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_returns_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_adjustment_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
