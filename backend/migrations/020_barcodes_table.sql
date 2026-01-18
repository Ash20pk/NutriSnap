-- Dedicated barcodes table for packaged food products
-- This is separate from the foods table (which is for generic/regional foods)
-- Stores data from OpenFoodFacts + user contributions

CREATE TABLE IF NOT EXISTS barcodes (
    barcode text PRIMARY KEY,

    -- Product info
    product_name text NOT NULL,
    brand text,
    image_url text,

    -- Nutrition per 100g
    calories_per_100g numeric NOT NULL DEFAULT 0,
    protein_per_100g numeric NOT NULL DEFAULT 0,
    carbs_per_100g numeric NOT NULL DEFAULT 0,
    fat_per_100g numeric NOT NULL DEFAULT 0,
    fiber_g_per_100g numeric,
    sugar_g_per_100g numeric,
    sodium_mg_per_100g numeric,

    -- Ingredients
    ingredients text,

    -- Source tracking
    source text NOT NULL DEFAULT 'openfoodfacts', -- 'openfoodfacts', 'user_contribution', 'manual'
    source_updated_at timestamptz,

    -- Verification status
    verified boolean NOT NULL DEFAULT false,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_barcodes_source ON barcodes(source);
CREATE INDEX IF NOT EXISTS idx_barcodes_verified ON barcodes(verified);
CREATE INDEX IF NOT EXISTS idx_barcodes_updated_at ON barcodes(updated_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_barcodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS barcodes_updated_at ON barcodes;
CREATE TRIGGER barcodes_updated_at
    BEFORE UPDATE ON barcodes
    FOR EACH ROW
    EXECUTE FUNCTION update_barcodes_updated_at();

-- Comment
COMMENT ON TABLE barcodes IS 'Central database for packaged food products identified by barcode. Populated from OpenFoodFacts and user contributions.';
