-- Migration 018: Add disabled flag to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
