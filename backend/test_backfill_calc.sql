-- Test query to verify backfill calculations
-- Run this after the backfill migration to check the math

SELECT 
    name,
    raw_payload->>'servingSize' as serving_size,
    raw_payload->>'servingSizeUnit' as serving_unit,
    -- Original USDA values (per serving) from labelNutrients
    (f.raw_payload->'labelNutrients'->'calories'->>'value')::numeric as usda_calories_per_serving,
    (f.raw_payload->'labelNutrients'->'protein'->>'value')::numeric as usda_protein_per_serving,
    (f.raw_payload->'labelNutrients'->'sugars'->>'value')::numeric as usda_sugar_per_serving,
    (f.raw_payload->'labelNutrients'->'sodium'->>'value')::numeric as usda_sodium_per_serving,
    (f.raw_payload->'labelNutrients'->'iron'->>'value')::numeric as usda_iron_per_serving,
    (f.raw_payload->'labelNutrients'->'calcium'->>'value')::numeric as usda_calcium_per_serving,
    -- Our calculated per-100g values
    calories_per_100g,
    protein_per_100g,
    sugar_g_per_100g,
    sodium_mg_per_100g,
    iron_mg_per_100g,
    calcium_mg_per_100g,
    vitamin_c_mg_per_100g,
    -- Verify the math for key nutrients
    CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'calories'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END as calculated_calories_per_100g,
    CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'protein'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END as calculated_protein_per_100g,
    CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'sugars'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END as calculated_sugar_per_100g,
    CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'sodium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END as calculated_sodium_per_100g,
    CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'iron'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END as calculated_iron_per_100g,
    CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'calcium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END as calculated_calcium_per_100g,
    -- Check if our values match the calculation
    (calories_per_100g = CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'calories'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END) as calories_match,
    (protein_per_100g = CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'protein'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END) as protein_match,
    (sugar_g_per_100g = CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'sugars'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END) as sugar_match,
    (sodium_mg_per_100g = CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'sodium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END) as sodium_match,
    (iron_mg_per_100g = CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'iron'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END) as iron_match,
    (calcium_mg_per_100g = CASE 
        WHEN f.raw_payload->>'servingSizeUnit' = 'g' THEN
            (f.raw_payload->'labelNutrients'->'calcium'->>'value')::numeric * 100.0 / (f.raw_payload->>'servingSize')::numeric
        ELSE NULL
    END) as calcium_match
FROM foods f
WHERE f.raw_payload IS NOT NULL 
  AND f.raw_payload->>'servingSizeUnit' = 'g'
LIMIT 5;
