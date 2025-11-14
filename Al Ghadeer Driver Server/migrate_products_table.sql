-- =====================================================
-- MIGRATE PRODUCTS TABLE SCRIPT
-- =====================================================
-- This script updates the existing products table to match the new schema

-- Add missing columns to existing products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Update existing data to have proper values
UPDATE products SET 
    price = selling_price,
    unit = CASE 
        WHEN type = '5L' THEN '5L Bottle'
        WHEN type = '10L' THEN '10L Bottle'
        WHEN type = '300ml' THEN '300ml Bottle'
        WHEN type = '1L' THEN '1L Bottle'
        WHEN type = '20L' THEN '20L Bottle'
        WHEN type = 'dispenser' THEN 'Water Dispenser'
        ELSE type
    END,
    category = CASE 
        WHEN type IN ('5L', '10L', '300ml', '1L', '20L') THEN 'Water Bottles'
        WHEN type = 'dispenser' THEN 'Accessories'
        ELSE 'Other'
    END,
    is_active = TRUE
WHERE price IS NULL OR unit IS NULL OR category IS NULL;

-- Make price and unit NOT NULL after updating existing data
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
ALTER TABLE products ALTER COLUMN unit SET NOT NULL;
ALTER TABLE products ALTER COLUMN category SET NOT NULL;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_available_stock ON products(available_stock);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Verify the migration
SELECT 'Migration completed successfully!' as status;
SELECT COUNT(*) as total_products FROM products;
SELECT name, price, unit, available_stock, category, is_active FROM products ORDER BY category, name;
