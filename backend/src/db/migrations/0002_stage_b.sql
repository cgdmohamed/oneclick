-- Stage B: monthly invoice counter + uploads metadata + helpful indexes.

CREATE TABLE IF NOT EXISTS uploads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  filename    varchar(255) NOT NULL,
  mime_type   varchar(100) NOT NULL,
  size        integer      NOT NULL,
  url         text         NOT NULL,
  kind        varchar(30),  -- 'logo' | 'stamp' | 'attachment'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_company_idx ON uploads(company_id);

-- Helpful index for monthly invoice limit checks
CREATE INDEX IF NOT EXISTS invoices_company_month_idx
  ON invoices (company_id, date_trunc('month', issue_date));

-- Helpful index for audit queries
CREATE INDEX IF NOT EXISTS audit_log_company_idx ON audit_log(company_id, created_at DESC);
