DO $$
BEGIN
  CREATE TYPE credit_note_return_condition AS ENUM ('resellable', 'damaged', 'inspection', 'scrap');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE credit_note_items
  ADD COLUMN IF NOT EXISTS return_condition credit_note_return_condition NOT NULL DEFAULT 'resellable',
  ADD COLUMN IF NOT EXISTS return_to_stock BOOLEAN NOT NULL DEFAULT TRUE;
