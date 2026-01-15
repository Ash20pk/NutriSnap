#!/usr/bin/env python3
"""Check if meals have quantity data for foods"""
import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def check_quantities():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("CHECKING MEAL FOOD QUANTITIES")
    print("=" * 80)
    
    # Get recent meals
    meals = await conn.fetch("""
        SELECT id, foods, timestamp 
        FROM meals 
        ORDER BY timestamp DESC 
        LIMIT 5
    """)
    
    for meal in meals:
        print(f"\nMeal: {meal['id']} at {meal['timestamp']}")
        foods_json = meal['foods']
        if isinstance(foods_json, str):
            foods_json = json.loads(foods_json)
        
        print(f"  Foods count: {len(foods_json)}")
        for i, food in enumerate(foods_json):
            print(f"\n  Food {i+1}:")
            print(f"    Name: {food.get('name')}")
            print(f"    food_id: {food.get('food_id')}")
            print(f"    quantity: {food.get('quantity')}")
            print(f"    displayQuantity: {food.get('displayQuantity')}")
            print(f"    calories: {food.get('calories')}")
            
            if not food.get('quantity') and not food.get('displayQuantity'):
                print(f"    ⚠️  MISSING QUANTITY!")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_quantities())
