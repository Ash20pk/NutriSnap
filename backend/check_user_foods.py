#!/usr/bin/env python3
"""Check which foods the user actually ate and if they have micronutrient data"""
import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def check_user_foods():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("CHECKING USER'S ACTUAL FOODS")
    print("=" * 80)
    
    # Get recent meals
    meals = await conn.fetch("""
        SELECT id, foods, timestamp 
        FROM meals 
        ORDER BY timestamp DESC 
        LIMIT 10
    """)
    
    # Extract all unique food_ids
    food_ids = set()
    for meal in meals:
        foods_json = meal['foods']
        if isinstance(foods_json, str):
            foods_json = json.loads(foods_json)
        
        for f in foods_json:
            if f.get('food_id'):
                food_ids.add(f['food_id'])
    
    print(f"\nFound {len(food_ids)} unique foods in recent meals")
    
    # Check micronutrient data for these foods
    if food_ids:
        foods_data = await conn.fetch("""
            SELECT 
                id, name,
                sugar_g_per_100g,
                calcium_mg_per_100g,
                vitamin_c_mg_per_100g,
                vitamin_a_ug_per_100g,
                iron_mg_per_100g,
                zinc_mg_per_100g,
                source,
                verified
            FROM foods
            WHERE id = ANY($1::uuid[])
        """, list(food_ids))
        
        print("\nMicronutrient status of user's foods:")
        print("-" * 80)
        
        foods_with_data = 0
        foods_without_data = []
        
        for food in foods_data:
            has_micros = any([
                food['sugar_g_per_100g'],
                food['calcium_mg_per_100g'],
                food['vitamin_c_mg_per_100g'],
                food['vitamin_a_ug_per_100g'],
                food['iron_mg_per_100g'],
                food['zinc_mg_per_100g']
            ])
            
            if has_micros:
                foods_with_data += 1
                print(f"✅ {food['name']:<30} (source: {food['source']}, verified: {food['verified']})")
                print(f"   Sugar: {food['sugar_g_per_100g']}g, Calcium: {food['calcium_mg_per_100g']}mg, Vit C: {food['vitamin_c_mg_per_100g']}mg")
            else:
                foods_without_data.append(food)
                print(f"❌ {food['name']:<30} (source: {food['source']}, verified: {food['verified']}) - NO MICRONUTRIENT DATA")
        
        print("\n" + "=" * 80)
        print(f"Summary: {foods_with_data}/{len(foods_data)} foods have micronutrient data")
        print("=" * 80)
        
        if foods_without_data:
            print(f"\n⚠️  {len(foods_without_data)} foods need USDA enrichment:")
            for food in foods_without_data:
                print(f"   - {food['name']} (ID: {food['id']})")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_user_foods())
