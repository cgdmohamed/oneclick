-- Migration 005: uploads disk_name and is_public columns
-- Adds disk_name (internal filesystem filename) and ensures is_public exists.
-- Both columns were added to the schema in Task #9 but never migrated to production.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS disk_name varchar(255);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
