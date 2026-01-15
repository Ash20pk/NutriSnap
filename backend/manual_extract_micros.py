#!/usr/bin/env python3
"""Manually extract micronutrients from raw_payload for specific foods"""
import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def extract_micros():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("MANUALLY EXTRACTING MICRONUTRIENTS FROM RAW_PAYLOAD")
    print("=" * 80)
    
    # Get foods with raw_payload but no micronutrients
    foods = await conn.fetch("""
        SELECT id, name, raw_payload
        FROM foods
        WHERE raw_payload IS NOT NULL
          AND (sugar_g_per_100g IS NULL OR calcium_mg_per_100g IS NULL)
    """)
    
    print(f"\nFound {len(foods)} foods with raw_payload needing extraction\n")
    
    updated = 0
    for food in foods:
        payload = food['raw_payload']
        if isinstance(payload, str):
            payload = json.loads(payload)
        
        nutrients = payload.get('foodNutrients', [])
        if not nutrients:
            print(f"⚠️  {food['name']}: No foodNutrients in payload")
            continue
        
        # Extract micronutrients
        micros = {}
        for n in nutrients:
            name = (n.get('nutrient', {}).get('name') or n.get('nutrientName', '')).lower()
            amount = n.get('amount') or n.get('value')
            
            if 'total sugars' in name or name == 'sugars, total':
                micros['sugar_g_per_100g'] = float(amount) if amount else None
            elif 'sodium' in name:
                micros['sodium_mg_per_100g'] = float(amount) if amount else None
            elif 'fiber, total dietary' in name or name == 'fiber, total':
                micros['fiber_g_per_100g'] = float(amount) if amount else None
            elif 'calcium' in name:
                micros['calcium_mg_per_100g'] = float(amount) if amount else None
            elif 'iron' in name:
                micros['iron_mg_per_100g'] = float(amount) if amount else None
            elif 'vitamin c' in name or 'ascorbic acid' in name:
                micros['vitamin_c_mg_per_100g'] = float(amount) if amount else None
            elif 'vitamin a' in name and 'iu' not in name:
                micros['vitamin_a_ug_per_100g'] = float(amount) if amount else None
            elif 'vitamin d' in name and 'd2' not in name and 'd3' not in name:
                micros['vitamin_d_ug_per_100g'] = float(amount) if amount else None
            elif 'vitamin e' in name:
                micros['vitamin_e_mg_per_100g'] = float(amount) if amount else None
            elif 'vitamin k' in name:
                micros['vitamin_k_ug_per_100g'] = float(amount) if amount else None
            elif 'zinc' in name:
                micros['zinc_mg_per_100g'] = float(amount) if amount else None
            elif 'magnesium' in name:
                micros['magnesium_mg_per_100g'] = float(amount) if amount else None
            elif 'potassium' in name:
                micros['potassium_mg_per_100g'] = float(amount) if amount else None
            elif 'phosphorus' in name:
                micros['phosphorus_mg_per_100g'] = float(amount) if amount else None
            elif 'cholesterol' in name:
                micros['cholesterol_mg_per_100g'] = float(amount) if amount else None
            elif 'fatty acids, total saturated' in name:
                micros['saturated_fat_g_per_100g'] = float(amount) if amount else None
            elif 'fatty acids, total trans' in name:
                micros['trans_fat_g_per_100g'] = float(amount) if amount else None
            elif 'thiamin' in name:
                micros['thiamin_b1_mg_per_100g'] = float(amount) if amount else None
            elif 'riboflavin' in name:
                micros['riboflavin_b2_mg_per_100g'] = float(amount) if amount else None
            elif 'niacin' in name:
                micros['niacin_b3_mg_per_100g'] = float(amount) if amount else None
            elif 'vitamin b-6' in name or 'pyridoxine' in name:
                micros['vitamin_b6_mg_per_100g'] = float(amount) if amount else None
            elif 'folate' in name and 'dfe' not in name:
                micros['folate_ug_per_100g'] = float(amount) if amount else None
            elif 'vitamin b-12' in name or 'cobalamin' in name:
                micros['vitamin_b12_ug_per_100g'] = float(amount) if amount else None
            elif 'selenium' in name:
                micros['selenium_ug_per_100g'] = float(amount) if amount else None
            elif 'copper' in name:
                micros['copper_mg_per_100g'] = float(amount) if amount else None
            elif 'manganese' in name:
                micros['manganese_mg_per_100g'] = float(amount) if amount else None
        
        if micros:
            # Build UPDATE query
            set_clauses = [f"{k} = ${i+2}" for i, k in enumerate(micros.keys())]
            values = [food['id']] + list(micros.values())
            
            await conn.execute(
                f"UPDATE foods SET {', '.join(set_clauses)} WHERE id = $1",
                *values
            )
            print(f"✅ {food['name']}: Updated {len(micros)} micronutrients")
            updated += 1
        else:
            print(f"⚠️  {food['name']}: No micronutrients extracted")
    
    print(f"\n{'='*80}")
    print(f"Extraction complete: {updated}/{len(foods)} foods updated")
    print(f"{'='*80}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(extract_micros())
