ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS bank_charges_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS interest_income_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;

DO $$ BEGIN
  CREATE TYPE bank_reconciliation_status AS ENUM ('draft','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  statement_date  DATE NOT NULL,
  opening_balance NUMERIC(14,2),
  closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          bank_reconciliation_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_reconciliations_company_idx ON bank_reconciliations(company_id, statement_date DESC);
CREATE INDEX IF NOT EXISTS bank_reconciliations_account_idx ON bank_reconciliations(company_id, account_id);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reconciliation_id        UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
  transaction_date         DATE NOT NULL,
  description              TEXT NOT NULL,
  debit_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference                VARCHAR(120),
  matched_journal_line_id  UUID REFERENCES journal_entry_lines(id) ON DELETE SET NULL,
  is_matched               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit_amount >= 0 AND credit_amount >= 0),
  CHECK (debit_amount > 0 OR credit_amount > 0)
);

CREATE INDEX IF NOT EXISTS bank_statement_lines_reconciliation_idx ON bank_statement_lines(company_id, reconciliation_id);
CREATE INDEX IF NOT EXISTS bank_statement_lines_match_idx ON bank_statement_lines(company_id, matched_journal_line_id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_unique_match_idx
  ON bank_statement_lines(company_id, matched_journal_line_id)
  WHERE matched_journal_line_id IS NOT NULL;
