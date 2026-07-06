CREATE TABLE IF NOT EXISTS chart_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id      UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  code           VARCHAR(30) NOT NULL,
  name           VARCHAR(200) NOT NULL,
  type           VARCHAR(30) NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS chart_accounts_company_code_uq ON chart_accounts(company_id, code);
CREATE INDEX IF NOT EXISTS chart_accounts_company_idx ON chart_accounts(company_id);
CREATE INDEX IF NOT EXISTS chart_accounts_parent_idx ON chart_accounts(company_id, parent_id);

CREATE TABLE IF NOT EXISTS fiscal_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_on <= ends_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_years_company_dates_uq ON fiscal_years(company_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS fiscal_years_company_idx ON fiscal_years(company_id);

CREATE TABLE IF NOT EXISTS accounting_periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  starts_on      DATE NOT NULL,
  ends_on        DATE NOT NULL,
  is_locked      BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at      TIMESTAMPTZ,
  locked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS accounting_periods_company_idx ON accounting_periods(company_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS accounting_settings (
  company_id                         UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  accounts_receivable_account_id     UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  accounts_payable_account_id        UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  sales_revenue_account_id           UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  sales_vat_account_id               UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  purchase_vat_account_id            UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  inventory_account_id               UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  cogs_account_id                    UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  cash_account_id                    UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  bank_account_id                    UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  wallet_account_id                  UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  general_expenses_account_id        UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  retained_earnings_account_id       UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  inventory_adjustment_account_id    UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entry_sequences (
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  sequence       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, fiscal_year_id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year_id      UUID NOT NULL REFERENCES fiscal_years(id) ON DELETE RESTRICT,
  period_id           UUID REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  number              VARCHAR(50) NOT NULL,
  entry_date          DATE NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reversed')),
  source_type         VARCHAR(40),
  source_id           UUID,
  memo                TEXT,
  reversed_entry_id   UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  posted_at           TIMESTAMPTZ,
  posted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_company_number_uq ON journal_entries(company_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_uq ON journal_entries(company_id, source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entries_company_date_idx ON journal_entries(company_id, entry_date);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  description      TEXT,
  debit            NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_no          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX IF NOT EXISTS journal_entry_lines_entry_idx ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_entry_lines_account_idx ON journal_entry_lines(company_id, account_id);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS average_cost NUMERIC(14,4) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_value NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_migration_status VARCHAR(20) NOT NULL DEFAULT 'unposted';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS accounting_migration_status VARCHAR(20) NOT NULL DEFAULT 'unposted';
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS accounting_migration_status VARCHAR(20) NOT NULL DEFAULT 'unposted';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS accounting_migration_status VARCHAR(20) NOT NULL DEFAULT 'unposted';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,4);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS total_value NUMERIC(14,2);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS adjustment_direction VARCHAR(10) CHECK (adjustment_direction IS NULL OR adjustment_direction IN ('increase','decrease'));

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  number           VARCHAR(50) NOT NULL,
  supplier_number  VARCHAR(100),
  invoice_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date         TIMESTAMPTZ,
  status           VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','paid','partial','cancelled')),
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid             NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining        NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_company_number_uq ON purchase_invoices(company_id, number);
CREATE INDEX IF NOT EXISTS purchase_invoices_company_idx ON purchase_invoices(company_id);
CREATE INDEX IF NOT EXISTS purchase_invoices_supplier_idx ON purchase_invoices(company_id, supplier_id);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  expense_account_id  UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  description         VARCHAR(300) NOT NULL,
  quantity            NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_cost           NUMERIC(14,4) NOT NULL DEFAULT 0,
  vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 15,
  line_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_invoice_items_invoice_idx ON purchase_invoice_items(purchase_invoice_id);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  number              VARCHAR(50) NOT NULL,
  return_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  status              VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','cancelled')),
  journal_entry_id    UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_company_number_uq ON purchase_returns(company_id, number);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount              NUMERIC(14,2) NOT NULL,
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method              VARCHAR(30) NOT NULL DEFAULT 'cash',
  reference           VARCHAR(100),
  notes               TEXT,
  journal_entry_id    UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_payments_company_idx ON supplier_payments(company_id);
CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments(company_id, supplier_id);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_type         VARCHAR(40) NOT NULL,
  source_id           UUID NOT NULL,
  movement_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity_in         NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_out        NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost           NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_quantity    NUMERIC(12,3) NOT NULL DEFAULT 0,
  balance_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_ledger_company_product_idx ON stock_ledger(company_id, product_id, movement_date);
