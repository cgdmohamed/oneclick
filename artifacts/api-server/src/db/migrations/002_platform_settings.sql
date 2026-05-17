-- Migration 002: platform_settings key/value store
-- Stores super-admin–controlled platform configuration: branding, landing page
-- content, and tracking/analytics IDs. One row per key.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        varchar(100) PRIMARY KEY,
  value      jsonb        NOT NULL DEFAULT '{}',
  updated_at timestamptz  NOT NULL DEFAULT now()
);
