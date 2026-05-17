-- 007: Add review_status, review_notes, reviewed_at, reviewed_by to companies
-- Supports the admin Approvals workflow (pending / approved / declined).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS review_status  VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_notes   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL;
