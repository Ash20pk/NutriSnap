#!/usr/bin/env python3
"""Queue user's foods for USDA enrichment and process them"""
import asyncio
import asyncpg
import os
import sys
from dotenv import load_dotenv

# Add parent directory to path to import server modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

async def enrich_user_foods():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        return
    
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
    
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    
    print("=" * 80)
    print("ENRICHING USER FOODS WITH USDA DATA")
    print("=" * 80)
    
    # Get user-created foods without micronutrient data
    foods_to_enrich = await conn.fetch("""
        SELECT id, name
        FROM foods
        WHERE source = 'user'
          AND (sugar_g_per_100g IS NULL OR calcium_mg_per_100g IS NULL)
    """)
    
    print(f"\nFound {len(foods_to_enrich)} user foods needing enrichment")
    
    if not foods_to_enrich:
        print("✅ All user foods already have micronutrient data!")
        await conn.close()
        return
    
    # Queue them for enrichment
    queued = 0
    for food in foods_to_enrich:
        try:
            await conn.execute("""
                INSERT INTO foods_ingestion_queue (food_id, query, status)
                VALUES ($1, $2, 'ready')
                ON CONFLICT (food_id) 
                DO UPDATE SET 
                    status = 'ready',
                    updated_at = now()
            """, food['id'], food['name'])
            print(f"  Queued: {food['name']}")
            queued += 1
        except Exception as e:
            print(f"  ⚠️  Failed to queue {food['name']}: {e}")
    
    print(f"\n✅ Queued {queued}/{len(foods_to_enrich)} foods for USDA enrichment")
    print("\nNow processing queue with USDA API...")
    
    # Import and run the enrichment worker
    from server import _process_foods_ingestion_queue, _require_pool
    
    # This will use the USDA API to enrich the foods
    results = await _process_foods_ingestion_queue()
    
    print(f"\n{results}")
    
    await conn.close()
    
    print("\n" + "=" * 80)
    print("ENRICHMENT COMPLETE")
    print("=" * 80)
    print("Now refresh your Analytics screen to see micronutrient data!")

if __name__ == "__main__":
    asyncio.run(enrich_user_foods())
