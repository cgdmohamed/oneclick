-- Migration 056: dedup log for bell-notification summary alerts.
--
-- Backs tickBellAlerts() (jobs/bellAlerts.ts): a unique row per
-- (company_id, alert_type, alert_date) guards against sending the same
-- summary notification more than once per day for the same company, even
-- though the job itself runs hourly.

CREATE TABLE IF NOT EXISTS bell_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type VARCHAR(30) NOT NULL, -- 'overdue_invoices' | 'low_stock'
  alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, alert_type, alert_date)
);
