-- Backs the "Invoice Alerts" settings panel with a real per-company store
-- and an idempotency log so the scheduled job never double-sends a
-- reminder for the same invoice/event.

CREATE TABLE IF NOT EXISTS invoice_alert_settings (
  company_id  UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  settings    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_alert_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  event       VARCHAR(20) NOT NULL CHECK (event IN ('onDueSoon','onOverdue','onPaid')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_alert_log_lookup_idx
  ON invoice_alert_log(invoice_id, event, sent_at DESC);
