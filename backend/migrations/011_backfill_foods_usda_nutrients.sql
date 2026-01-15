-- 011_backfill_foods_usda_nutrients.sql
-- Backfill foods table with complete nutrient data from USDA payloads
-- This migration extracts nutrients from the raw_payload JSON field

-- Update foods with nutrients from USDA data
UPDATE foods f
SET 
    calories_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'calories'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Energy' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.calories_per_100g
    ),
    protein_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'protein'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Protein' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.protein_per_100g
    ),
    carbs_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'carbohydrates'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Carbohydrate, by difference' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.carbs_per_100g
    ),
    fat_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'fat'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Total lipid (fat)' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.fat_per_100g
    ),
    sugar_g_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'sugars'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Total Sugars' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.sugar_g_per_100g
    ),
    sodium_mg_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'sodium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Sodium, Na' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.sodium_mg_per_100g
    ),
    fiber_g_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'fiber'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Fiber, total dietary' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.fiber_g_per_100g
    ),
    saturated_fat_g_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'saturatedFat'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Fatty acids, total saturated' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.saturated_fat_g_per_100g
    ),
    trans_fat_g_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'transFat'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Fatty acids, total trans' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.trans_fat_g_per_100g
    ),
    cholesterol_mg_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'cholesterol'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Cholesterol' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.cholesterol_mg_per_100g
    ),
    potassium_mg_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'potassium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Potassium, K' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.potassium_mg_per_100g
    ),
    calcium_mg_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'calcium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Calcium, Ca' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.calcium_mg_per_100g
    ),
    iron_mg_per_100g = COALESCE(
        (f.raw_payload->'labelNutrients'->'iron'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric,
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Iron, Fe' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.iron_mg_per_100g
    ),
    vitamin_c_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin C%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_c_mg_per_100g
    ),
    vitamin_a_ug_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin A%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_a_ug_per_100g
    ),
    vitamin_d_ug_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin D%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_d_ug_per_100g
    ),
    vitamin_e_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin E%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_e_mg_per_100g
    ),
    vitamin_k_ug_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin K%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_k_ug_per_100g
    ),
    thiamin_b1_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Thiamin%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.thiamin_b1_mg_per_100g
    ),
    riboflavin_b2_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Riboflavin%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.riboflavin_b2_mg_per_100g
    ),
    niacin_b3_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Niacin%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.niacin_b3_mg_per_100g
    ),
    vitamin_b6_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin B-6%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_b6_mg_per_100g
    ),
    folate_ug_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Folate%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.folate_ug_per_100g
    ),
    vitamin_b12_ug_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' LIKE 'Vitamin B-12%' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.vitamin_b12_ug_per_100g
    ),
    magnesium_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Magnesium, Mg' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.magnesium_mg_per_100g
    ),
    phosphorus_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Phosphorus, P' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.phosphorus_mg_per_100g
    ),
    zinc_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Zinc, Zn' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.zinc_mg_per_100g
    ),
    copper_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Copper, Cu' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.copper_mg_per_100g
    ),
    manganese_mg_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Manganese, Mn' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.manganese_mg_per_100g
    ),
    selenium_ug_per_100g = COALESCE(
        CASE 
            WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
                (SELECT (n->>'amount')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
                 FROM jsonb_array_elements(f.raw_payload->'foodNutrients') AS n 
                 WHERE n->'nutrient'->>'name' = 'Selenium, Se' 
                 LIMIT 1)
            ELSE NULL
        END,
        f.selenium_ug_per_100g
    ),
    ingredients = COALESCE(
        f.raw_payload->>'ingredients',
        f.ingredients
    )
WHERE f.raw_payload IS NOT NULL
  AND jsonb_typeof(f.raw_payload) = 'object'
  AND f.raw_payload->>'servingSizeUnit' = 'g';

-- Report results
DO $$
DECLARE
  total_foods INTEGER;
  foods_with_usda INTEGER;
  updated_calories INTEGER;
  updated_protein INTEGER;
  updated_sugar INTEGER;
  updated_sodium INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_foods FROM foods;
  SELECT COUNT(*) INTO foods_with_usda FROM foods WHERE raw_payload IS NOT NULL;
  SELECT COUNT(*) INTO updated_calories FROM foods WHERE calories_per_100g > 0 AND raw_payload IS NOT NULL;
  SELECT COUNT(*) INTO updated_protein FROM foods WHERE protein_per_100g > 0 AND raw_payload IS NOT NULL;
  SELECT COUNT(*) INTO updated_sugar FROM foods WHERE sugar_g_per_100g > 0 AND raw_payload IS NOT NULL;
  SELECT COUNT(*) INTO updated_sodium FROM foods WHERE sodium_mg_per_100g > 0 AND raw_payload IS NOT NULL;
  
  RAISE NOTICE 'Foods backfill complete:';
  RAISE NOTICE '  Total foods: %', total_foods;
  RAISE NOTICE '  Foods with USDA data: %', foods_with_usda;
  RAISE NOTICE '  Updated calories: %', updated_calories;
  RAISE NOTICE '  Updated protein: %', updated_protein;
  RAISE NOTICE '  Updated sugar: %', updated_sugar;
  RAISE NOTICE '  Updated sodium: %', updated_sodium;
END $$;
