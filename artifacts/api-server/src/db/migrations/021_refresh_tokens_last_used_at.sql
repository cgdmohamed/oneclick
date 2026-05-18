-- Migration 021: Add last_used_at to refresh_tokens for session "last active" tracking
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
