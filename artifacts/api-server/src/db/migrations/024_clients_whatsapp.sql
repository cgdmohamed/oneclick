-- Migration 024: Add whatsapp column to clients table
-- Idempotent: uses ADD COLUMN IF NOT EXISTS
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp varchar(30);
