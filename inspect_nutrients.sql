-- Get full raw_payload to see complete nutrient structure
SELECT 
  name,
  jsonb_pretty(raw_payload) as full_payload
FROM foods
WHERE sync_status = 'ok'
  AND name = 'Dal Makhani'
LIMIT 1;
