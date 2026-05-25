CREATE TABLE IF NOT EXISTS expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expense_categories_company_idx ON expense_categories(company_id);

CREATE TABLE IF NOT EXISTS payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id         UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  expense_category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  account_id          UUID NOT NULL REFERENCES accounts(id),
  amount              NUMERIC(14,2) NOT NULL,
  method              VARCHAR(30) NOT NULL DEFAULT 'cash',
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference           VARCHAR(100),
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payouts_company_idx ON payouts(company_id);
CREATE INDEX IF NOT EXISTS payouts_supplier_idx ON payouts(company_id, supplier_id);
CREATE INDEX IF NOT EXISTS payouts_account_idx  ON payouts(account_id);
