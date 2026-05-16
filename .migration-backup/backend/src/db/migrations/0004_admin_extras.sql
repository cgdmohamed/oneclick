-- Stage E: admin extras (company status flag for super-admin suspension)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies (is_active);
