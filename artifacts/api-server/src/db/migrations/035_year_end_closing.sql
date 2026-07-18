ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS income_summary_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;

ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS closing_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id) ON DELETE SET NULL;
