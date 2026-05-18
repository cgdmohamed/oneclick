-- Migration 020: Add email_change_requests table for two-step email change flow
CREATE TABLE IF NOT EXISTS email_change_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email    varchar(255) NOT NULL,
  token_hash   varchar(255) NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_change_requests_user_idx ON email_change_requests(user_id);
