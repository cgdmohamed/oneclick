-- Marks a chart_accounts row as an auto-generated party sub-account (one
-- created for a specific client/supplier/employee by ensurePartySubAccount(),
-- see 059_party_sub_accounts.sql) rather than a manually-created account.
-- Lets the UI fold/filter these out of the chart-of-accounts tree and
-- account pickers by default, since there can be one per party and they'd
-- otherwise flood a flat list.
ALTER TABLE chart_accounts ADD COLUMN IF NOT EXISTS is_party_account BOOLEAN NOT NULL DEFAULT false;

UPDATE chart_accounts ca SET is_party_account = true
WHERE EXISTS (SELECT 1 FROM clients c WHERE c.chart_account_id = ca.id)
   OR EXISTS (SELECT 1 FROM suppliers s WHERE s.chart_account_id = ca.id)
   OR EXISTS (SELECT 1 FROM employees e WHERE e.chart_account_id = ca.id);
