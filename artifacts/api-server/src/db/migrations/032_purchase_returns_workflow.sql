ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS original_purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS return_number VARCHAR(50);
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE purchase_returns
SET original_purchase_invoice_id = COALESCE(original_purchase_invoice_id, purchase_invoice_id),
    return_number = COALESCE(return_number, number)
WHERE original_purchase_invoice_id IS NULL OR return_number IS NULL;

ALTER TABLE purchase_returns ALTER COLUMN return_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_company_return_number_uq
  ON purchase_returns(company_id, return_number);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity           NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_cost          NUMERIC(14,4) NOT NULL DEFAULT 0,
  vat_rate           NUMERIC(5,2) NOT NULL DEFAULT 15,
  line_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity > 0),
  CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS purchase_return_items_product_idx ON purchase_return_items(company_id, product_id);
