-- Migration 047: safe, additive fixes that do not require client sign-off
-- (invoice reference/PO fields, explicit per-line tax audit trail, a
-- customer code so each client can be tracked as a subsidiary-ledger
-- entity, and a client_id on journal lines so AR aging/statements can be
-- reported per customer without splitting the Accounts Receivable
-- control account in the chart of accounts).

-- 1) Invoice header: reference number / purchase-order number.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reference_number varchar(100),
  ADD COLUMN IF NOT EXISTS po_number varchar(100);

-- 2) Invoice items: explicit, stored audit trail per line so Net/Tax/Gross
--    can be read directly instead of re-derived, and a SKU snapshot so the
--    line still shows the code even if the product is renamed later.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS sku varchar(100),
  ADD COLUMN IF NOT EXISTS net_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(14,2) NOT NULL DEFAULT 0;

-- Backfill existing rows from line_total (gross before header-discount
-- allocation) so historical invoices get a reasonable value instead of 0.
UPDATE invoice_items
SET gross_amount = line_total,
    net_amount = ROUND(line_total / (1 + vat_rate / 100.0), 2),
    tax_amount = line_total - ROUND(line_total / (1 + vat_rate / 100.0), 2)
WHERE gross_amount = 0 AND line_total <> 0;

UPDATE invoice_items ii
SET sku = p.sku
FROM products p
WHERE ii.product_id = p.id AND ii.sku IS NULL AND p.sku IS NOT NULL;

-- 3) Customer code: a per-company sequence so every client is a distinct,
--    trackable subsidiary-ledger entity (matches its use in AR aging/
--    statement reports) without introducing a separate GL account per
--    customer.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS client_sequence integer NOT NULL DEFAULT 0;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS code varchar(30);

WITH numbered AS (
  SELECT id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
  FROM clients
  WHERE code IS NULL
)
UPDATE clients c
SET code = 'CUST-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
WHERE c.id = numbered.id;

UPDATE companies co
SET client_sequence = sub.max_seq
FROM (
  SELECT company_id, COUNT(*) AS max_seq FROM clients GROUP BY company_id
) sub
WHERE co.id = sub.company_id AND co.client_sequence < sub.max_seq;

CREATE UNIQUE INDEX IF NOT EXISTS clients_company_code_uq ON clients (company_id, code);

CREATE OR REPLACE FUNCTION assign_client_code() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_seq integer;
BEGIN
  IF NEW.code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  UPDATE companies SET client_sequence = client_sequence + 1
  WHERE id = NEW.company_id
  RETURNING client_sequence INTO next_seq;
  NEW.code := 'CUST-' || LPAD(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_client_code ON clients;
CREATE TRIGGER trg_assign_client_code
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION assign_client_code();

-- 4) Journal lines: tag the customer on AR-affecting lines so per-customer
--    aging/statement reports can filter journal_entry_lines directly,
--    without needing one GL account per customer.
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS journal_entry_lines_client_idx
  ON journal_entry_lines (company_id, client_id);
