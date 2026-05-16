-- SEC-01/02: refresh token rotation + reuse detection
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id uuid,
  ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS ip text;

-- Backfill family_id for existing rows so each is its own family
UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens(token_hash);
