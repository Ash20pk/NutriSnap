#!/usr/bin/env python3
"""Backfill missing quantities in meals by estimating from calories"""
import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def backfill_quantities():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("BACKFILLING MISSING QUANTITIES FROM CALORIES")
    print("=" * 80)
    
    # Get all meals
    meals = await conn.fetch("SELECT id, foods FROM meals")
    
    # Get all foods for calorie lookup
    foods_data = await conn.fetch("SELECT id, calories_per_100g FROM foods WHERE calories_per_100g > 0")
    calories_by_id = {str(f['id']): f['calories_per_100g'] for f in foods_data}
    
    updated_count = 0
    food_items_fixed = 0
    
    for meal in meals:
        foods_json = meal['foods']
        if isinstance(foods_json, str):
            foods_json = json.loads(foods_json)
        
        modified = False
        for food_item in foods_json:
            if not isinstance(food_item, dict):
                continue
            
            # Skip if already has quantity
            if food_item.get('quantity') or food_item.get('displayQuantity'):
                continue
            
            # Try to estimate from calories
            food_calories = food_item.get('calories', 0)
            food_id = food_item.get('food_id')
            
            if food_calories > 0 and food_id and str(food_id) in calories_by_id:
                cal_per_100g = calories_by_id[str(food_id)]
                if cal_per_100g > 0:
                    # Estimate grams: food_calories / (cal_per_100g / 100)
                    estimated_grams = (food_calories / cal_per_100g) * 100
                    food_item['quantity'] = round(estimated_grams, 1)
                    food_item['displayQuantity'] = round(estimated_grams, 1)
                    food_item['displayUnit'] = 'g'
                    modified = True
                    food_items_fixed += 1
                    print(f"✓ {food_item.get('name')}: Estimated {estimated_grams:.1f}g from {food_calories} cal")
        
        if modified:
            await conn.execute(
                "UPDATE meals SET foods = $1 WHERE id = $2",
                json.dumps(foods_json),
                meal['id']
            )
            updated_count += 1
    
    print(f"\n{'='*80}")
    print(f"Backfill complete:")
    print(f"  Meals updated: {updated_count}/{len(meals)}")
    print(f"  Food items with estimated quantities: {food_items_fixed}")
    print(f"{'='*80}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(backfill_quantities())
