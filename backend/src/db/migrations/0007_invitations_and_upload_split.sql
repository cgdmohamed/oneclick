-- SEC-05: Real invitation flow backed by a tokenised DB record.
-- Token is stored hashed (sha256) — the raw token only exists in the email
-- link and is shown once to the inviter when they create the invite.
DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending','accepted','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email            varchar(255) NOT NULL,
  full_name        varchar(120) NOT NULL,
  phone            varchar(30),
  role             app_role NOT NULL,
  token_hash       varchar(64)  NOT NULL UNIQUE,
  invited_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  status           invitation_status NOT NULL DEFAULT 'pending',
  accepted_at      timestamptz,
  accepted_user_id uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS invitations_company_idx ON invitations(company_id, invited_at DESC);
CREATE INDEX IF NOT EXISTS invitations_email_idx   ON invitations(lower(email));

-- SEC-04: Mark uploads as either public (logos/stamps embedded in public
-- invoices) or private (attachments). Backfill existing rows based on kind.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS disk_name varchar(255);
UPDATE uploads SET is_public = true WHERE kind IN ('logo','stamp');
-- Backfill disk_name from the existing url for legacy rows (basename only).
UPDATE uploads SET disk_name = regexp_replace(url, '^.*/', '')
 WHERE disk_name IS NULL AND url IS NOT NULL;
