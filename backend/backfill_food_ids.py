#!/usr/bin/env python3
"""Backfill food_id references in existing meals by matching food names"""
import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def backfill_food_ids():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    # Remove pgbouncer param if present
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    # Use statement_cache_size=0 for pgbouncer compatibility
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("BACKFILLING FOOD_IDS IN MEALS")
    print("=" * 80)
    
    # Get all foods for name matching
    foods = await conn.fetch("SELECT id, name FROM foods")
    foods_by_name = {f['name'].lower().strip(): str(f['id']) for f in foods}
    print(f"\nLoaded {len(foods)} foods from database")
    
    # Get all meals
    meals = await conn.fetch("SELECT id, foods FROM meals")
    print(f"Found {len(meals)} meals to process\n")
    
    updated_count = 0
    food_items_matched = 0
    food_items_total = 0
    
    for meal in meals:
        meal_id = meal['id']
        foods_json = meal['foods']
        
        if isinstance(foods_json, str):
            try:
                foods_json = json.loads(foods_json)
            except:
                continue
        
        if not isinstance(foods_json, list):
            continue
        
        modified = False
        for food_item in foods_json:
            if not isinstance(food_item, dict):
                continue
            
            food_items_total += 1
            
            # Skip if already has food_id
            if food_item.get('food_id'):
                food_items_matched += 1
                continue
            
            # Try to match by name
            food_name = food_item.get('name', '').lower().strip()
            if food_name in foods_by_name:
                food_item['food_id'] = foods_by_name[food_name]
                modified = True
                food_items_matched += 1
                print(f"✓ Matched '{food_item.get('name')}' → {foods_by_name[food_name]}")
        
        # Update meal if any foods were matched
        if modified:
            await conn.execute(
                "UPDATE meals SET foods = $1 WHERE id = $2",
                json.dumps(foods_json),
                meal_id
            )
            updated_count += 1
    
    print("\n" + "=" * 80)
    print("BACKFILL COMPLETE")
    print("=" * 80)
    print(f"Meals updated: {updated_count}/{len(meals)}")
    print(f"Food items matched: {food_items_matched}/{food_items_total}")
    print(f"Match rate: {(food_items_matched/food_items_total*100) if food_items_total else 0:.1f}%")
    
    await conn.close()
    
    return updated_count > 0

if __name__ == "__main__":
    success = asyncio.run(backfill_food_ids())
    if success:
        print("\n✅ Backfill successful! Now refresh analytics to see micronutrient data.")
    else:
        print("\n⚠️  No meals were updated. Check if food names match exactly.")
