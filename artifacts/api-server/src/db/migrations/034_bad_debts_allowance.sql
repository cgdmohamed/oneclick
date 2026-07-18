ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS bad_debt_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS doubtful_debts_allowance_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS doubtful_debt_allowances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  allowance_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount            NUMERIC(14,2) NOT NULL,
  notes             TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS doubtful_debt_allowances_company_idx ON doubtful_debt_allowances(company_id, allowance_date);
CREATE INDEX IF NOT EXISTS doubtful_debt_allowances_customer_idx ON doubtful_debt_allowances(company_id, customer_id);

CREATE TABLE IF NOT EXISTS bad_debt_write_offs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  invoice_id        UUID REFERENCES invoices(id) ON DELETE SET NULL,
  write_off_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount            NUMERIC(14,2) NOT NULL,
  reason            TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS bad_debt_write_offs_company_idx ON bad_debt_write_offs(company_id, write_off_date);
CREATE INDEX IF NOT EXISTS bad_debt_write_offs_customer_idx ON bad_debt_write_offs(company_id, customer_id);
CREATE INDEX IF NOT EXISTS bad_debt_write_offs_invoice_idx ON bad_debt_write_offs(company_id, invoice_id);
