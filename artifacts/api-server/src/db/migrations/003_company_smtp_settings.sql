-- Migration 003: per-tenant SMTP settings
-- Adds a jsonb column to store optional per-company SMTP override config.
-- The password inside the JSON is write-only (never returned by the API).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_settings jsonb;
