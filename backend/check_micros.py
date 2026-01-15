#!/usr/bin/env python3
"""Diagnostic script to check micronutrient data availability"""
import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def check_micronutrients():
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
    print("MICRONUTRIENT DATA DIAGNOSTIC")
    print("=" * 80)
    
    # Check 1: Do foods have micronutrient data?
    print("\n1. Checking foods table for micronutrient data...")
    foods_count = await conn.fetchval("SELECT COUNT(*) FROM foods")
    print(f"   Total foods in database: {foods_count}")
    
    foods_with_micros = await conn.fetchval("""
        SELECT COUNT(*) FROM foods 
        WHERE sugar_g_per_100g IS NOT NULL 
           OR calcium_mg_per_100g IS NOT NULL 
           OR vitamin_c_mg_per_100g IS NOT NULL
    """)
    print(f"   Foods with at least one micronutrient: {foods_with_micros}")
    print(f"   → {(foods_with_micros/foods_count*100) if foods_count else 0:.1f}% of foods have micronutrient data")
    
    # Get a sample food
    sample_food = await conn.fetchrow("""
        SELECT name, sugar_g_per_100g, calcium_mg_per_100g, vitamin_c_mg_per_100g, 
               vitamin_a_ug_per_100g, iron_mg_per_100g, zinc_mg_per_100g
        FROM foods 
        WHERE sugar_g_per_100g IS NOT NULL OR calcium_mg_per_100g IS NOT NULL
        LIMIT 1
    """)
    if sample_food:
        print(f"\n   Sample food with micros: {sample_food['name']}")
        print(f"   - Sugar: {sample_food['sugar_g_per_100g']}g/100g")
        print(f"   - Calcium: {sample_food['calcium_mg_per_100g']}mg/100g")
        print(f"   - Vitamin C: {sample_food['vitamin_c_mg_per_100g']}mg/100g")
        print(f"   - Vitamin A: {sample_food['vitamin_a_ug_per_100g']}µg/100g")
        print(f"   - Iron: {sample_food['iron_mg_per_100g']}mg/100g")
        print(f"   - Zinc: {sample_food['zinc_mg_per_100g']}mg/100g")
    else:
        print("   ⚠️  NO FOODS HAVE MICRONUTRIENT DATA!")
    
    # Check 2: Do meals have food_id references?
    print("\n2. Checking meals for food_id references...")
    recent_meal = await conn.fetchrow("""
        SELECT id, foods, timestamp 
        FROM meals 
        ORDER BY timestamp DESC 
        LIMIT 1
    """)
    
    if recent_meal:
        print(f"   Most recent meal: {recent_meal['id']} at {recent_meal['timestamp']}")
        foods_json = recent_meal['foods']
        if isinstance(foods_json, str):
            foods_json = json.loads(foods_json)
        
        print(f"   Foods in meal: {len(foods_json)}")
        foods_with_ids = sum(1 for f in foods_json if f.get('food_id'))
        print(f"   Foods with food_id: {foods_with_ids}")
        
        if foods_json:
            sample_food_item = foods_json[0]
            print(f"\n   Sample food item from meal:")
            print(f"   - Name: {sample_food_item.get('name', 'N/A')}")
            print(f"   - Has food_id: {'Yes' if sample_food_item.get('food_id') else '❌ NO'}")
            if sample_food_item.get('food_id'):
                print(f"   - food_id: {sample_food_item['food_id']}")
            print(f"   - Quantity: {sample_food_item.get('quantity', 'N/A')}g")
    else:
        print("   ⚠️  NO MEALS FOUND!")
    
    # Check 3: Test micronutrient computation for one meal
    if recent_meal and foods_with_ids > 0:
        print("\n3. Testing micronutrient computation for this meal...")
        food_ids = [f.get('food_id') for f in foods_json if f.get('food_id')]
        if food_ids:
            # Try to fetch micronutrients for these food IDs
            food_micros = await conn.fetch("""
                SELECT id, name, sugar_g_per_100g, calcium_mg_per_100g, vitamin_c_mg_per_100g
                FROM foods
                WHERE id = ANY($1::uuid[])
            """, food_ids)
            
            print(f"   Found {len(food_micros)} foods in database")
            if food_micros:
                for fm in food_micros[:3]:  # Show first 3
                    print(f"   - {fm['name']}: sugar={fm['sugar_g_per_100g']}, calcium={fm['calcium_mg_per_100g']}, vitC={fm['vitamin_c_mg_per_100g']}")
    
    print("\n" + "=" * 80)
    print("DIAGNOSIS:")
    print("=" * 80)
    
    if foods_with_micros == 0:
        print("❌ PROBLEM: Foods table has NO micronutrient data!")
        print("   → Need to run USDA enrichment or migration to populate micronutrients")
    elif foods_with_ids == 0:
        print("❌ PROBLEM: Meals don't have food_id references!")
        print("   → Meals were likely logged before food_id tracking was implemented")
    else:
        print("✅ Data looks OK - issue may be in code logic or cache")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_micronutrients())
