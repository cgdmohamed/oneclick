-- 0005: product image
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
