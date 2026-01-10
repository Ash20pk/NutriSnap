-- Inspect foods table to check which nutrient columns are populated
SELECT 
  id,
  name,
  category,
  source,
  external_id,
  sync_status,
  last_synced_at,
  -- Macros
  calories_per_100g,
  protein_per_100g,
  carbs_per_100g,
  fat_per_100g,
  -- Micronutrients
  fiber_g_per_100g,
  sugar_g_per_100g,
  saturated_fat_g_per_100g,
  trans_fat_g_per_100g,
  sodium_mg_per_100g,
  potassium_mg_per_100g,
  vitamin_c_mg_per_100g,
  iron_mg_per_100g,
  calcium_mg_per_100g,
  -- Raw payload (first 200 chars to see structure)
  LEFT(raw_payload::text, 200) as raw_payload_preview
FROM foods
WHERE sync_status = 'ok'
LIMIT 3;
