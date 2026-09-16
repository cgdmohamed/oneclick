-- Server-side sequential numbering for credit/debit notes, matching the invoice sequence
-- (credit_note_number/debit_note_number were previously client-supplied and non-sequential).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_note_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS debit_note_sequence INTEGER NOT NULL DEFAULT 0;
