ALTER TABLE payments ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS credit_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS collection_type VARCHAR(30) NOT NULL DEFAULT 'invoice_collection';

UPDATE payments p
SET client_id = i.client_id,
    collection_type = 'invoice_collection'
FROM invoices i
WHERE p.invoice_id = i.id
  AND p.client_id IS NULL;

CREATE INDEX IF NOT EXISTS payments_client_idx ON payments(company_id, client_id);
CREATE INDEX IF NOT EXISTS payments_collection_type_idx ON payments(company_id, collection_type);

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS debit_account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payouts_debit_account_idx ON payouts(company_id, debit_account_id);
