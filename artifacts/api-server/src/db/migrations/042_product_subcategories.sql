ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID NULL REFERENCES product_categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS product_categories_parent_idx ON product_categories(company_id, parent_id);

CREATE OR REPLACE FUNCTION validate_product_category_parent()
RETURNS trigger AS $$
DECLARE
  parent_company UUID;
  grandparent_id UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'product category cannot be its own parent';
  END IF;

  SELECT company_id, parent_id INTO parent_company, grandparent_id
  FROM product_categories
  WHERE id = NEW.parent_id;

  IF parent_company IS NULL OR parent_company <> NEW.company_id THEN
    RAISE EXCEPTION 'parent category must belong to the same company';
  END IF;

  IF grandparent_id IS NOT NULL THEN
    RAISE EXCEPTION 'only two product category levels are supported';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_categories_parent_validate ON product_categories;
CREATE TRIGGER product_categories_parent_validate
BEFORE INSERT OR UPDATE OF parent_id, company_id ON product_categories
FOR EACH ROW EXECUTE FUNCTION validate_product_category_parent();
