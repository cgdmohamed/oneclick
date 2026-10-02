-- Migration 054: TOTP two-factor authentication and Google social login.
--
-- 2FA columns:
--   totp_secret         — the confirmed, active secret (base32). NULL until 2FA is enabled.
--   totp_pending_secret — a freshly generated secret awaiting confirmation via /2fa/enable.
--                         Kept separate from totp_secret so a user who starts setup but never
--                         confirms never gets locked out of their own account.
--   totp_enabled         — whether login currently requires a TOTP code.
--   totp_backup_codes    — array of SHA-256 hashes of one-time recovery codes (never store
--                          the plaintext codes; they're shown to the user once at enable time).
--
-- Google login:
--   google_id — the Google account's stable subject id ("sub" claim), used to link/find
--               the user on sign-in. NULL for accounts that have never used Google login.
--               Unique so one Google account can't be linked to two local users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret         varchar(64),
  ADD COLUMN IF NOT EXISTS totp_pending_secret  varchar(64),
  ADD COLUMN IF NOT EXISTS totp_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_backup_codes    text[],
  ADD COLUMN IF NOT EXISTS google_id            varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_uq ON users (google_id) WHERE google_id IS NOT NULL;
