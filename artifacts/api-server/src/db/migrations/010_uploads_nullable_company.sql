-- Make uploads.company_id nullable so platform-level (super admin) uploads
-- are not tied to any company. Existing rows are unaffected.

-- Drop the old NOT NULL + CASCADE foreign key
ALTER TABLE uploads
  DROP CONSTRAINT IF EXISTS uploads_company_id_fkey;

-- Add it back as nullable with SET NULL on company delete
ALTER TABLE uploads
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE uploads
  ADD CONSTRAINT uploads_company_id_fkey
    FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE SET NULL;
