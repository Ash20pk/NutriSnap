-- 003_foods_micronutrients.sql
-- Add micronutrients support to foods table (per 100g) + flexible JSONB store.
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- All values are PER 100g unless otherwise stated.
-- Unit conventions:
--  - grams: g
--  - milligrams: mg
--  - micrograms: ug

ALTER TABLE public.foods
  -- Core macro-adjacent fields often used in premium insights
  ADD COLUMN IF NOT EXISTS fiber_g_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS sugar_g_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS saturated_fat_g_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS trans_fat_g_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS cholesterol_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS sodium_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS potassium_mg_per_100g double precision NULL,

  -- Vitamins (common + useful for premium scoring)
  ADD COLUMN IF NOT EXISTS vitamin_a_ug_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS vitamin_c_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS vitamin_d_ug_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS vitamin_e_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS vitamin_k_ug_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS thiamin_b1_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS riboflavin_b2_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS niacin_b3_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS vitamin_b6_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS folate_ug_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS vitamin_b12_ug_per_100g double precision NULL,

  -- Minerals
  ADD COLUMN IF NOT EXISTS calcium_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS iron_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS magnesium_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS phosphorus_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS zinc_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS copper_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS manganese_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS selenium_ug_per_100g double precision NULL,

  -- Optional extras often available from USDA
  ADD COLUMN IF NOT EXISTS caffeine_mg_per_100g double precision NULL,
  ADD COLUMN IF NOT EXISTS alcohol_g_per_100g double precision NULL,

  -- Flexible store for any remaining nutrients from providers
  ADD COLUMN IF NOT EXISTS nutrients_jsonb jsonb NULL;

-- Helpful index for querying presence of micronutrients (optional but useful)
CREATE INDEX IF NOT EXISTS idx_foods_has_micros
  ON public.foods (
    (fiber_g_per_100g IS NOT NULL),
    (sodium_mg_per_100g IS NOT NULL),
    (vitamin_c_mg_per_100g IS NOT NULL),
    (iron_mg_per_100g IS NOT NULL)
  );

-- Comments
COMMENT ON COLUMN public.foods.nutrients_jsonb IS 'Provider-specific nutrients payload normalized to per 100g where possible';
COMMENT ON COLUMN public.foods.fiber_g_per_100g IS 'Dietary fiber (g) per 100g';
COMMENT ON COLUMN public.foods.sodium_mg_per_100g IS 'Sodium (mg) per 100g';
COMMENT ON COLUMN public.foods.vitamin_a_ug_per_100g IS 'Vitamin A (ug) per 100g';
COMMENT ON COLUMN public.foods.vitamin_d_ug_per_100g IS 'Vitamin D (ug) per 100g';
COMMENT ON COLUMN public.foods.saturated_fat_g_per_100g IS 'Saturated fat (g) per 100g';
