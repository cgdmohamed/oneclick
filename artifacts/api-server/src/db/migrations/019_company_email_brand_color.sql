-- Migration 019: Add per-company email brand color override
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email_brand_color text;
