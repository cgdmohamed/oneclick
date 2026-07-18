ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS inventory_loss_expense_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS inventory_write_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  write_off_number VARCHAR(60) NOT NULL,
  write_off_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason VARCHAR(40) NOT NULL CHECK (reason IN ('damaged','expired','broken','missing','theft','quality_issue','inventory_count_difference','other')),
  notes TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  reversal_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, write_off_number)
);

CREATE TABLE IF NOT EXISTS inventory_write_off_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  write_off_id UUID NOT NULL REFERENCES inventory_write_offs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason VARCHAR(40) CHECK (reason IS NULL OR reason IN ('damaged','expired','broken','missing','theft','quality_issue','inventory_count_difference','other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_write_offs_company_date_idx ON inventory_write_offs(company_id, write_off_date);
CREATE INDEX IF NOT EXISTS inventory_write_off_items_product_idx ON inventory_write_off_items(company_id, product_id);
