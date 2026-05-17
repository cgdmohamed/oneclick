-- 009: Fix companies.reviewed_by type — change VARCHAR(200) to UUID FK.
-- Migration 007 incorrectly created the column as VARCHAR(200).
-- This patch drops the old column and recreates it as UUID.
-- NOTE: This is destructive — any existing VARCHAR values in reviewed_by
-- are discarded. In practice the column was always NULL before any admin
-- approval action was performed, so no real data is lost.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'reviewed_by'
      AND data_type IN ('character varying', 'varchar')
  ) THEN
    ALTER TABLE companies DROP COLUMN reviewed_by;
    ALTER TABLE companies ADD COLUMN reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END;
$$;
