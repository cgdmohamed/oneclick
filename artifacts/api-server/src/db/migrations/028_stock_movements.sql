CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_id  UUID REFERENCES invoices(id) ON DELETE SET NULL,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity    NUMERIC(12,3) NOT NULL,
  reason      VARCHAR(200),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_movements_company_idx   ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx   ON stock_movements(company_id, product_id);
CREATE INDEX IF NOT EXISTS stock_movements_invoice_idx   ON stock_movements(invoice_id);
