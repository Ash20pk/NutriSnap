"""
Backfill serving sizes for existing foods in the database.

Run once after applying migration 024_serving_sizes.sql:
    python backfill_serving_sizes.py

For each food that has no serving size entries yet, this script calls the OpenAI
API to generate common serving sizes and stores them in food_serving_sizes.

Set environment variables before running:
    DATABASE_URL=postgresql://...
    OPENAI_API_KEY=sk-...
    OPENAI_MODEL=gpt-4o            (optional, defaults to gpt-4o)
"""

import asyncio
import json
import logging
import os
import sys

import asyncpg
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

VALID_UNITS = {
    "piece", "katori", "cup", "tbsp", "tsp", "g", "oz", "ml",
    "serving", "slice", "medium", "large", "small", "plate",
}

SYSTEM_PROMPT = (
    "Return JSON ONLY with serving sizes for this food. "
    'Schema: {"serving_sizes": [{"unit_name": str, "unit_label": str, "grams": number, "is_default": bool}]}. '
    "unit_name must be one of: piece, katori, cup, tbsp, tsp, g, oz, ml, serving, slice, medium, large, small, plate. "
    "Include 1-3 most common serving sizes. Mark the most typical as is_default=true. "
    "grams is the weight of ONE unit. Never return grams <= 0."
)


async def generate_serving_sizes(client: AsyncOpenAI, food_name: str, model: str) -> list:
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": food_name},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content if response.choices else ""
    try:
        parsed = json.loads(content)
    except Exception:
        return []

    sizes = parsed.get("serving_sizes", [])
    if not isinstance(sizes, list):
        return []

    result = []
    for s in sizes:
        if not isinstance(s, dict):
            continue
        un = str(s.get("unit_name") or "").strip().lower()
        ul = str(s.get("unit_label") or "").strip()
        g = float(s.get("grams") or 0)
        if un not in VALID_UNITS or g <= 0:
            continue
        result.append({
            "unit_name": un,
            "unit_label": ul or f"1 {un}",
            "grams": g,
            "is_default": bool(s.get("is_default", False)),
        })
    return result


async def main():
    database_url = os.environ.get("DATABASE_URL")
    openai_key = os.environ.get("OPENAI_API_KEY")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")
    batch_size = int(os.environ.get("BATCH_SIZE", "50"))

    if not database_url:
        logger.error("DATABASE_URL is not set")
        sys.exit(1)
    if not openai_key:
        logger.error("OPENAI_API_KEY is not set")
        sys.exit(1)

    client = AsyncOpenAI(api_key=openai_key)
    pool = await asyncpg.create_pool(database_url, min_size=2, max_size=5)

    try:
        # Find foods that have no serving size entries yet
        foods = await pool.fetch(
            """
            SELECT f.id, f.name
            FROM foods f
            LEFT JOIN food_serving_sizes fss ON fss.food_id = f.id
            WHERE fss.food_id IS NULL
            ORDER BY f.created_at ASC
            LIMIT $1
            """,
            batch_size,
        )

        logger.info(f"Found {len(foods)} foods without serving sizes")

        success = 0
        skipped = 0

        for food in foods:
            food_id = food["id"]
            food_name = food["name"]
            try:
                sizes = await generate_serving_sizes(client, food_name, model)
                if not sizes:
                    logger.warning(f"No sizes generated for '{food_name}'")
                    skipped += 1
                    continue

                async with pool.acquire() as conn:
                    for s in sizes:
                        await conn.execute(
                            """
                            INSERT INTO food_serving_sizes (food_id, unit_name, unit_label, grams, is_default)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (food_id, unit_name) DO NOTHING
                            """,
                            food_id,
                            s["unit_name"],
                            s["unit_label"],
                            float(s["grams"]),
                            bool(s["is_default"]),
                        )

                logger.info(f"Stored {len(sizes)} serving sizes for '{food_name}'")
                success += 1

                # Small delay to stay within rate limits
                await asyncio.sleep(0.3)

            except Exception as e:
                logger.error(f"Failed to process '{food_name}': {e}")
                skipped += 1

        logger.info(f"Done. success={success}, skipped={skipped}")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
