-- Migration 059: real chart-of-accounts sub-accounts per client/supplier/
-- employee, instead of only the dimension-tag approach added in
-- 047/058_employee_product_dimensions.sql.
--
-- Previously every client posted to the one shared AR control account
-- (1100), every supplier to the one shared AP account (2100), every
-- employee to the one shared payable account (2300), each tagged with a
-- client_id/employee_id column for reporting. That's the same underlying
-- mechanism Odoo uses under the hood, but it never shows as an actual
-- account in the chart of accounts the way traditional Egyptian
-- bookkeeping expects — this migration adds that: a real sub-account per
-- party, created under the relevant control account, which the posting
-- code (posting.ts, purchases/routes.ts, payroll/routes.ts, credit-notes,
-- debit-notes, bad-debts) now posts directly to from this point forward.
--
-- `chart_accounts` already supports a parent/child hierarchy with rollup
-- (ACCOUNT_ROLLUP_CTE in reports/routes.ts), so this is purely additive —
-- trial balance / balance sheet / general ledger all already roll a
-- parent's children up into it automatically; nothing about their query
-- shape needs to change.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES chart_accounts(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES chart_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_chart_account_idx ON clients(chart_account_id);
CREATE INDEX IF NOT EXISTS suppliers_chart_account_idx ON suppliers(chart_account_id);
CREATE INDEX IF NOT EXISTS employees_chart_account_idx ON employees(chart_account_id);

-- Backfill: one sub-account per existing client/supplier/employee, in
-- every company whose control account is already configured (companies
-- that have never touched accounting yet have no clients with any ledger
-- history worth backfilling anyway — the app creates the sub-account
-- lazily, via ensurePartySubAccount() in posting.ts, the next time such a
-- company's client/supplier/employee is actually posted against).
--
-- Code is "<parent code>-<4-digit sequence>", numbered per company in
-- creation order — the same scheme ensurePartySubAccount() uses going
-- forward, so a company's next live-created party continues the sequence
-- rather than colliding with it.
DO $$
DECLARE
  party RECORD;
  parent RECORD;
  seq INTEGER;
  new_id uuid;
BEGIN
  FOR party IN
    SELECT c.id, c.company_id, c.name, s.accounts_receivable_account_id AS parent_id
    FROM clients c
    JOIN accounting_settings s ON s.company_id = c.company_id
    WHERE c.chart_account_id IS NULL AND s.accounts_receivable_account_id IS NOT NULL
    ORDER BY c.company_id, c.created_at
  LOOP
    SELECT code, type, normal_balance INTO parent FROM chart_accounts WHERE id = party.parent_id;
    SELECT COUNT(*) + 1 INTO seq FROM chart_accounts WHERE parent_id = party.parent_id;
    INSERT INTO chart_accounts (company_id, parent_id, code, name, type, normal_balance, is_active)
    VALUES (party.company_id, party.parent_id, parent.code || '-' || lpad(seq::text, 4, '0'), party.name, parent.type, parent.normal_balance, true)
    RETURNING id INTO new_id;
    UPDATE clients SET chart_account_id = new_id WHERE id = party.id;
  END LOOP;

  FOR party IN
    SELECT sp.id, sp.company_id, sp.name, s.accounts_payable_account_id AS parent_id
    FROM suppliers sp
    JOIN accounting_settings s ON s.company_id = sp.company_id
    WHERE sp.chart_account_id IS NULL AND s.accounts_payable_account_id IS NOT NULL
    ORDER BY sp.company_id, sp.created_at
  LOOP
    SELECT code, type, normal_balance INTO parent FROM chart_accounts WHERE id = party.parent_id;
    SELECT COUNT(*) + 1 INTO seq FROM chart_accounts WHERE parent_id = party.parent_id;
    INSERT INTO chart_accounts (company_id, parent_id, code, name, type, normal_balance, is_active)
    VALUES (party.company_id, party.parent_id, parent.code || '-' || lpad(seq::text, 4, '0'), party.name, parent.type, parent.normal_balance, true)
    RETURNING id INTO new_id;
    UPDATE suppliers SET chart_account_id = new_id WHERE id = party.id;
  END LOOP;

  FOR party IN
    SELECT e.id, e.company_id, e.name, s.employee_payables_account_id AS parent_id
    FROM employees e
    JOIN accounting_settings s ON s.company_id = e.company_id
    WHERE e.chart_account_id IS NULL AND s.employee_payables_account_id IS NOT NULL
    ORDER BY e.company_id, e.created_at
  LOOP
    SELECT code, type, normal_balance INTO parent FROM chart_accounts WHERE id = party.parent_id;
    SELECT COUNT(*) + 1 INTO seq FROM chart_accounts WHERE parent_id = party.parent_id;
    INSERT INTO chart_accounts (company_id, parent_id, code, name, type, normal_balance, is_active)
    VALUES (party.company_id, party.parent_id, parent.code || '-' || lpad(seq::text, 4, '0'), party.name, parent.type, parent.normal_balance, true)
    RETURNING id INTO new_id;
    UPDATE employees SET chart_account_id = new_id WHERE id = party.id;
  END LOOP;
END $$;
