-- Migration 045: Internal invoice attachments.
-- These fields are intentionally internal-only and are not exposed by public_get_invoice.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS internal_attachment_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS internal_attachment_text TEXT,
  ADD COLUMN IF NOT EXISTS internal_attachment_upload_id UUID REFERENCES uploads(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_internal_attachment_type_chk'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_internal_attachment_type_chk
      CHECK (
        internal_attachment_type IS NULL
        OR internal_attachment_type IN ('text', 'image')
      );
  END IF;
END $$;
