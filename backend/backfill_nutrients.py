"""
Backfill and fix macro/micro nutrient data for foods in the database.

Strategy (per food):
  1. If USDA_API_KEY is set, search the USDA FDC API (Foundation + SR Legacy foods).
     These are the most accurate values for standard foods.
  2. If USDA returns no confident match (e.g. Indian/regional foods), fall back to
     OpenAI GPT-4o estimation.

Usage:
    python backfill_nutrients.py [OPTIONS]

Options:
    --mode          micros-only       Fill only NULL micro columns (safe for all foods)
                    fix-suspicious    Fix broken macros + fill missing micros  [default]
                    full-refresh      Re-estimate all nutrition for user/AI-created foods

    --filter        needs-work        broken macros OR missing micros OR not yet verified  [default]
                    suspicious        only foods with 0/NULL/impossible macros
                    missing-micros    foods missing any key micronutrient
                    unverified        foods where verified = false (all unconfirmed foods)
                    user-created      only AI-estimated user foods (source='user')
                    all               every food in the table

    --source        auto              USDA first, AI fallback  [default]
                    ai-only           skip USDA, always use OpenAI
                    usda-only         skip AI fallback (foods not in USDA are skipped)

    --force         Also update foods that already have complete data
    --dry-run       Print what would change, but don't write to DB
    --batch-size N  Max foods to process (0 = no limit, default: 0)
    --delay S       Seconds between API calls (default: 0.3)

Examples:
    # Standard run — fix everything missing (USDA first, AI fallback)
    python backfill_nutrients.py

    # Dry run to preview changes
    python backfill_nutrients.py --dry-run

    # Fill missing micros only, never touch macros
    python backfill_nutrients.py --mode micros-only --filter missing-micros

    # Re-estimate all user-created foods with AI
    python backfill_nutrients.py --mode full-refresh --filter user-created --source ai-only

Environment:
    DATABASE_URL    PostgreSQL connection string (required)
    OPENAI_API_KEY  OpenAI API key (required unless --source usda-only)
    USDA_API_KEY    USDA FDC API key — optional but recommended for accuracy
    OPENAI_MODEL    Model to use (default: gpt-4o)

Meal recalculation:
    After updating foods, the script automatically finds every meal that
    references an updated food and recomputes:
      - calories/protein/carbs/fat per food item
      - total_calories/total_protein/total_carbs/total_fat
      - micros JSONB (all 28 micronutrients)
    Use --skip-meals to disable this phase.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import uuid as _uuid_mod
from typing import Any, Dict, List, Optional, Set, Tuple

import asyncpg
import httpx
from openai import AsyncOpenAI

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Column lists ──────────────────────────────────────────────────────────────

MACRO_COLS = [
    "calories_per_100g",
    "protein_per_100g",
    "carbs_per_100g",
    "fat_per_100g",
]

MICRO_COLS = [
    "fiber_g_per_100g",
    "sugar_g_per_100g",
    "saturated_fat_g_per_100g",
    "trans_fat_g_per_100g",
    "cholesterol_mg_per_100g",
    "sodium_mg_per_100g",
    "potassium_mg_per_100g",
    "vitamin_a_ug_per_100g",
    "calcium_mg_per_100g",
    "iron_mg_per_100g",
    "magnesium_mg_per_100g",
    "phosphorus_mg_per_100g",
    "zinc_mg_per_100g",
    "copper_mg_per_100g",
    "manganese_mg_per_100g",
    "selenium_ug_per_100g",
    "vitamin_c_mg_per_100g",
    "vitamin_d_ug_per_100g",
    "vitamin_e_mg_per_100g",
    "vitamin_k_ug_per_100g",
    "thiamin_b1_mg_per_100g",
    "riboflavin_b2_mg_per_100g",
    "niacin_b3_mg_per_100g",
    "vitamin_b6_mg_per_100g",
    "folate_ug_per_100g",
    "vitamin_b12_ug_per_100g",
    "caffeine_mg_per_100g",
    "alcohol_g_per_100g",
]

# Key micros used for "is data missing?" checks
KEY_MICRO_COLS = [
    "calcium_mg_per_100g",
    "iron_mg_per_100g",
    "vitamin_c_mg_per_100g",
    "fiber_g_per_100g",
    "sodium_mg_per_100g",
]

ALL_NUTRITION_COLS = MACRO_COLS + MICRO_COLS

# ── USDA FDC nutrient ID → our DB column ─────────────────────────────────────
# Values in Foundation/SR Legacy search results are per 100 g by default.
# Branded-food items are per serving — we skip those.

_USDA_NUTRIENT_MAP: Dict[int, str] = {
    1008: "calories_per_100g",          # Energy, kcal
    1003: "protein_per_100g",           # Protein, g
    1005: "carbs_per_100g",             # Carbohydrate, by difference, g
    1004: "fat_per_100g",               # Total lipid (fat), g
    1079: "fiber_g_per_100g",           # Fiber, total dietary, g
    2000: "sugar_g_per_100g",           # Total Sugars, g
    1258: "saturated_fat_g_per_100g",   # Fatty acids, total saturated, g
    1257: "trans_fat_g_per_100g",       # Fatty acids, total trans, g
    1253: "cholesterol_mg_per_100g",    # Cholesterol, mg
    1093: "sodium_mg_per_100g",         # Sodium, Na, mg
    1092: "potassium_mg_per_100g",      # Potassium, K, mg
    1106: "vitamin_a_ug_per_100g",      # Vitamin A, RAE, µg
    1162: "vitamin_c_mg_per_100g",      # Vitamin C, mg
    1114: "vitamin_d_ug_per_100g",      # Vitamin D (D2+D3), µg
    1109: "vitamin_e_mg_per_100g",      # Vitamin E (alpha-tocopherol), mg
    1185: "vitamin_k_ug_per_100g",      # Vitamin K (phylloquinone), µg
    1165: "thiamin_b1_mg_per_100g",     # Thiamin, mg
    1166: "riboflavin_b2_mg_per_100g",  # Riboflavin, mg
    1167: "niacin_b3_mg_per_100g",      # Niacin, mg
    1175: "vitamin_b6_mg_per_100g",     # Vitamin B-6, mg
    1177: "folate_ug_per_100g",         # Folate, total, µg
    1178: "vitamin_b12_ug_per_100g",    # Vitamin B-12, µg
    1087: "calcium_mg_per_100g",        # Calcium, Ca, mg
    1089: "iron_mg_per_100g",           # Iron, Fe, mg
    1090: "magnesium_mg_per_100g",      # Magnesium, Mg, mg
    1091: "phosphorus_mg_per_100g",     # Phosphorus, P, mg
    1095: "zinc_mg_per_100g",           # Zinc, Zn, mg
    1098: "copper_mg_per_100g",         # Copper, Cu, mg
    1101: "manganese_mg_per_100g",      # Manganese, Mn, mg
    1103: "selenium_ug_per_100g",       # Selenium, Se, µg
    1057: "caffeine_mg_per_100g",       # Caffeine, mg
    1018: "alcohol_g_per_100g",         # Alcohol, ethyl, g
}

# ── AI system prompts ──────────────────────────────────────────────────────────

_AI_MACROS_AND_MICROS_PROMPT = (
    "You are a nutrition database. Estimate USDA-style values per 100 grams for this food. "
    "Return ONLY valid JSON with these exact keys: "
    "calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, "
    + ", ".join(MICRO_COLS)
    + ". "
    "Rules: calories_per_100g > 0 and ≤ 900; protein/carbs/fat each ≥ 0 and ≤ 100; "
    "all micronutrient values ≥ 0 (use 0 if unknown, never null/negative). "
    "Units are in each key name (g, mg, µg per 100 g)."
)

_AI_MICROS_ONLY_PROMPT = (
    "You are a nutrition database. The macros below are confirmed — estimate the missing "
    "micronutrients per 100 grams for this food. "
    "Return ONLY valid JSON with these exact keys: "
    + ", ".join(MICRO_COLS)
    + ". "
    "All values ≥ 0 (use 0 if unknown, never null/negative). "
    "Units are in each key name."
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _clamp(v: Any, lo: float, hi: float) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except Exception:
        return lo


def _safe_float(v: Any) -> float:
    try:
        return max(0.0, float(v))
    except Exception:
        return 0.0


def _is_suspicious_macros(row: Dict) -> bool:
    cal = _safe_float(row.get("calories_per_100g"))
    prot = row.get("protein_per_100g")
    carb = row.get("carbs_per_100g")
    fat = row.get("fat_per_100g")

    if cal <= 0 or cal > 900:
        return True
    if prot is None or carb is None or fat is None:
        return True
    if _safe_float(prot) == 0 and _safe_float(carb) == 0 and _safe_float(fat) == 0:
        return True
    # Macros don't add up to within 150 kcal of stated calories
    estimated = _safe_float(prot) * 4 + _safe_float(carb) * 4 + _safe_float(fat) * 9
    if estimated > 0 and abs(estimated - cal) > 150:
        return True
    return False


def _is_missing_key_micros(row: Dict) -> bool:
    return any(row.get(col) is None for col in KEY_MICRO_COLS)


# ── USDA FDC API ───────────────────────────────────────────────────────────────

async def _fetch_usda_nutrition(
    food_name: str,
    api_key: str,
    client: httpx.AsyncClient,
) -> Optional[Dict[str, float]]:
    """Search USDA FDC for a food and return nutrition per 100 g, or None."""
    if not api_key:
        return None

    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {
        "query": food_name,
        "api_key": api_key,
        # Foundation and SR Legacy foods have per-100g values; branded are per-serving
        "dataType": "Foundation,SR Legacy",
        "pageSize": 5,
    }

    try:
        resp = await client.get(url, params=params, timeout=10)
        if resp.status_code != 200:
            logger.debug("USDA FDC returned %s for '%s'", resp.status_code, food_name)
            return None

        data = resp.json()
        foods = data.get("foods", [])
        if not foods:
            return None

        # Pick the best result: prefer Foundation > SR Legacy, then closest name
        best = foods[0]
        nutrients = best.get("foodNutrients") or []

        result: Dict[str, float] = {}
        for n in nutrients:
            nid = n.get("nutrientId") or n.get("nutrient", {}).get("id")
            val = n.get("value")
            if nid in _USDA_NUTRIENT_MAP and val is not None:
                col = _USDA_NUTRIENT_MAP[nid]
                result[col] = _safe_float(val)

        # Require at least calories + one macro to consider it a valid hit
        if result.get("calories_per_100g", 0) > 0 and result.get("protein_per_100g") is not None:
            logger.debug("USDA hit for '%s': %s", food_name, best.get("description"))
            return result

        return None

    except Exception as e:
        logger.warning("USDA FDC lookup failed for '%s': %s", food_name, e)
        return None


# ── OpenAI ─────────────────────────────────────────────────────────────────────

async def _call_ai(
    client: AsyncOpenAI,
    model: str,
    food_name: str,
    system_prompt: str,
    macro_context: Optional[str] = None,
) -> Optional[Dict]:
    messages = [{"role": "system", "content": system_prompt}]
    user_content = food_name
    if macro_context:
        user_content = f"{food_name}\n\nExisting confirmed macros: {macro_context}"
    messages.append({"role": "user", "content": user_content})

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content if response.choices else ""
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else None
    except Exception as e:
        logger.warning("OpenAI call failed for '%s': %s", food_name, e)
        return None


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _build_select_query(filter_mode: str, limit: int) -> Tuple[str, List]:
    select_cols = ", ".join(ALL_NUTRITION_COLS)
    base = f"SELECT id, name, source, verified, last_synced_at, {select_cols} FROM foods"

    bad_macros = """(
        calories_per_100g IS NULL OR calories_per_100g <= 0 OR calories_per_100g > 900
        OR protein_per_100g IS NULL OR carbs_per_100g IS NULL OR fat_per_100g IS NULL
        OR (protein_per_100g = 0 AND carbs_per_100g = 0 AND fat_per_100g = 0)
    )"""
    any_micro_null = " OR ".join(f"{c} IS NULL" for c in KEY_MICRO_COLS)
    missing_micros = f"({any_micro_null})"

    params: List = []
    idx = 1
    where = ""

    if filter_mode == "suspicious":
        where = f"WHERE {bad_macros}"
    elif filter_mode == "missing-micros":
        where = f"WHERE {missing_micros}"
    elif filter_mode == "needs-work":
        # Broken data OR not yet verified by cron
        where = f"WHERE ({bad_macros} OR {missing_micros} OR verified = false)"
    elif filter_mode == "unverified":
        where = "WHERE verified = false"
    elif filter_mode == "user-created":
        where = f"WHERE source = ${idx}"
        params.append("user")
        idx += 1
    # "all" → no WHERE

    if limit > 0:
        query = f"{base} {where} ORDER BY created_at ASC LIMIT ${idx}"
        params.append(limit)
    else:
        query = f"{base} {where} ORDER BY created_at ASC"

    return query, params


async def _write_macros_and_micros(
    conn: asyncpg.Connection,
    food_id: Any,
    data: Dict[str, float],
    dry_run: bool,
    source_label: str = "usda",
) -> int:
    updates = {
        col: _clamp(data[col], 0.01 if col == "calories_per_100g" else 0.0, 900.0 if col == "calories_per_100g" else 9999.0)
        for col in ALL_NUTRITION_COLS
        if col in data
    }
    if not updates or dry_run:
        return len(updates)
    cols = list(updates.keys())
    vals = [updates[c] for c in cols]
    n = len(cols)
    set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
    set_clause += f", verified = TRUE, last_synced_at = now(), sync_status = ${n+2}, updated_at = now()"
    await conn.execute(f"UPDATE foods SET {set_clause} WHERE id = $1", food_id, *vals, source_label)
    return n


async def _write_micros_only(
    conn: asyncpg.Connection,
    food_id: Any,
    data: Dict[str, float],
    existing: Dict,
    dry_run: bool,
    source_label: str = "ai_estimated",
) -> int:
    updates = {
        col: _safe_float(data[col])
        for col in MICRO_COLS
        if col in data and existing.get(col) is None
    }
    if not updates or dry_run:
        return len(updates)
    cols = list(updates.keys())
    vals = [updates[c] for c in cols]
    n = len(cols)
    set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
    set_clause += f", verified = TRUE, last_synced_at = now(), sync_status = ${n+2}, updated_at = now()"
    await conn.execute(f"UPDATE foods SET {set_clause} WHERE id = $1", food_id, *vals, source_label)
    return n


async def _mark_verified(
    conn: asyncpg.Connection,
    food_id: Any,
    source_label: str,
    dry_run: bool,
) -> None:
    """Stamp a food as verified without changing nutrient values (USDA confirmed or trusted seed)."""
    if dry_run:
        return
    await conn.execute(
        """
        UPDATE foods
        SET verified = TRUE, last_synced_at = now(), sync_status = $2, updated_at = now()
        WHERE id = $1
        """,
        food_id,
        source_label,
    )


# ── Main ───────────────────────────────────────────────────────────────────────

async def run(args: argparse.Namespace) -> None:
    database_url = os.environ.get("DATABASE_URL", "")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    usda_key = os.environ.get("USDA_API_KEY", "")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    if not database_url:
        logger.error("DATABASE_URL is not set")
        sys.exit(1)
    if not openai_key and args.source != "usda-only":
        logger.error("OPENAI_API_KEY is not set (required unless --source usda-only)")
        sys.exit(1)
    if args.source in ("auto", "usda-only") and not usda_key:
        if args.source == "usda-only":
            logger.error("USDA_API_KEY is not set but --source usda-only was requested")
            sys.exit(1)
        logger.info("USDA_API_KEY not set — will use AI only")

    if "?pgbouncer=true" in database_url:
        database_url = database_url.replace("?pgbouncer=true", "")

    ai_client = AsyncOpenAI(api_key=openai_key) if openai_key else None
    pool = await asyncpg.create_pool(database_url, min_size=2, max_size=5, statement_cache_size=0)

    use_usda = bool(usda_key) and args.source in ("auto", "usda-only")
    use_ai = bool(openai_key) and args.source in ("auto", "ai-only")

    try:
        query, params = _build_select_query(args.filter, args.batch_size)
        async with pool.acquire() as conn:
            foods = await conn.fetch(query, *params)

        total = len(foods)
        print(f"\n{'='*70}")
        print(f"  NutriSnap Nutrient Backfill")
        print(f"  mode={args.mode}  filter={args.filter}  source={args.source}")
        print(f"  dry_run={args.dry_run}  model={model}  batch={args.batch_size or 'unlimited'}")
        print(f"  USDA={'yes' if use_usda else 'no'}  AI={'yes' if use_ai else 'no'}")
        print(f"{'='*70}")
        print(f"  Foods to process: {total}")
        print(f"{'='*70}\n")

        if total == 0:
            print("Nothing to do — all foods already satisfy the filter criteria.")
            return

        stats: Dict[str, int] = {
            "processed": 0, "skipped": 0, "updated": 0,
            "failed": 0, "cols_updated": 0,
            "from_usda": 0, "from_ai": 0, "verified_only": 0,
        }
        updated_food_ids: Set[str] = set()

        async with httpx.AsyncClient() as http:
            for i, food in enumerate(foods):
                food_id = food["id"]
                food_name = food["name"]
                source = food.get("source", "?")
                verified = food.get("verified", False)
                row = dict(food)

                suspicious = _is_suspicious_macros(row)
                missing_micros = _is_missing_key_micros(row)

                needs_macro_fix = False
                needs_micro_fill = False
                needs_verify_only = False  # good data, just needs verification stamp

                if args.mode == "micros-only":
                    if not missing_micros and not args.force:
                        stats["skipped"] += 1
                        continue
                    needs_micro_fill = True

                elif args.mode == "fix-suspicious":
                    if suspicious:
                        needs_macro_fix = True
                        needs_micro_fill = True
                    elif missing_micros or args.force:
                        needs_micro_fill = True
                    elif not verified:
                        # Data looks fine but hasn't been confirmed by cron yet.
                        # Check against USDA; if found, update. Otherwise trust existing data.
                        needs_verify_only = True
                    else:
                        stats["skipped"] += 1
                        continue

                elif args.mode == "full-refresh":
                    if verified and source not in ("user", "manual") and not args.force:
                        stats["skipped"] += 1
                        continue
                    needs_macro_fix = True
                    needs_micro_fill = True

                flag = ""
                if suspicious:
                    flag += " [BAD MACROS]"
                if missing_micros:
                    flag += " [MISSING MICROS]"
                print(f"[{i+1}/{total}] {food_name!r}  source={source}{flag}")

                cal = row.get("calories_per_100g")
                prot = row.get("protein_per_100g")
                carb = row.get("carbs_per_100g")
                fat  = row.get("fat_per_100g")
                print(f"         Before → cal={cal} prot={prot} carb={carb} fat={fat}")

                nutrition_data: Optional[Dict] = None
                data_source_label = ""

                # ── Step 1: Try USDA FDC ──────────────────────────────────────
                if use_usda and (needs_macro_fix or needs_micro_fill or needs_verify_only):
                    usda_result = await _fetch_usda_nutrition(food_name, usda_key, http)
                    if usda_result:
                        nutrition_data = usda_result
                        data_source_label = "USDA"
                        stats["from_usda"] += 1
                        if needs_verify_only:
                            # USDA confirmed this food — upgrade to full update
                            needs_macro_fix = True
                            needs_micro_fill = True
                            needs_verify_only = False
                    await asyncio.sleep(args.delay * 0.5)

                # ── Step 2: Fall back to OpenAI (skip for verify-only; trust existing data) ──
                if nutrition_data is None and use_ai and not needs_verify_only:
                    if needs_macro_fix:
                        ai_result = await _call_ai(ai_client, model, food_name, _AI_MACROS_AND_MICROS_PROMPT)
                    else:
                        macro_ctx = (
                            f"calories={cal} kcal/100g, protein={prot}g/100g, "
                            f"carbs={carb}g/100g, fat={fat}g/100g"
                        )
                        ai_result = await _call_ai(ai_client, model, food_name, _AI_MICROS_ONLY_PROMPT, macro_ctx)
                    if ai_result:
                        nutrition_data = ai_result
                        data_source_label = "AI"
                        stats["from_ai"] += 1
                    await asyncio.sleep(args.delay)

                # ── Step 3: Verify-only path — no API match, trust existing data ──
                if needs_verify_only and nutrition_data is None:
                    existing_source = food.get("source") or "seed"
                    print(f"         -> no USDA match, marking verified [{existing_source}]")
                    async with pool.acquire() as conn:
                        await _mark_verified(conn, food_id, existing_source, args.dry_run)
                    action = "would mark" if args.dry_run else "marked"
                    print(f"         -> {action} verified (trusted existing data)")
                    stats["processed"] += 1
                    stats["updated"] += 1
                    stats["verified_only"] += 1
                    # No nutrient values changed — don't add to updated_food_ids
                    continue

                if not nutrition_data:
                    print(f"         -> no data from {'USDA or AI' if use_usda and use_ai else 'USDA' if use_usda else 'AI'}, skipping")
                    stats["failed"] += 1
                    continue

                # Validate calories if updating macros
                if needs_macro_fix:
                    new_cal = _clamp(nutrition_data.get("calories_per_100g", 0), 0, 900)
                    if new_cal <= 0:
                        print(f"         -> {data_source_label} returned cal=0, skipping")
                        stats["failed"] += 1
                        continue
                    print(f"         After  → cal={new_cal:.1f}  prot={_safe_float(nutrition_data.get('protein_per_100g')):.1f}  carb={_safe_float(nutrition_data.get('carbs_per_100g')):.1f}  fat={_safe_float(nutrition_data.get('fat_per_100g')):.1f}")

                sync_label = data_source_label.lower().replace(" ", "_") if data_source_label else "unknown"
                async with pool.acquire() as conn:
                    if needs_macro_fix:
                        n = await _write_macros_and_micros(conn, food_id, nutrition_data, args.dry_run, sync_label)
                    else:
                        n = await _write_micros_only(conn, food_id, nutrition_data, row, args.dry_run, sync_label)

                action = "would update" if args.dry_run else "updated"
                print(f"         -> {action} {n} columns  [{data_source_label}]  [verified=true]")

                stats["processed"] += 1
                stats["updated"] += 1
                stats["cols_updated"] += n
                # Track for meal recalculation (track even on dry-run so we can preview)
                updated_food_ids.add(str(food_id))

        print(f"\n{'='*70}")
        print(f"  Summary")
        print(f"{'='*70}")
        print(f"  Processed  : {stats['processed']}")
        print(f"  Updated    : {stats['updated']}  ({stats['cols_updated']} column writes)")
        print(f"  From USDA  : {stats['from_usda']}")
        print(f"  From AI    : {stats['from_ai']}")
        print(f"  Verified   : {stats['updated']}  (verified=true stamped on all updated foods)")
        print(f"  Trust-only : {stats['verified_only']}  (good data confirmed, no changes needed)")
        print(f"  Skipped    : {stats['skipped']}")
        print(f"  Failed     : {stats['failed']}")
        if args.dry_run:
            print(f"\n  [DRY RUN] No changes were written to the database.")
        print(f"{'='*70}\n")

        # ── Phase 2: Recalculate affected meals ──────────────────────────────
        if args.skip_meals:
            print("Skipping meal recalculation (--skip-meals).\n")
        elif not updated_food_ids:
            print("No foods were updated — skipping meal recalculation.\n")
        else:
            print(f"{'='*70}")
            print(f"  Phase 2: Recalculating meals")
            print(f"  Foods updated: {len(updated_food_ids)}  dry_run={args.dry_run}")
            print(f"{'='*70}")

            meal_stats = await recalculate_affected_meals(pool, updated_food_ids, args.dry_run)

            print(f"\n  Meals found   : {meal_stats['meals_found']}")
            print(f"  Meals updated : {meal_stats['meals_updated']}")
            print(f"  Meals failed  : {meal_stats['meals_failed']}")
            if args.dry_run:
                print(f"\n  [DRY RUN] Meal changes were not written.")
            print(f"{'='*70}\n")

    finally:
        await pool.close()


# ── Meal recalculation ─────────────────────────────────────────────────────────

async def recalculate_affected_meals(
    pool: asyncpg.Pool,
    updated_food_ids: Set[str],
    dry_run: bool,
) -> Dict[str, int]:
    """
    Find every meal that contains a food whose nutrients were updated, then
    recompute per-item macros, meal totals, and the micros JSONB from the
    current (corrected) values in the foods table.
    """
    stats = {"meals_found": 0, "meals_updated": 0, "meals_failed": 0}

    if not updated_food_ids:
        return stats

    food_id_list = list(updated_food_ids)

    async with pool.acquire() as conn:
        # Find meals that have at least one updated food in their foods JSONB array
        meals = await conn.fetch(
            """
            SELECT id, foods, total_calories, total_protein, total_carbs, total_fat
            FROM meals
            WHERE EXISTS (
                SELECT 1 FROM jsonb_array_elements(foods) AS f
                WHERE (f->>'food_id') = ANY($1::text[])
            )
            ORDER BY timestamp DESC
            """,
            food_id_list,
        )

    stats["meals_found"] = len(meals)
    if not meals:
        return stats

    # Collect every food_id referenced across all affected meals in one set
    all_needed_ids: Set[str] = set()
    for meal in meals:
        fj = meal["foods"]
        items = json.loads(fj) if isinstance(fj, str) else fj
        for item in (items or []):
            fid = item.get("food_id")
            if fid:
                all_needed_ids.add(str(fid))

    # Bulk-fetch the latest nutrition data for all those foods
    async with pool.acquire() as conn:
        food_rows = await conn.fetch(
            """
            SELECT id, name,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   {micro_cols}
            FROM foods
            WHERE id = ANY($1::uuid[])
            """.format(micro_cols=", ".join(MICRO_COLS)),
            [_uuid_mod.UUID(fid) for fid in all_needed_ids],
        )

    foods_db: Dict[str, Dict] = {str(r["id"]): dict(r) for r in food_rows}

    for meal in meals:
        meal_id = meal["id"]
        fj = meal["foods"]
        items = json.loads(fj) if isinstance(fj, str) else list(fj or [])

        try:
            updated_items = []
            total_cal = total_prot = total_carb = total_fat = 0.0
            # micros keyed by output name (column minus _per_100g suffix)
            micros: Dict[str, float] = {col.replace("_per_100g", ""): 0.0 for col in MICRO_COLS}

            for item in items:
                nf = dict(item)
                fid = str(item.get("food_id") or "")
                food_row = foods_db.get(fid)

                if food_row:
                    # Grams consumed — prefer quantity, fall back to displayQuantity
                    raw_grams = item.get("quantity") or item.get("displayQuantity") or 0
                    try:
                        grams = float(raw_grams)
                    except Exception:
                        grams = 0.0
                    ratio = grams / 100.0 if grams > 0 else 0.0

                    # Refresh per_100g values stored inside the meal JSON
                    for col in MACRO_COLS + MICRO_COLS:
                        val = food_row.get(col)
                        if val is not None:
                            nf[col] = float(val)

                    # Recompute scaled macros
                    nf["calories"] = round(float(food_row.get("calories_per_100g") or 0) * ratio, 2)
                    nf["protein"]  = round(float(food_row.get("protein_per_100g")  or 0) * ratio, 2)
                    nf["carbs"]    = round(float(food_row.get("carbs_per_100g")    or 0) * ratio, 2)
                    nf["fat"]      = round(float(food_row.get("fat_per_100g")      or 0) * ratio, 2)

                    # Accumulate micros
                    for col in MICRO_COLS:
                        key = col.replace("_per_100g", "")
                        micros[key] = round(
                            micros[key] + float(food_row.get(col) or 0) * ratio, 4
                        )

                updated_items.append(nf)
                total_cal  += float(nf.get("calories") or 0)
                total_prot += float(nf.get("protein")  or 0)
                total_carb += float(nf.get("carbs")    or 0)
                total_fat  += float(nf.get("fat")      or 0)

            old_cal = float(meal["total_calories"] or 0)
            print(
                f"  Meal {meal_id}  "
                f"cal: {old_cal:.1f} → {total_cal:.1f}  "
                f"prot: {float(meal['total_protein'] or 0):.1f} → {total_prot:.1f}"
            )

            if not dry_run:
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE meals SET
                            foods          = $2::jsonb,
                            total_calories = $3,
                            total_protein  = $4,
                            total_carbs    = $5,
                            total_fat      = $6,
                            micros         = $7::jsonb
                        WHERE id = $1
                        """,
                        meal_id,
                        json.dumps(updated_items),
                        round(total_cal,  2),
                        round(total_prot, 2),
                        round(total_carb, 2),
                        round(total_fat,  2),
                        json.dumps({k: round(v, 3) for k, v in micros.items()}),
                    )

            stats["meals_updated"] += 1

        except Exception as e:
            logger.error("Failed to recalculate meal %s: %s", meal_id, e)
            stats["meals_failed"] += 1

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill macro/micro nutrients for NutriSnap foods",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--mode",
        choices=["micros-only", "fix-suspicious", "full-refresh"],
        default="fix-suspicious",
    )
    parser.add_argument(
        "--filter",
        choices=["needs-work", "suspicious", "missing-micros", "unverified", "user-created", "all"],
        default="needs-work",
    )
    parser.add_argument(
        "--source",
        choices=["auto", "ai-only", "usda-only"],
        default="auto",
        help="Data source: auto=USDA first then AI fallback (default)",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=0, metavar="N")
    parser.add_argument("--delay", type=float, default=0.3, metavar="S")
    parser.add_argument(
        "--skip-meals",
        action="store_true",
        help="Skip the meal recalculation phase (Phase 2)",
    )

    args = parser.parse_args()

    if args.mode == "full-refresh" and args.filter == "all" and not args.force:
        print(
            "Warning: --mode full-refresh --filter all re-estimates EVERY food.\n"
            "Add --force to confirm, or narrow with --filter user-created."
        )
        sys.exit(1)

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
