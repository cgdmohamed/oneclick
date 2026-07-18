ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS fixed_assets_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS depreciation_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS asset_disposal_gain_loss_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS asset_categories (
  id                                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                                    VARCHAR(200) NOT NULL,
  fixed_asset_account_id                  UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  accumulated_depreciation_account_id     UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  depreciation_expense_account_id         UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  default_useful_life_months              INTEGER NOT NULL DEFAULT 60,
  is_active                               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (default_useful_life_months > 0)
);

CREATE INDEX IF NOT EXISTS asset_categories_company_idx ON asset_categories(company_id, is_active);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_code                VARCHAR(50) NOT NULL,
  name                      VARCHAR(200) NOT NULL,
  category_id               UUID NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
  purchase_date             DATE NOT NULL,
  acquisition_cost          NUMERIC(14,2) NOT NULL,
  salvage_value             NUMERIC(14,2) NOT NULL DEFAULT 0,
  useful_life_months        INTEGER NOT NULL,
  depreciation_start_date   DATE NOT NULL,
  status                    VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_depreciated', 'disposed')),
  branch_id                 UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id            UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, asset_code),
  CHECK (acquisition_cost >= 0),
  CHECK (salvage_value >= 0),
  CHECK (useful_life_months > 0)
);

CREATE INDEX IF NOT EXISTS fixed_assets_company_idx ON fixed_assets(company_id, status);
CREATE INDEX IF NOT EXISTS fixed_assets_category_idx ON fixed_assets(company_id, category_id);

CREATE TABLE IF NOT EXISTS depreciation_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id         UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  run_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at         TIMESTAMPTZ,
  posted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS depreciation_runs_company_idx ON depreciation_runs(company_id, run_date);
CREATE UNIQUE INDEX IF NOT EXISTS depreciation_runs_company_period_active_uq
  ON depreciation_runs(company_id, period_id)
  WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS depreciation_run_lines (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depreciation_run_id                 UUID NOT NULL REFERENCES depreciation_runs(id) ON DELETE CASCADE,
  asset_id                            UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE RESTRICT,
  depreciation_amount                 NUMERIC(14,2) NOT NULL,
  accumulated_depreciation_after      NUMERIC(14,2) NOT NULL,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, depreciation_run_id, asset_id),
  CHECK (depreciation_amount > 0)
);

CREATE INDEX IF NOT EXISTS depreciation_run_lines_asset_idx ON depreciation_run_lines(company_id, asset_id);
