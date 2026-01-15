-- 010_backfill_meals_analytics.sql
-- Backfill existing meals with foods and micros JSON fields for analytics
-- This migration is safe to run multiple times

-- Backfill foods JSON with enriched structure for existing meals
UPDATE meals m
SET foods = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', COALESCE(f->>'name', 'Unknown'),
      'calories', COALESCE((f->>'calories')::numeric, 0),
      'protein', COALESCE((f->>'protein')::numeric, 0),
      'carbs', COALESCE((f->>'carbs')::numeric, 0),
      'fat', COALESCE((f->>'fat')::numeric, 0),
      'sugar', COALESCE((f->>'sugar')::numeric, 0),
      'sodium', COALESCE((f->>'sodium')::numeric, 0),
      'trans_fat', COALESCE((f->>'trans_fat')::numeric, 0),
      'saturated_fat', COALESCE((f->>'saturated_fat')::numeric, 0),
      'ingredients', COALESCE(f->'ingredients', '[]'::jsonb)
    )
  )
  FROM jsonb_array_elements(m.foods) AS f
)
WHERE 
  jsonb_typeof(m.foods) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(m.foods) AS f 
    WHERE f ? 'sugar' AND f ? 'sodium'
  );

-- Backfill micros JSON for existing meals (aggregate from foods)
UPDATE meals m
SET micros = (
  SELECT jsonb_build_object(
    'sodium_mg', COALESCE(SUM((f->>'sodium')::numeric), 0),
    'sugar_g', COALESCE(SUM((f->>'sugar')::numeric), 0),
    'fiber_g', COALESCE(SUM((f->>'fiber')::numeric), 0),
    'saturated_fat_g', COALESCE(SUM((f->>'saturated_fat')::numeric), 0),
    'potassium_mg', COALESCE(SUM((f->>'potassium')::numeric), 0),
    'calcium_mg', COALESCE(SUM((f->>'calcium')::numeric), 0),
    'iron_mg', COALESCE(SUM((f->>'iron')::numeric), 0),
    'vitamin_c_mg', COALESCE(SUM((f->>'vitamin_c')::numeric), 0)
  )
  FROM jsonb_array_elements(m.foods) AS f
)
WHERE 
  jsonb_typeof(m.foods) = 'array'
  AND (m.micros IS NULL OR jsonb_typeof(m.micros) != 'object');

-- Ensure timestamp is set for meals without it
UPDATE meals 
SET timestamp = COALESCE(timestamp, now())
WHERE timestamp IS NULL OR timestamp = '1970-01-01T00:00:00Z'::timestamptz;

-- Ensure meal_type is set for meals without it
UPDATE meals 
SET meal_type = COALESCE(NULLIF(meal_type, ''), 'other')
WHERE meal_type IS NULL OR meal_type = '';

-- Report results
DO $$
DECLARE
  total_meals INTEGER;
  enriched_foods INTEGER;
  enriched_micros INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_meals FROM meals;
  SELECT COUNT(*) INTO enriched_foods FROM meals WHERE jsonb_typeof(foods) = 'array' AND jsonb_array_length(foods) > 0;
  SELECT COUNT(*) INTO enriched_micros FROM meals WHERE jsonb_typeof(micros) = 'object';
  
  RAISE NOTICE 'Backfill complete:';
  RAISE NOTICE '  Total meals: %', total_meals;
  RAISE NOTICE '  Meals with foods JSON: %', enriched_foods;
  RAISE NOTICE '  Meals with micros JSON: %', enriched_micros;
END $$;
