-- Add onboarding_done flag to users table.
-- Tracks whether a user has completed (or dismissed) the onboarding wizard.
-- Stored server-side so completion is device-agnostic.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;
