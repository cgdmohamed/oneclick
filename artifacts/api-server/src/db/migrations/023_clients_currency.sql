-- Migration 023: Add currency column to clients table
-- Idempotent: uses ADD COLUMN IF NOT EXISTS
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS currency varchar(10) NOT NULL DEFAULT 'SAR';
