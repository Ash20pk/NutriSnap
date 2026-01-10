-- 002_foods_global.sql
-- Evolve foods table to support a global food directory.
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- Add global catalog fields
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS source text NULL,
  ADD COLUMN IF NOT EXISTS external_id text NULL,
  ADD COLUMN IF NOT EXISTS brand text NULL,
  ADD COLUMN IF NOT EXISTS barcode text NULL,
  ADD COLUMN IF NOT EXISTS language text NULL,
  ADD COLUMN IF NOT EXISTS region text NULL,
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS ingredients text NULL,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

-- Keep name_hindi for backward compatibility, but it becomes just another localized name.
-- (We will later migrate localization into a separate table if needed.)

-- Helpful indexes for global search and lookups
CREATE INDEX IF NOT EXISTS idx_foods_name_lower
  ON public.foods (lower(name));

CREATE INDEX IF NOT EXISTS idx_foods_brand_lower
  ON public.foods (lower(brand));

CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_source_external_id
  ON public.foods (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_barcode
  ON public.foods (barcode)
  WHERE barcode IS NOT NULL;

-- Optional: relax India-specific uniqueness (name+category) for global catalog.
-- Many different foods across sources can share the same name+category.
-- Drop the old unique index if it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'uq_foods_name_category'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.uq_foods_name_category';
  END IF;
END $$;

-- Add a non-unique index instead (still useful for filtering)
CREATE INDEX IF NOT EXISTS idx_foods_name_category
  ON public.foods (lower(name), category);

-- Comments
COMMENT ON COLUMN public.foods.source IS 'Data source for the food item (e.g. openfoodfacts, usda, manual)';
COMMENT ON COLUMN public.foods.external_id IS 'Provider-specific ID (e.g. USDA fdcId, OpenFoodFacts product code)';
COMMENT ON COLUMN public.foods.barcode IS 'Product barcode (EAN/UPC) for packaged foods';
COMMENT ON COLUMN public.foods.verified IS 'If true, nutrition data has been validated/curated';
