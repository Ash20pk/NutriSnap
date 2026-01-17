-- 016_foods_unique_barcode.sql
-- Enforce uniqueness for foods.barcode (packaged food lookups)
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- Normalize barcode values (treat empty/whitespace as NULL)
UPDATE public.foods
SET barcode = NULLIF(btrim(barcode), '')
WHERE barcode IS NOT NULL AND barcode <> NULLIF(btrim(barcode), '');

-- Deduplicate rows with the same non-null barcode.
-- Keep the most recently created row and delete the rest.
WITH ranked AS (
  SELECT
    id,
    barcode,
    ROW_NUMBER() OVER (
      PARTITION BY barcode
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.foods
  WHERE barcode IS NOT NULL
)
DELETE FROM public.foods f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

-- Create/ensure a partial unique index on non-null barcodes
CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_barcode
  ON public.foods (barcode)
  WHERE barcode IS NOT NULL;
