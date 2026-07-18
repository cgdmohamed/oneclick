ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS sales_returns_account_id UUID REFERENCES chart_accounts(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS credit_notes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  original_invoice_id   UUID REFERENCES invoices(id) ON DELETE SET NULL,
  credit_note_number    VARCHAR(50) NOT NULL,
  credit_note_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at             TIMESTAMPTZ,
  posted_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  journal_entry_id      UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_company_number_uq ON credit_notes(company_id, credit_note_number);
CREATE INDEX IF NOT EXISTS credit_notes_company_idx ON credit_notes(company_id, credit_note_date);
CREATE INDEX IF NOT EXISTS credit_notes_customer_idx ON credit_notes(company_id, customer_id);
CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx ON credit_notes(company_id, original_invoice_id);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  credit_note_id           UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  product_id               UUID REFERENCES products(id) ON DELETE SET NULL,
  description              TEXT NOT NULL,
  quantity                 NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price               NUMERIC(14,4) NOT NULL DEFAULT 0,
  vat_rate                 NUMERIC(5,2) NOT NULL DEFAULT 15,
  line_total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  original_invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS credit_note_items_note_idx ON credit_note_items(credit_note_id);
CREATE INDEX IF NOT EXISTS credit_note_items_product_idx ON credit_note_items(company_id, product_id);
