#!/usr/bin/env python3
"""Inspect actual data stored in foods table"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def inspect_foods():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("INSPECTING USDA-ENRICHED FOODS")
    print("=" * 80)
    
    # Get the 4 foods that were just enriched
    foods = await conn.fetch("""
        SELECT 
            id, name, source, verified,
            calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
            fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
            calcium_mg_per_100g, iron_mg_per_100g, vitamin_c_mg_per_100g,
            vitamin_a_ug_per_100g, zinc_mg_per_100g, magnesium_mg_per_100g,
            external_id, raw_payload IS NOT NULL as has_raw_payload
        FROM foods
        WHERE name IN ('aloo paratha', 'boiled eggs', 'cali burrito', 'Cheese Quesadilla')
        ORDER BY name
    """)
    
    for food in foods:
        print(f"\n{'='*80}")
        print(f"Food: {food['name']}")
        print(f"Source: {food['source']}, Verified: {food['verified']}")
        print(f"External ID: {food['external_id']}")
        print(f"Has raw_payload: {food['has_raw_payload']}")
        print(f"\nMacros:")
        print(f"  Calories: {food['calories_per_100g']} | Protein: {food['protein_per_100g']}g | Carbs: {food['carbs_per_100g']}g | Fat: {food['fat_per_100g']}g")
        print(f"\nMicros:")
        print(f"  Fiber: {food['fiber_g_per_100g']}g | Sugar: {food['sugar_g_per_100g']}g | Sodium: {food['sodium_mg_per_100g']}mg")
        print(f"  Calcium: {food['calcium_mg_per_100g']}mg | Iron: {food['iron_mg_per_100g']}mg | Vit C: {food['vitamin_c_mg_per_100g']}mg")
        print(f"  Vit A: {food['vitamin_a_ug_per_100g']}µg | Zinc: {food['zinc_mg_per_100g']}mg | Magnesium: {food['magnesium_mg_per_100g']}mg")
    
    # Check if raw_payload has micronutrient data that wasn't extracted
    sample = await conn.fetchrow("""
        SELECT name, raw_payload
        FROM foods
        WHERE name = 'boiled eggs'
        LIMIT 1
    """)
    
    if sample and sample['raw_payload']:
        import json
        payload = sample['raw_payload']
        if isinstance(payload, str):
            payload = json.loads(payload)
        
        print(f"\n{'='*80}")
        print(f"RAW PAYLOAD for 'boiled eggs':")
        print(f"{'='*80}")
        
        if 'foodNutrients' in payload:
            print(f"\nFound {len(payload['foodNutrients'])} nutrients in raw payload:")
            for nutrient in payload['foodNutrients'][:10]:  # Show first 10
                nutrient_name = nutrient.get('nutrient', {}).get('name') or nutrient.get('nutrientName')
                amount = nutrient.get('amount') or nutrient.get('value')
                unit = nutrient.get('nutrient', {}).get('unitName') or nutrient.get('unitName')
                print(f"  - {nutrient_name}: {amount} {unit}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(inspect_foods())
