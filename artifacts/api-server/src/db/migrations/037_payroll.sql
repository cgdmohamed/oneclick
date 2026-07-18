ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS salaries_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS employee_payables_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS social_insurance_payable_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS payroll_tax_payable_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;
ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS payroll_deductions_payable_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_code   VARCHAR(50) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  phone           VARCHAR(50),
  email           VARCHAR(200),
  national_id     VARCHAR(50),
  hire_date       DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  basic_salary    NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, employee_code)
);

CREATE INDEX IF NOT EXISTS employees_company_idx ON employees(company_id, status);

CREATE TABLE IF NOT EXISTS salary_components (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('earning','deduction','employer_contribution')),
  account_id  UUID NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS salary_components_company_idx ON salary_components(company_id, is_active);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_month      INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year       INTEGER NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','paid','cancelled')),
  run_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  payment_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  payment_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  paid_at           TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at         TIMESTAMPTZ,
  posted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_company_period_active_uq
  ON payroll_runs(company_id, period_year, period_month)
  WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_run_id    UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  basic_salary      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_earnings    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_salary        NUMERIC(14,2) NOT NULL DEFAULT 0,
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id    UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS payroll_line_components (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_run_line_id   UUID NOT NULL REFERENCES payroll_run_lines(id) ON DELETE CASCADE,
  salary_component_id   UUID NOT NULL REFERENCES salary_components(id) ON DELETE RESTRICT,
  amount                NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS payroll_line_components_line_idx ON payroll_line_components(payroll_run_line_id);
