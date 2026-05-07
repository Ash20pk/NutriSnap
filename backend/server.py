# ============================================================
# DEPRECATED — This monolithic entrypoint is no longer used.
# The canonical production entrypoint is:  app/main.py
# Run with:  gunicorn app.main:app -c gunicorn_conf.py
# ============================================================
import warnings
warnings.warn(
    "server.py is deprecated. Use 'app.main:app' as the application entrypoint.",
    DeprecationWarning,
    stacklevel=1,
)

from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException, Depends, Header, Form, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import uuid
from datetime import datetime, timedelta, timezone, date
import base64
import json
from openai import AsyncOpenAI
import jwt
from jwt import PyJWKClient
import asyncpg
import httpx
import time
import asyncio
from asyncpg.exceptions import UniqueViolationError
from analytics_ai import _generate_analytics_ai
from app.utils.nutrition_targets import compute_micronutrient_targets
from app.utils.nutrition import calculate_calorie_target, calculate_age_from_dob
from app.utils.micronutrients import create_empty_micros, accumulate_micros, compute_meal_micros
from app.utils.parsers import normalize_base64_image, extract_json_from_text
from app.db.pool import init_pool, close_pool, get_pool, check_pool_health
from app.db.queries import to_uuid, profile_from_record, meal_from_record
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Postgres (Supabase) connection
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
pg_pool: asyncpg.Pool | None = None

# OpenAI Key for AI features
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o')
OPENAI_CHEAP_MODEL = os.environ.get('OPENAI_CHEAP_MODEL', 'gpt-5.4-mini')
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

ADMIN_SYNC_KEY = os.environ.get("ADMIN_SYNC_KEY", "").strip()
USDA_API_KEY = os.environ.get("USDA_API_KEY", "").strip()
FOODS_SYNC_BATCH_SIZE = int(os.environ.get("FOODS_SYNC_BATCH_SIZE", "200"))
FOODS_SYNC_USED_DAYS = int(os.environ.get("FOODS_SYNC_USED_DAYS", "30"))
FOODS_SYNC_STALE_DAYS = int(os.environ.get("FOODS_SYNC_STALE_DAYS", "90"))
SEED_FOODS_ON_STARTUP = os.environ.get("SEED_FOODS_ON_STARTUP", "false").strip().lower() in ("1", "true", "yes")
SEED_USDA_ON_STARTUP = os.environ.get("SEED_USDA_ON_STARTUP", "false").strip().lower() in ("1", "true", "yes")
USDA_BOOTSTRAP_TERMS = [t.strip() for t in os.environ.get("USDA_BOOTSTRAP_TERMS", "rice,egg,chicken breast,banana,apple,milk,bread,oats").split(",") if t.strip()]
USDA_BOOTSTRAP_PER_TERM = int(os.environ.get("USDA_BOOTSTRAP_PER_TERM", "10"))

SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_STORAGE_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "food-labels").strip() or "food-labels"
SUPABASE_STORAGE_PUBLIC = os.environ.get("SUPABASE_STORAGE_PUBLIC", "true").strip().lower() in ("1", "true", "yes")

# USDA Rate Limiting: 1,000 req/hour = 900 req/hour with safety margin
USDA_RATE_LIMIT_PER_HOUR = 900
USDA_RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds
_usda_request_timestamps: List[float] = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool

    # Initialize pool using new pool management module
    max_size = int(os.environ.get("PG_POOL_MAX", "10"))
    pg_pool = await init_pool(DATABASE_URL, max_size=max_size)

    async with pg_pool.acquire() as conn:
        await _ensure_schema(conn)
    
    # Run seeding in background to avoid blocking startup
    if SEED_FOODS_ON_STARTUP or SEED_USDA_ON_STARTUP:
        import asyncio
        asyncio.create_task(_background_seed())

    try:
        yield
    finally:
        await close_pool()

# Create the main app
app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def _ensure_schema(conn: asyncpg.Connection):
    await conn.execute(
        """
        -- Required for gen_random_uuid() defaults used across tables
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS profiles (
            id uuid PRIMARY KEY,
            name text,
            age int,
            gender text,
            height double precision,
            weight double precision,
            goal text,
            activity_level text,
            dietary_preference text,
            daily_calorie_target double precision,
            protein_target double precision,
            carbs_target double precision,
            fat_target double precision,
            created_at timestamptz DEFAULT now(),
            onboarding_completed boolean DEFAULT false
        );

        CREATE TABLE IF NOT EXISTS foods (
            id uuid PRIMARY KEY,
            name text NOT NULL,
            category text NOT NULL,
            calories_per_100g double precision NOT NULL,
            protein_per_100g double precision NOT NULL,
            carbs_per_100g double precision NOT NULL,
            fat_per_100g double precision NOT NULL,
            is_vegetarian boolean DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            -- Global/source metadata
            source text NULL,
            external_id text NULL,
            brand text NULL,
            barcode text NULL,
            language text NULL,
            region text NULL,
            image_url text NULL,
            ingredients text NULL,
            verified boolean NOT NULL DEFAULT false,
            fiber_g_per_100g double precision NULL,
            sugar_g_per_100g double precision NULL,
            saturated_fat_g_per_100g double precision NULL,
            trans_fat_g_per_100g double precision NULL,
            cholesterol_mg_per_100g double precision NULL,
            sodium_mg_per_100g double precision NULL,
            potassium_mg_per_100g double precision NULL,
            vitamin_a_ug_per_100g double precision NULL,
            vitamin_c_mg_per_100g double precision NULL,
            vitamin_d_ug_per_100g double precision NULL,
            vitamin_e_mg_per_100g double precision NULL,
            vitamin_k_ug_per_100g double precision NULL,
            thiamin_b1_mg_per_100g double precision NULL,
            riboflavin_b2_mg_per_100g double precision NULL,
            niacin_b3_mg_per_100g double precision NULL,
            vitamin_b6_mg_per_100g double precision NULL,
            folate_ug_per_100g double precision NULL,
            vitamin_b12_ug_per_100g double precision NULL,
            calcium_mg_per_100g double precision NULL,
            iron_mg_per_100g double precision NULL,
            magnesium_mg_per_100g double precision NULL,
            phosphorus_mg_per_100g double precision NULL,
            zinc_mg_per_100g double precision NULL,
            copper_mg_per_100g double precision NULL,
            manganese_mg_per_100g double precision NULL,
            selenium_ug_per_100g double precision NULL,
            caffeine_mg_per_100g double precision NULL,
            alcohol_g_per_100g double precision NULL,
            nutrients_jsonb jsonb NULL,
            last_used_at timestamptz NULL,
            last_synced_at timestamptz NULL,
            sync_status text NULL,
            retry_count integer NOT NULL DEFAULT 0,
            sync_error text NULL,
            raw_payload jsonb NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_source_external_id
          ON foods (source, external_id)
          WHERE source IS NOT NULL AND external_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_barcode
          ON foods (barcode)
          WHERE barcode IS NOT NULL;

        -- Cache for NutriLens /foods/health-check results (AI cost saver)
        CREATE TABLE IF NOT EXISTS food_health_check_cache (
            barcode text PRIMARY KEY,
            response_json jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_food_health_check_cache_expires_at
          ON food_health_check_cache (expires_at);

        CREATE INDEX IF NOT EXISTS idx_foods_name_lower ON foods (lower(name));
        CREATE INDEX IF NOT EXISTS idx_foods_brand_lower ON foods (lower(brand));
        CREATE INDEX IF NOT EXISTS idx_foods_last_used_at ON foods (last_used_at DESC);
        CREATE INDEX IF NOT EXISTS idx_foods_last_synced_at ON foods (last_synced_at ASC);
        CREATE INDEX IF NOT EXISTS idx_foods_sync_status ON foods (sync_status);

        CREATE TABLE IF NOT EXISTS meals (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            meal_type text NOT NULL,
            foods jsonb NOT NULL,
            total_calories double precision NOT NULL,
            total_protein double precision NOT NULL,
            total_carbs double precision NOT NULL,
            total_fat double precision NOT NULL,
            image_base64 text NULL,
            logging_method text NOT NULL,
            notes text NULL,
            timestamp timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_meals_user_ts ON meals (user_id, timestamp DESC);

        CREATE TABLE IF NOT EXISTS foods_ingestion_queue (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            food_id uuid NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
            query text NOT NULL,
            status text NOT NULL DEFAULT 'pending',
            attempt_count int NOT NULL DEFAULT 0,
            last_error text NULL,
            next_attempt_at timestamptz NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_queue_status_next_attempt 
          ON foods_ingestion_queue(status, next_attempt_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_food_id 
          ON foods_ingestion_queue(food_id);
        CREATE INDEX IF NOT EXISTS idx_queue_query_lower 
          ON foods_ingestion_queue(lower(query));

        -- =====================
        -- QUEST SYSTEM TABLES
        -- =====================

        CREATE TABLE IF NOT EXISTS quest_definitions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            quest_type text NOT NULL,
            title text NOT NULL,
            description text,
            icon text NOT NULL DEFAULT 'checkmark-circle',
            icon_color text NOT NULL DEFAULT '#2F593E',
            xp_reward int NOT NULL DEFAULT 20,
            target_value int NOT NULL DEFAULT 1,
            target_unit text,
            difficulty text NOT NULL DEFAULT 'easy',
            is_daily boolean NOT NULL DEFAULT true,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS user_quests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            quest_definition_id uuid NOT NULL REFERENCES quest_definitions(id) ON DELETE CASCADE,
            quest_date date NOT NULL DEFAULT CURRENT_DATE,
            current_value double precision NOT NULL DEFAULT 0,
            target_value double precision NOT NULL,
            is_completed boolean NOT NULL DEFAULT false,
            completed_at timestamptz,
            xp_claimed boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(user_id, quest_definition_id, quest_date)
        );

        CREATE INDEX IF NOT EXISTS idx_user_quests_user_date ON user_quests(user_id, quest_date);
        CREATE INDEX IF NOT EXISTS idx_user_quests_completed ON user_quests(user_id, is_completed, xp_claimed);

        CREATE TABLE IF NOT EXISTS badge_definitions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            badge_type text NOT NULL UNIQUE,
            title text NOT NULL,
            description text NOT NULL,
            icon text NOT NULL DEFAULT 'sparkles',
            xp_reward int NOT NULL DEFAULT 50,
            requirement_type text NOT NULL,
            requirement_value int NOT NULL DEFAULT 1,
            tier int NOT NULL DEFAULT 1,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS user_badges (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            badge_definition_id uuid NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
            earned_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(user_id, badge_definition_id)
        );

        CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

        CREATE TABLE IF NOT EXISTS user_xp (
            user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
            total_xp int NOT NULL DEFAULT 0,
            level int NOT NULL DEFAULT 1,
            current_streak int NOT NULL DEFAULT 0,
            longest_streak int NOT NULL DEFAULT 0,
            last_active_date date,
            quests_completed int NOT NULL DEFAULT 0,
            badges_earned int NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS user_daily_activity (
            user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            activity_date date NOT NULL,
            was_active boolean NOT NULL DEFAULT false,
            logged_food boolean NOT NULL DEFAULT false,
            last_active_at timestamptz NULL,
            last_logged_food_at timestamptz NULL,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, activity_date)
        );

        CREATE INDEX IF NOT EXISTS idx_user_daily_activity_user_date
          ON user_daily_activity (user_id, activity_date DESC);

        CREATE TABLE IF NOT EXISTS user_follows (
            follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (follower_id, following_id)
        );

        CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
        CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);
        """
    )

    # Evolve foods schema for global catalog + micronutrients + sync metadata (safe/idempotent)
    await conn.execute(
        """
        ALTER TABLE profiles
          ADD COLUMN IF NOT EXISTS username text NULL,
          ADD COLUMN IF NOT EXISTS bio text NULL,
          ADD COLUMN IF NOT EXISTS avatar_url text NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
          ON profiles (lower(username))
          WHERE username IS NOT NULL;

        ALTER TABLE foods
          ADD COLUMN IF NOT EXISTS source text NULL,
          ADD COLUMN IF NOT EXISTS external_id text NULL,
          ADD COLUMN IF NOT EXISTS brand text NULL,
          ADD COLUMN IF NOT EXISTS barcode text NULL,
          ADD COLUMN IF NOT EXISTS language text NULL,
          ADD COLUMN IF NOT EXISTS region text NULL,
          ADD COLUMN IF NOT EXISTS image_url text NULL,
          ADD COLUMN IF NOT EXISTS ingredients text NULL,
          ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS fiber_g_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS sugar_g_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS saturated_fat_g_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS trans_fat_g_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS cholesterol_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS sodium_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS potassium_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_a_ug_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_c_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_d_ug_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_e_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_k_ug_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS thiamin_b1_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS riboflavin_b2_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS niacin_b3_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_b6_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS folate_ug_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS vitamin_b12_ug_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS calcium_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS iron_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS magnesium_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS phosphorus_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS zinc_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS copper_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS manganese_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS selenium_ug_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS caffeine_mg_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS alcohol_g_per_100g double precision NULL,
          ADD COLUMN IF NOT EXISTS nutrients_jsonb jsonb NULL,
          ADD COLUMN IF NOT EXISTS last_used_at timestamptz NULL,
          ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL,
          ADD COLUMN IF NOT EXISTS sync_status text NULL,
          ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS sync_error text NULL,
          ADD COLUMN IF NOT EXISTS raw_payload jsonb NULL,
          ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved';
        
        ALTER TABLE meals
          ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'finalized';

        CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_source_external_id
          ON foods (source, external_id)
          WHERE source IS NOT NULL AND external_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_barcode
          ON foods (barcode)
          WHERE barcode IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_foods_name_lower ON foods (lower(name));
        CREATE INDEX IF NOT EXISTS idx_foods_brand_lower ON foods (lower(brand));
        CREATE INDEX IF NOT EXISTS idx_foods_last_used_at ON foods (last_used_at DESC);
        CREATE INDEX IF NOT EXISTS idx_foods_last_synced_at ON foods (last_synced_at ASC);
        CREATE INDEX IF NOT EXISTS idx_foods_sync_status ON foods (sync_status);
        """
    )


async def _seed_foods_if_empty(conn: asyncpg.Connection):
    """Seed foods table from the in-code INDIAN_FOODS_DB if the table is empty."""
    count = await conn.fetchval("SELECT COUNT(*) FROM foods")
    if count and int(count) > 0:
        logger.info(f"Foods already seeded (count={count})")
        return

    rows = []
    for f in INDIAN_FOODS_DB:
        name = str(f.get("name", "")).strip()
        category = str(f.get("category", "")).strip()
        rows.append(
            (
                uuid.uuid4(),
                name,
                category,
                float(f.get("calories_per_100g", 0) or 0),
                float(f.get("protein_per_100g", 0) or 0),
                float(f.get("carbs_per_100g", 0) or 0),
                float(f.get("fat_per_100g", 0) or 0),
                bool(f.get("is_vegetarian", True)),
                "seed",
                f"seed:{category}:{name.lower()}",
            )
        )

    await conn.executemany(
        """
        INSERT INTO foods (
            id, name, category,
            calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
            is_vegetarian,
            source, external_id
        ) VALUES (
            $1,$2,$3,
            $4,$5,$6,$7,
            $8,
            $9,$10
        )
        """,
        rows,
    )


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        return float(value)
    except Exception:
        return None


def _parse_jsonb_field(value: Any, default: Any = None) -> Any:
    """Parse a JSONB field that may be a string or already parsed.

    Args:
        value: The field value (could be str, dict, list, or None)
        default: Default value to return if parsing fails (default: None)

    Returns:
        Parsed JSON value or default
    """
    if value is None:
        return default if default is not None else {}
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default if default is not None else {}
    return value


def _parse_analytics_cache_fields(cache: Dict[str, Any]) -> Dict[str, Any]:
    """Parse all JSONB fields from an analytics cache record.

    Args:
        cache: The cache record from the database

    Returns:
        Dictionary with parsed fields
    """
    return {
        "insights": _parse_jsonb_field(cache.get("insights"), {}),
        "bio_impact": _parse_jsonb_field(cache.get("bio_impact"), {}),
        "health_insights": _parse_jsonb_field(cache.get("health_insights"), {}),
        "bio_alerts": _parse_jsonb_field(cache.get("bio_alerts"), []),
        "red_flags": _parse_jsonb_field(cache.get("red_flags"), []),
    }


# Micronutrient field mappings: (output_key, db_column_suffix)
_MICRONUTRIENT_FIELDS = [
    ("fiber_g", "fiber_g_per_100g"),
    ("sugar_g", "sugar_g_per_100g"),
    ("saturated_fat_g", "saturated_fat_g_per_100g"),
    ("trans_fat_g", "trans_fat_g_per_100g"),
    ("cholesterol_mg", "cholesterol_mg_per_100g"),
    ("sodium_mg", "sodium_mg_per_100g"),
    ("potassium_mg", "potassium_mg_per_100g"),
    ("vitamin_a_ug", "vitamin_a_ug_per_100g"),
    ("calcium_mg", "calcium_mg_per_100g"),
    ("iron_mg", "iron_mg_per_100g"),
    ("magnesium_mg", "magnesium_mg_per_100g"),
    ("phosphorus_mg", "phosphorus_mg_per_100g"),
    ("zinc_mg", "zinc_mg_per_100g"),
    ("copper_mg", "copper_mg_per_100g"),
    ("manganese_mg", "manganese_mg_per_100g"),
    ("selenium_ug", "selenium_ug_per_100g"),
    ("vitamin_c_mg", "vitamin_c_mg_per_100g"),
    ("vitamin_d_ug", "vitamin_d_ug_per_100g"),
    ("vitamin_e_mg", "vitamin_e_mg_per_100g"),
    ("vitamin_k_ug", "vitamin_k_ug_per_100g"),
    ("thiamin_b1_mg", "thiamin_b1_mg_per_100g"),
    ("riboflavin_b2_mg", "riboflavin_b2_mg_per_100g"),
    ("niacin_b3_mg", "niacin_b3_mg_per_100g"),
    ("vitamin_b6_mg", "vitamin_b6_mg_per_100g"),
    ("folate_ug", "folate_ug_per_100g"),
    ("vitamin_b12_ug", "vitamin_b12_ug_per_100g"),
    ("caffeine_mg", "caffeine_mg_per_100g"),
    ("alcohol_g", "alcohol_g_per_100g"),
]


# Micronutrient functions moved to app/utils/micronutrients.py
# Imported at top: create_empty_micros, accumulate_micros, compute_meal_micros

# Backwards-compat alias: legacy endpoints still reference _compute_meal_micros
_compute_meal_micros = compute_meal_micros

# Backwards-compat alias: legacy parsing helper still references _extract_json_from_text
_extract_json_from_text = extract_json_from_text

# Backwards-compat aliases: legacy micronutrient helpers
_create_empty_micros = create_empty_micros
_accumulate_micros = accumulate_micros


def _convert_unit(amount: float, unit: str, target_unit: str) -> float | None:
    if amount is None:
        return None
    u = (unit or "").strip().lower()
    t = (target_unit or "").strip().lower()
    if t == "g":
        if u == "g":
            return amount
        if u == "mg":
            return amount / 1000.0
        if u in ("µg", "ug", "mcg"):
            return amount / 1_000_000.0
        return None
    if t == "mg":
        if u == "mg":
            return amount
        if u == "g":
            return amount * 1000.0
        if u in ("µg", "ug", "mcg"):
            return amount / 1000.0
        return None
    if t in ("µg", "ug"):
        if u in ("µg", "ug", "mcg"):
            return amount
        if u == "mg":
            return amount * 1000.0
        if u == "g":
            return amount * 1_000_000.0
        return None
    return None


def _off_nutriment_to_mg_per_100g(nutriments: Dict[str, Any], key: str) -> float | None:
    if not nutriments:
        return None
    val = _to_float(nutriments.get(key))
    if val is None:
        return None
    unit = str(nutriments.get(f"{key}_unit", "")).strip().lower()
    if unit in ("mg",):
        return val
    if unit in ("g",):
        return val * 1000.0
    return None


async def _fetch_openfoodfacts(barcode: str) -> Dict[str, Any] | None:
    code = (barcode or "").strip()
    if not code:
        return None
    async with httpx.AsyncClient(timeout=20) as client:
        # Prefer v2 API (richer fields) but fall back to v0 which sometimes has better coverage.
        url_v2 = f"https://world.openfoodfacts.org/api/v2/product/{code}.json"
        r = await client.get(url_v2)
        if r.status_code == 200:
            try:
                data = r.json()
                if isinstance(data, dict) and data.get("product"):
                    return data
            except Exception:
                pass

        url_v0 = f"https://world.openfoodfacts.org/api/v0/product/{code}.json"
        r0 = await client.get(url_v0)
        if r0.status_code != 200:
            return None
        try:
            data0 = r0.json()
            if isinstance(data0, dict) and int(data0.get("status") or 0) == 1 and data0.get("product"):
                return data0
        except Exception:
            return None
        return None


def _normalize_barcode(raw: str) -> str:
    # Keep only digits; scanners sometimes include spaces or symbology prefixes.
    return re.sub(r"\D", "", (raw or "").strip())


def _barcode_variants(raw: str) -> List[str]:
    code = _normalize_barcode(raw)
    if not code:
        return []

    # Try common representations:
    # - exact digits
    # - strip leading zeros (some sources store without)
    # - if UPC-A (12 digits), try EAN-13 by prefixing a leading 0
    variants: List[str] = []
    variants.append(code)

    stripped = code.lstrip("0")
    if stripped and stripped != code:
        variants.append(stripped)

    if len(code) == 12:
        variants.append("0" + code)

    # De-duplicate while preserving order
    seen: set[str] = set()
    out: List[str] = []
    for v in variants:
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def _is_food_data_incomplete(food: Dict[str, Any]) -> bool:
    """Check if food data is incomplete and needs user contribution.

    Data is considered incomplete if:
    - All macronutrients are zero/null AND
    - No ingredients text is available

    If we have at least some nutrition OR ingredients, we can work with it.
    """
    calories = float(food.get("calories_per_100g") or 0)
    protein = float(food.get("protein_per_100g") or 0)
    carbs = float(food.get("carbs_per_100g") or 0)
    fat = float(food.get("fat_per_100g") or 0)
    ingredients = (food.get("ingredients") or "").strip()

    all_macros_zero = calories == 0 and protein == 0 and carbs == 0 and fat == 0
    no_ingredients = not ingredients

    return all_macros_zero and no_ingredients


def _openfoodfacts_best_name(product: Dict[str, Any], fallback_code: str) -> str:
    name_candidates = [
        product.get("product_name"),
        product.get("product_name_en"),
        product.get("product_name_hi"),
        product.get("product_name_fr"),
        product.get("generic_name"),
        product.get("generic_name_en"),
        product.get("abbreviated_product_name"),
        product.get("product_name_without_brand"),
    ]

    for c in name_candidates:
        if not c:
            continue
        s = str(c).strip()
        if s:
            return s

    keywords = product.get("_keywords")
    if isinstance(keywords, list):
        stop = {
            "biscuit",
            "biscuits",
            "cookie",
            "cookies",
            "cracker",
            "crackers",
            "snack",
            "snacks",
            "food",
            "packaged",
        }
        words = [str(x).strip() for x in keywords if str(x).strip()]
        best = [w for w in words if w.lower() not in stop]
        if best:
            return best[0].strip().title()

    return f"Barcode {fallback_code}"


def _is_barcode_data_incomplete(barcode_data: Dict[str, Any]) -> bool:
    """Check if barcode data is incomplete and needs user contribution.

    Same logic as _is_food_data_incomplete but for barcode records.
    """
    calories = float(barcode_data.get("calories_per_100g") or 0)
    protein = float(barcode_data.get("protein_per_100g") or 0)
    carbs = float(barcode_data.get("carbs_per_100g") or 0)
    fat = float(barcode_data.get("fat_per_100g") or 0)
    ingredients = (barcode_data.get("ingredients") or "").strip()

    all_macros_zero = calories == 0 and protein == 0 and carbs == 0 and fat == 0
    no_ingredients = not ingredients

    return all_macros_zero and no_ingredients


async def _fetch_usda_food(external_id: str) -> Dict[str, Any] | None:
    if not USDA_API_KEY:
        raise RuntimeError("USDA_API_KEY is not set")
    fdc_id = str(external_id).strip()
    if not fdc_id:
        return None
    
    await _check_usda_rate_limit()
    
    url = f"https://api.nal.usda.gov/fdc/v1/food/{fdc_id}"
    params = {"api_key": USDA_API_KEY}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            return None
        return r.json()


async def _check_usda_rate_limit():
    """Check and enforce USDA rate limit (900 req/hour with safety margin)."""
    global _usda_request_timestamps
    now = time.time()
    
    # Remove timestamps older than 1 hour
    _usda_request_timestamps = [ts for ts in _usda_request_timestamps if now - ts < USDA_RATE_LIMIT_WINDOW]
    
    # Check if we're at the limit
    if len(_usda_request_timestamps) >= USDA_RATE_LIMIT_PER_HOUR:
        oldest = _usda_request_timestamps[0]
        wait_time = USDA_RATE_LIMIT_WINDOW - (now - oldest)
        if wait_time > 0:
            logger.warning(f"USDA rate limit reached ({len(_usda_request_timestamps)}/{USDA_RATE_LIMIT_PER_HOUR}). Waiting {wait_time:.1f}s...")
            await asyncio.sleep(wait_time + 1)
            # Retry check after waiting
            return await _check_usda_rate_limit()
    
    # Record this request
    _usda_request_timestamps.append(now)
    
    # Add small delay between requests (4s = 900 req/hour)
    if len(_usda_request_timestamps) > 1:
        await asyncio.sleep(4)


async def _usda_search(term: str, limit: int) -> Dict[str, Any] | None:
    if not USDA_API_KEY:
        raise RuntimeError("USDA_API_KEY is not set")
    q = (term or "").strip()
    if not q:
        return None
    
    await _check_usda_rate_limit()
    
    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    payload = {
        "query": q,
        "pageSize": int(limit),
        "pageNumber": 1,
        "dataType": ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    }
    params = {"api_key": USDA_API_KEY}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, params=params, json=payload)
        if r.status_code != 200:
            return None
        return r.json()


def _usda_nutrients_to_map(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Extract nutrients from USDA payload.
    Handles both search response format (nested nutrient object) and food detail format (flat nutrientName).
    """
    out: Dict[str, Dict[str, Any]] = {}
    for n in payload.get("foodNutrients", []) or []:
        # Handle both formats:
        # Search response: {"nutrient": {"name": "...", "unitName": "..."}, "amount": ...}
        # Food detail: {"nutrientName": "...", "unitName": "...", "amount": ...}
        nutrient_obj = n.get("nutrient", {})
        if nutrient_obj:
            # Search response format
            name = nutrient_obj.get("name")
            unit = nutrient_obj.get("unitName")
        else:
            # Food detail format
            name = n.get("nutrientName")
            unit = n.get("unitName")
        
        amount = n.get("amount")
        
        if not name:
            continue
        v = _to_float(amount)
        if v is None:
            continue
        
        out[str(name).strip().lower()] = {"amount": v, "unit": str(unit or "").strip()}
    return out


async def _background_seed():
    """Background task for seeding to avoid blocking startup."""
    pool = _require_pool()
    async with pool.acquire() as conn:
        if SEED_FOODS_ON_STARTUP:
            await _seed_foods_if_empty(conn)
        if SEED_USDA_ON_STARTUP:
            await _seed_usda_if_empty(conn)


async def _seed_usda_if_empty(conn: asyncpg.Connection):
    count = await conn.fetchval("SELECT COUNT(*) FROM foods")
    if count and int(count) > 0:
        logger.info(f"Foods already seeded (count={count})")
        return

    inserted = 0
    logger.info("Starting USDA bootstrap seed...")

    for term in USDA_BOOTSTRAP_TERMS:
        res = await _usda_search(term, USDA_BOOTSTRAP_PER_TERM)
        if not res:
            continue
        foods = res.get("foods") or []
        for f in foods:
            fdc_id = f.get("fdcId")
            desc = (f.get("description") or "").strip()
            if not fdc_id or not desc:
                continue
            nutrients = f.get("foodNutrients") or []

            kcal = None
            protein = None
            carbs = None
            fat = None
            for n in nutrients:
                nname = str(n.get("nutrientName") or "").strip().lower()
                if not nname:
                    continue
                val = _to_float(n.get("value"))
                unit = str(n.get("unitName") or "").strip().upper()
                if val is None:
                    continue
                if nname == "energy" and unit == "KCAL":
                    kcal = val
                elif nname == "protein" and unit == "G":
                    protein = val
                elif nname.startswith("carbohydrate") and unit == "G":
                    carbs = val
                elif "total lipid" in nname and unit == "G":
                    fat = val

            if kcal is None or protein is None or carbs is None or fat is None:
                continue

            category = (f.get("foodCategory") or "usda").strip() or "usda"

            row = await conn.fetchrow(
                """
                INSERT INTO foods (
                    id, name, category,
                    calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                    is_vegetarian,
                    source, external_id
                ) VALUES (
                    $1,$2,$3,
                    $4,$5,$6,$7,
                    $8,
                    $9,$10
                )
                ON CONFLICT (source, external_id) DO NOTHING
                RETURNING id
                """,
                uuid.uuid4(),
                desc,
                category,
                float(kcal),
                float(protein),
                float(carbs),
                float(fat),
                True,
                "usda",
                str(fdc_id),
            )
            if row:
                inserted += 1

    logger.info(f"USDA bootstrap seed inserted={inserted}")


def _require_pool() -> asyncpg.Pool:
    if pg_pool is None:
        raise RuntimeError("Postgres pool is not initialized")
    return pg_pool


def _require_admin_key(key: str | None) -> None:
    expected = ADMIN_SYNC_KEY.strip()
    if not expected:
        raise HTTPException(status_code=500, detail="ADMIN_SYNC_KEY not configured")
    if (key or "").strip() != expected:
        raise HTTPException(status_code=403, detail="Invalid admin key")


# _uuid moved to app.db.queries as to_uuid
# Imported at top: to_uuid


async def _upsert_user_daily_activity(
    conn: asyncpg.Connection,
    user_id: str,
    activity_date: date,
    *,
    was_active: bool = False,
    logged_food: bool = False,
    active_at: datetime | None = None,
    logged_at: datetime | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO user_daily_activity (
            user_id,
            activity_date,
            was_active,
            logged_food,
            last_active_at,
            last_logged_food_at,
            updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, now()
        )
        ON CONFLICT (user_id, activity_date) DO UPDATE
        SET
            was_active = user_daily_activity.was_active OR EXCLUDED.was_active,
            logged_food = user_daily_activity.logged_food OR EXCLUDED.logged_food,
            last_active_at = COALESCE(EXCLUDED.last_active_at, user_daily_activity.last_active_at),
            last_logged_food_at = COALESCE(EXCLUDED.last_logged_food_at, user_daily_activity.last_logged_food_at),
            updated_at = now()
        """,
        to_uuid(user_id),
        activity_date,
        bool(was_active),
        bool(logged_food),
        active_at,
        logged_at,
    )


async def _backfill_user_daily_activity_from_meals(
    conn: asyncpg.Connection,
    user_id: str,
    start_date: date,
) -> None:
    await conn.execute(
        """
        INSERT INTO user_daily_activity (
            user_id,
            activity_date,
            was_active,
            logged_food,
            last_logged_food_at,
            updated_at
        )
        SELECT
            $1 as user_id,
            DATE(m.timestamp) as activity_date,
            true as was_active,
            true as logged_food,
            MAX(m.timestamp) as last_logged_food_at,
            now() as updated_at
        FROM meals m
        WHERE m.user_id = $1
          AND DATE(m.timestamp) >= $2
        GROUP BY DATE(m.timestamp)
        ON CONFLICT (user_id, activity_date) DO UPDATE
        SET
            was_active = user_daily_activity.was_active OR EXCLUDED.was_active,
            logged_food = user_daily_activity.logged_food OR EXCLUDED.logged_food,
            last_logged_food_at = GREATEST(
                COALESCE(user_daily_activity.last_logged_food_at, EXCLUDED.last_logged_food_at),
                COALESCE(EXCLUDED.last_logged_food_at, user_daily_activity.last_logged_food_at)
            ),
            updated_at = now()
        """,
        to_uuid(user_id),
        start_date,
    )


# DB helper functions moved to app/db/queries.py
# Imported at top: to_uuid, profile_from_record, meal_from_record

# Supabase Auth
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_JWT_AUD = os.environ.get("SUPABASE_JWT_AUD", "authenticated")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_JWT_ISSUER = os.environ.get(
    "SUPABASE_JWT_ISSUER",
    f"{SUPABASE_URL.rstrip('/')}/auth/v1" if SUPABASE_URL else "",
)
SUPABASE_JWKS_URL = os.environ.get(
    "SUPABASE_JWKS_URL",
    f"{SUPABASE_JWT_ISSUER.rstrip('/')}/.well-known/jwks.json" if SUPABASE_JWT_ISSUER else "",
)

_supabase_jwk_client: PyJWKClient | None = None


def _get_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return parts[1].strip()


def _verify_supabase_token(token: str) -> dict:
    try:
        global _supabase_jwk_client

        if not SUPABASE_JWT_ISSUER:
            raise RuntimeError("Supabase JWT verification is not configured. Set SUPABASE_URL (or SUPABASE_JWT_ISSUER).")

        header = jwt.get_unverified_header(token)
        alg = str(header.get("alg", ""))

        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                raise RuntimeError("SUPABASE_JWT_SECRET is not set (required for HS256 Supabase JWT verification)")
            decoded = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience=SUPABASE_JWT_AUD,
                issuer=SUPABASE_JWT_ISSUER,
            )
        elif alg in ("RS256", "ES256"):
            if not SUPABASE_JWKS_URL:
                raise RuntimeError(
                    "SUPABASE_JWKS_URL is not set (required for asymmetric Supabase JWT verification)"
                )

            if _supabase_jwk_client is None:
                _supabase_jwk_client = PyJWKClient(SUPABASE_JWKS_URL)

            signing_key = _supabase_jwk_client.get_signing_key_from_jwt(token).key
            decoded = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience=SUPABASE_JWT_AUD,
                issuer=SUPABASE_JWT_ISSUER,
            )
        else:
            raise HTTPException(status_code=401, detail=f"Invalid token: unsupported alg {alg}")

        if not decoded or "sub" not in decoded:
            raise HTTPException(status_code=401, detail="Invalid token")
        return decoded
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def get_current_uid(authorization: str | None = Header(default=None)) -> str:
    token = _get_bearer_token(authorization)
    decoded = _verify_supabase_token(token)
    return str(decoded.get("sub"))


async def get_current_uid_optional(authorization: str | None = Header(default=None)) -> Optional[str]:
    """Optional auth - returns None if no valid token, used for endpoints with alternative auth"""
    try:
        if not authorization:
            return None
        token = _get_bearer_token(authorization)
        decoded = _verify_supabase_token(token)
        return str(decoded.get("sub"))
    except Exception:
        return None


def _require_user_match(uid: str, user_id: str):
    if uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user mismatch")

# ============ MODELS ============

class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    name: str
    age: int  # Calculated from date_of_birth
    date_of_birth: Optional[str] = None  # ISO format YYYY-MM-DD
    gender: str
    height: float  # in cm
    weight: float  # in kg
    goal: str  # "lose_weight", "gain_muscle", "maintain", "general_health"
    activity_level: str  # "sedentary", "light", "moderate", "active", "very_active"
    dietary_preference: str  # "vegetarian", "vegan", "non_veg", "no_restriction"
    daily_calorie_target: float
    protein_target: float
    carbs_target: float
    fat_target: float
    created_at: datetime = Field(default_factory=datetime.utcnow)
    onboarding_completed: bool = True
    last_weight_check: Optional[datetime] = None
    weight_check_due: bool = False  # True if >30 days since last check

class UserProfileCreate(BaseModel):
    name: str
    date_of_birth: str  # ISO format YYYY-MM-DD
    gender: str
    height: float
    weight: float
    goal: str
    activity_level: str
    dietary_preference: str


class GoalsUpdateRequest(BaseModel):
    goal: str
    activity_level: str

class FoodItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # "north_indian", "south_indian", "street_food", etc.
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    is_vegetarian: bool = True

class MealLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    meal_type: str  # "breakfast", "lunch", "dinner", "snack"
    foods: List[Dict[str, Any]]  # [{"name": "Dal", "quantity": 150, "calories": 120, ...}]
    micros: Dict[str, Any] = Field(default_factory=dict)
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    image_base64: Optional[str] = None
    logging_method: str  # "photo", "voice", "manual", "barcode"
    notes: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    review_status: str = "finalized"  # "pending_review" | "finalized"

class MealLogCreate(BaseModel):
    user_id: str
    meal_type: str
    foods: List[Dict[str, Any]]
    image_base64: Optional[str] = None
    logging_method: str
    notes: Optional[str] = None

class PhotoAnalysisRequest(BaseModel):
    image_base64: str
    user_id: str

class VoiceToMealFoodItem(BaseModel):
    name: str
    quantity_grams: float = Field(..., ge=0)

class VoiceToMealResponse(BaseModel):
    transcript: str
    foods: List[Dict[str, Any]]


class TextToMealRequest(BaseModel):
    user_id: str
    text: str

class TranscribeResponse(BaseModel):
    transcript: str


class PortionInferResponse(BaseModel):
    transcript: str
    quantity: Optional[float] = None
    unit: Optional[str] = None  # 'g' | 'oz'


class FoodHealthCheckRequest(BaseModel):
    user_id: str
    barcode: str


class FoodLabelSubmissionRequest(BaseModel):
    user_id: str
    barcode: str
    images_base64: List[str]
    notes: str | None = None


class FoodLabelSubmissionResponse(BaseModel):
    submission_id: str
    status: str


class ProcessLabelRequest(BaseModel):
    user_id: str
    barcode: str
    image_base64: Optional[str] = None
    images_base64: Optional[List[str]] = None
    front_image_base64: Optional[str] = None


async def _upload_supabase_storage_object(bucket: str, object_path: str, content_type: str, data: bytes) -> None:
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not set")
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not set")

    url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{bucket}/{object_path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, headers=headers, content=data)
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Supabase Storage upload failed ({r.status_code}): {r.text}")


async def _supabase_storage_object_url(bucket: str, object_path: str) -> str:
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not set")

    object_path = object_path.lstrip("/")
    if SUPABASE_STORAGE_PUBLIC:
        return f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{bucket}/{object_path}"

    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not set")

    url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/sign/{bucket}/{object_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, headers=headers, json={"expiresIn": 31536000})
        if r.status_code != 200:
            raise RuntimeError(f"Supabase Storage sign failed ({r.status_code}): {r.text}")
        signed = (r.json() or {}).get("signedURL")
        if not signed:
            raise RuntimeError("Supabase Storage sign returned empty signedURL")
        return f"{SUPABASE_URL.rstrip('/')}{signed}"


class FoodHealthFlag(BaseModel):
    title: str
    severity: str  # 'low' | 'medium' | 'high'
    reason: str
    what_it_is: Optional[str] = None
    why_it_matters: Optional[str] = None
    evidence: Optional[str] = None
    suggestion: Optional[str] = None


class FoodHealthCheckResponse(BaseModel):
    barcode: str
    name: str
    brand: Optional[str] = None
    verdict: str  # 'good' | 'caution' | 'avoid'
    summary: str
    verdict_reason: str = ""
    red_flags: List[FoodHealthFlag] = []
    positives: List[str] = []

class FoodPresenceResponse(BaseModel):
    has_food: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = ""

# ============ INDIAN FOOD DATABASE ============

INDIAN_FOODS_DB = [
    {"name": "Dal Makhani", "category": "north_indian", "calories_per_100g": 140, "protein_per_100g": 7, "carbs_per_100g": 12, "fat_per_100g": 8, "is_vegetarian": True},
    {"name": "Butter Chicken", "category": "north_indian", "calories_per_100g": 250, "protein_per_100g": 15, "carbs_per_100g": 8, "fat_per_100g": 18, "is_vegetarian": False},
    {"name": "Roti", "category": "north_indian", "calories_per_100g": 260, "protein_per_100g": 8, "carbs_per_100g": 50, "fat_per_100g": 3, "is_vegetarian": True},
    {"name": "Naan", "category": "north_indian", "calories_per_100g": 310, "protein_per_100g": 9, "carbs_per_100g": 52, "fat_per_100g": 7, "is_vegetarian": True},
    {"name": "Paneer Tikka", "category": "north_indian", "calories_per_100g": 220, "protein_per_100g": 14, "carbs_per_100g": 6, "fat_per_100g": 16, "is_vegetarian": True},
    {"name": "Dosa", "category": "south_indian", "calories_per_100g": 168, "protein_per_100g": 4, "carbs_per_100g": 28, "fat_per_100g": 4, "is_vegetarian": True},
    {"name": "Idli", "category": "south_indian", "calories_per_100g": 58, "protein_per_100g": 2, "carbs_per_100g": 11, "fat_per_100g": 0.4, "is_vegetarian": True},
    {"name": "Sambar", "category": "south_indian", "calories_per_100g": 72, "protein_per_100g": 3, "carbs_per_100g": 12, "fat_per_100g": 1.5, "is_vegetarian": True},
    {"name": "Vada", "category": "south_indian", "calories_per_100g": 230, "protein_per_100g": 8, "carbs_per_100g": 28, "fat_per_100g": 9, "is_vegetarian": True},
    {"name": "Pani Puri", "category": "street_food", "calories_per_100g": 80, "protein_per_100g": 2, "carbs_per_100g": 15, "fat_per_100g": 1.5, "is_vegetarian": True},
    {"name": "Vada Pav", "category": "street_food", "calories_per_100g": 250, "protein_per_100g": 6, "carbs_per_100g": 38, "fat_per_100g": 8, "is_vegetarian": True},
    {"name": "Samosa", "category": "street_food", "calories_per_100g": 260, "protein_per_100g": 5, "carbs_per_100g": 30, "fat_per_100g": 13, "is_vegetarian": True},
    {"name": "Chaat", "category": "street_food", "calories_per_100g": 150, "protein_per_100g": 4, "carbs_per_100g": 22, "fat_per_100g": 5, "is_vegetarian": True},
    {"name": "Biryani", "category": "north_indian", "calories_per_100g": 200, "protein_per_100g": 8, "carbs_per_100g": 28, "fat_per_100g": 6, "is_vegetarian": False},
    {"name": "Chole Bhature", "category": "north_indian", "calories_per_100g": 180, "protein_per_100g": 6, "carbs_per_100g": 26, "fat_per_100g": 6, "is_vegetarian": True},
    {"name": "Palak Paneer", "category": "north_indian", "calories_per_100g": 115, "protein_per_100g": 7, "carbs_per_100g": 5, "fat_per_100g": 8, "is_vegetarian": True},
    {"name": "Aloo Gobi", "category": "north_indian", "calories_per_100g": 90, "protein_per_100g": 2, "carbs_per_100g": 14, "fat_per_100g": 3, "is_vegetarian": True},
    {"name": "Rajma", "category": "north_indian", "calories_per_100g": 127, "protein_per_100g": 8, "carbs_per_100g": 22, "fat_per_100g": 0.5, "is_vegetarian": True},
    {"name": "Paratha", "category": "north_indian", "calories_per_100g": 320, "protein_per_100g": 7, "carbs_per_100g": 44, "fat_per_100g": 13, "is_vegetarian": True},
    {"name": "Poha", "category": "street_food", "calories_per_100g": 158, "protein_per_100g": 3, "carbs_per_100g": 32, "fat_per_100g": 2, "is_vegetarian": True},
    {"name": "Upma", "category": "south_indian", "calories_per_100g": 112, "protein_per_100g": 3, "carbs_per_100g": 20, "fat_per_100g": 2, "is_vegetarian": True},
    {"name": "Masala Dosa", "category": "south_indian", "calories_per_100g": 180, "protein_per_100g": 4, "carbs_per_100g": 30, "fat_per_100g": 5, "is_vegetarian": True},
    {"name": "Uttapam", "category": "south_indian", "calories_per_100g": 150, "protein_per_100g": 4, "carbs_per_100g": 26, "fat_per_100g": 3, "is_vegetarian": True},
    {"name": "Khichdi", "category": "north_indian", "calories_per_100g": 120, "protein_per_100g": 4, "carbs_per_100g": 22, "fat_per_100g": 2, "is_vegetarian": True},
    {"name": "Tandoori Chicken", "category": "north_indian", "calories_per_100g": 150, "protein_per_100g": 22, "carbs_per_100g": 2, "fat_per_100g": 6, "is_vegetarian": False},
]

# ============ HELPER FUNCTIONS ============
# Nutrition and parsing functions moved to app/utils/
# Imported at top: calculate_calorie_target, calculate_age_from_dob, normalize_base64_image, extract_json_from_text

async def analyze_food_image(image_base64: str) -> Dict[str, Any]:
    """Analyze food image using OpenAI Vision API"""
    try:
        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        normalized_image_base64 = normalize_base64_image(image_base64)
        image_url = f"data:image/jpeg;base64,{normalized_image_base64}"

        response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a nutrition expert analyzing food images. Always respond with valid JSON only.",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Analyze this food image and identify all food items.
            Look for a coin in the image for scale reference (Indian coins: ₹1=16mm, ₹2=25mm, ₹5=23mm, ₹10=27mm).
            
            Return ONLY a JSON response (no markdown, no explanation) with this format:
            {
                "coin_detected": true/false,
                "coin_type": "₹10" or null,
                "foods": [
                    {
                        "name": "Food name",
                        "estimated_quantity_grams": 150,
                        "confidence": "high/medium/low"
                    }
                ],
                "notes": "Any additional observations"
            }
            
            Focus on Indian cuisine if applicable.""",
                        },
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        # Debug: log the raw response
        logger.info(f"Raw LLM response: {response}")

        content = response.choices[0].message.content if response.choices else ""
        extracted = extract_json_from_text(content)

        logger.info(f"Extracted content for JSON parsing: {extracted}")

        result = json.loads(extracted)
        return result
    except Exception as e:
        logger.error(f"Error analyzing image: {str(e)}")
        return {
            "coin_detected": False,
            "coin_type": None,
            "foods": [],
            "error": str(e)
        }


async def detect_food_presence(image_base64: str) -> FoodPresenceResponse:
    try:
        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        normalized_image_base64 = normalize_base64_image(image_base64)
        image_url = f"data:image/jpeg;base64,{normalized_image_base64}"

        response = await openai_client.chat.completions.create(
            model=OPENAI_CHEAP_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a binary classifier. Decide if there is clearly any edible food in the image. Respond with JSON only.",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Return ONLY JSON: {\"has_food\": true/false, \"confidence\": 0..1, \"reason\": \"short\"}. If unsure, set has_food=false with lower confidence.",
                        },
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content if response.choices else ""
        extracted = extract_json_from_text(content)
        parsed = json.loads(extracted)

        return FoodPresenceResponse(
            has_food=bool(parsed.get("has_food", False)),
            confidence=float(parsed.get("confidence", 0.0) or 0.0),
            reason=str(parsed.get("reason", "") or ""),
        )
    except Exception as e:
        logger.error(f"Error detecting food presence: {str(e)}")
        # Don't block the main photo analysis flow if the cheap check fails.
        return FoodPresenceResponse(has_food=True, confidence=0.0, reason="presence_check_failed")

def _normalize_food_name(name: str) -> str:
    """Normalize food name by removing serving size indicators and common prefixes.
    Examples:
    - 'bowl of rice' -> 'Rice'
    - 'plate of pasta' -> 'Pasta'
    - 'cup of coffee' -> 'Coffee'
    - 'glass of milk' -> 'Milk'
    - 'piece of chicken' -> 'Chicken'
    """
    normalized = name.lower().strip()
    
    # Common serving size patterns to remove
    serving_patterns = [
        r'\b(bowl|plate|cup|glass|piece|slice|serving|portion|helping)\s+of\s+',
        r'\b(a|an|one|two|three)\s+(bowl|plate|cup|glass|piece|slice)\s+of\s+',
        r'\b(small|medium|large|big)\s+(bowl|plate|cup|glass|piece|slice)\s+of\s+',
    ]
    
    import re
    for pattern in serving_patterns:
        normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)
    
    # Remove leading/trailing articles
    normalized = re.sub(r'^\b(a|an|the)\s+', '', normalized, flags=re.IGNORECASE)
    
    # Apply title case for consistent capitalization
    normalized = normalized.strip().title()
    
    return normalized


async def _validate_and_estimate_food(query: str) -> Dict[str, Any]:
    """Use AI to validate if query is a food item and estimate its nutrition per 100g.
    Returns: {
        "is_food": bool,
        "reason": str,
        "calories_per_100g": float,
        "protein_per_100g": float,
        "carbs_per_100g": float,
        "fat_per_100g": float
    }
    """
    if openai_client is None:
        logger.warning("OpenAI client not available, using defaults")
        return {
            "is_food": True,
            "reason": "AI unavailable",
            "calories_per_100g": 0.0,
            "protein_per_100g": 0.0,
            "carbs_per_100g": 0.0,
            "fat_per_100g": 0.0,
        }
    
    try:
        response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a nutrition expert. Validate if the text is a food item and provide estimated nutrition per 100g. Be VERY lenient - only reject obvious non-food items like electronics, furniture, or body parts. For valid foods, provide reasonable estimates based on typical values. Return JSON only.",
                },
                {
                    "role": "user",
                    "content": f'''Is "{query}" a food, beverage, ingredient, or edible item? If yes, estimate its nutrition per 100g.

Examples of valid foods: egg, boiled egg, chicken, rice, apple, water, milk, bread, pasta, etc.

Return ONLY JSON in this exact format:
{{
  "is_food": true/false,
  "reason": "brief explanation",
  "calories_per_100g": <number>,
  "protein_per_100g": <number>,
  "carbs_per_100g": <number>,
  "fat_per_100g": <number>
}}

For non-food items, set all nutrition values to 0.
For foods, provide reasonable estimates (e.g., boiled egg: ~155 cal, 13g protein, 1g carbs, 11g fat per 100g).''',
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        
        content = response.choices[0].message.content if response.choices else ""
        extracted = extract_json_from_text(content)
        parsed = json.loads(extracted)
        
        result = {
            "is_food": bool(parsed.get("is_food", False)),
            "reason": str(parsed.get("reason", "")),
            "calories_per_100g": float(parsed.get("calories_per_100g", 0) or 0),
            "protein_per_100g": float(parsed.get("protein_per_100g", 0) or 0),
            "carbs_per_100g": float(parsed.get("carbs_per_100g", 0) or 0),
            "fat_per_100g": float(parsed.get("fat_per_100g", 0) or 0),
        }
        
        logger.info(f"[FOOD_VALIDATION] query='{query}', is_food={result['is_food']}, cal={result['calories_per_100g']}, reason={result['reason']}")
        return result
        
    except Exception as e:
        logger.error(f"[FOOD_VALIDATION] Error validating '{query}': {str(e)}")
        return {
            "is_food": True,
            "reason": "Error during validation",
            "calories_per_100g": 0.0,
            "protein_per_100g": 0.0,
            "carbs_per_100g": 0.0,
            "fat_per_100g": 0.0,
        }

def match_food_to_database(name: str, quantity_grams: float) -> Dict[str, Any]:
    raise RuntimeError("match_food_to_database() should not be used. Use match_food_to_database_db().")


async def match_food_to_database_db(conn: asyncpg.Connection, name: str, quantity_grams: float) -> Dict[str, Any]:
    """Match food name to database food entry and scale to quantity.
    If not found, creates a placeholder food and enqueues it for async enrichment."""
    # Normalize the name to remove serving size indicators (bowl of rice -> rice)
    original_name = (name or "").strip()
    normalized_name = _normalize_food_name(original_name)
    
    logger.info(f"[FOOD_MATCH] original='{original_name}', normalized='{normalized_name}'")
    
    # Try exact match first with normalized name
    row = await conn.fetchrow(
        """
        SELECT id, name, category,
               calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
               is_vegetarian
        FROM foods
        WHERE lower(name) = lower($1)
        LIMIT 1
        """,
        normalized_name,
    )
    
    # If no exact match, try fuzzy match
    if not row:
        logger.info(f"[FOOD_MATCH] No exact match, trying fuzzy search")
        row = await conn.fetchrow(
            """
            SELECT id, name, category,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   is_vegetarian
            FROM foods
            WHERE lower(name) LIKE '%' || lower($1) || '%'
            ORDER BY length(name) ASC
            LIMIT 1
            """,
            normalized_name,
        )
    
    if row:
        logger.info(f"[FOOD_MATCH] Found existing food: '{row['name']}' (id={row['id']})")

    if not row:
        # AI validation + nutrition estimation
        ai_result = await _validate_and_estimate_food(normalized_name)
        
        if not ai_result["is_food"]:
            logger.warning(f"[FOOD_MATCH] AI validation rejected: '{normalized_name}' - {ai_result['reason']}")
            raise HTTPException(
                status_code=400, 
                detail=f"'{normalized_name}' does not appear to be a food item. {ai_result['reason']}"
            )
        
        # Create placeholder food with AI-estimated nutrition
        logger.info(f"[FOOD_MATCH] Creating placeholder with AI estimates: '{normalized_name}' (cal={ai_result['calories_per_100g']})")
        food_id = uuid.uuid4()
        
        await conn.execute(
            """
            INSERT INTO foods (
                id, name, category,
                calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                is_vegetarian, source, verified, review_status, last_used_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
            """,
            food_id,
            normalized_name,
            "user",  # category
            ai_result["calories_per_100g"],  # AI-estimated calories
            ai_result["protein_per_100g"],   # AI-estimated protein
            ai_result["carbs_per_100g"],     # AI-estimated carbs
            ai_result["fat_per_100g"],       # AI-estimated fat
            True,  # is_vegetarian (default)
            "user",  # source
            False,  # verified (will be updated by USDA sync)
            "pending_review",  # review_status - needs user confirmation
        )
        
        # Enqueue for async enrichment (will process after user confirms)
        await conn.execute(
            """
            INSERT INTO foods_ingestion_queue (food_id, query, status)
            VALUES ($1, $2, 'pending')
            ON CONFLICT (food_id) DO NOTHING
            """,
            food_id,
            normalized_name,  # Use normalized name for USDA search
        )
        
        logger.info(f"[FOOD_MATCH] Created pending placeholder food_id={food_id}, awaiting user review")
        
        # Return placeholder with AI-estimated nutrition and needs_review flag
        qty = float(quantity_grams or 0)
        multiplier = qty / 100.0
        return {
            "food_id": str(food_id),
            "name": normalized_name,
            "quantity": qty,
            "calories": round(ai_result["calories_per_100g"] * multiplier, 2),
            "protein": round(ai_result["protein_per_100g"] * multiplier, 2),
            "carbs": round(ai_result["carbs_per_100g"] * multiplier, 2),
            "fat": round(ai_result["fat_per_100g"] * multiplier, 2),
            "sugar": round(ai_result.get("sugar_g_per_100g", 0) * multiplier, 2),
            "sodium": round(ai_result.get("sodium_mg_per_100g", 0) * multiplier, 2),
            "fiber": round(ai_result.get("fiber_g_per_100g", 0) * multiplier, 2),
            "saturated_fat": round(ai_result.get("saturated_fat_g_per_100g", 0) * multiplier, 2),
            "trans_fat": round(ai_result.get("trans_fat_g_per_100g", 0) * multiplier, 2),
            "cholesterol": round(ai_result.get("cholesterol_mg_per_100g", 0) * multiplier, 2),
            "potassium": round(ai_result.get("potassium_mg_per_100g", 0) * multiplier, 2),
            "calcium": round(ai_result.get("calcium_mg_per_100g", 0) * multiplier, 2),
            "iron": round(ai_result.get("iron_mg_per_100g", 0) * multiplier, 2),
            "vitamin_c": round(ai_result.get("vitamin_c_mg_per_100g", 0) * multiplier, 2),
            "calories_per_100g": ai_result["calories_per_100g"],
            "protein_per_100g": ai_result["protein_per_100g"],
            "carbs_per_100g": ai_result["carbs_per_100g"],
            "fat_per_100g": ai_result["fat_per_100g"],
            "matched": False,
            "needs_review": True,  # Frontend should show review modal
            "is_estimated": True,  # Flag for frontend to show "estimated" label
        }
    
    # Found in DB - return scaled values
    qty = float(quantity_grams or 0)
    multiplier = qty / 100.0
    return {
        "food_id": str(row["id"]),
        "name": row["name"],
        "quantity": qty,
        "calories": round(float(row["calories_per_100g"]) * multiplier, 2),
        "protein": round(float(row["protein_per_100g"]) * multiplier, 2),
        "carbs": round(float(row["carbs_per_100g"]) * multiplier, 2),
        "fat": round(float(row["fat_per_100g"]) * multiplier, 2),
        "sugar": round(float(row.get("sugar_g_per_100g", 0) or 0) * multiplier, 2),
        "sodium": round(float(row.get("sodium_mg_per_100g", 0) or 0) * multiplier, 2),
        "fiber": round(float(row.get("fiber_g_per_100g", 0) or 0) * multiplier, 2),
        "saturated_fat": round(float(row.get("saturated_fat_g_per_100g", 0) or 0) * multiplier, 2),
        "trans_fat": round(float(row.get("trans_fat_g_per_100g", 0) or 0) * multiplier, 2),
        "cholesterol": round(float(row.get("cholesterol_mg_per_100g", 0) or 0) * multiplier, 2),
        "potassium": round(float(row.get("potassium_mg_per_100g", 0) or 0) * multiplier, 2),
        "calcium": round(float(row.get("calcium_mg_per_100g", 0) or 0) * multiplier, 2),
        "iron": round(float(row.get("iron_mg_per_100g", 0) or 0) * multiplier, 2),
        "vitamin_c": round(float(row.get("vitamin_c_mg_per_100g", 0) or 0) * multiplier, 2),
        "calories_per_100g": float(row["calories_per_100g"]),
        "protein_per_100g": float(row["protein_per_100g"]),
        "carbs_per_100g": float(row["carbs_per_100g"]),
        "fat_per_100g": float(row["fat_per_100g"]),
        "matched": True,
    }


async def _transcribe_audio_file(file: UploadFile) -> str:
    if openai_client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    audio_bytes = await file.read()
    if not audio_bytes:
        return ""

    transcription = await openai_client.audio.transcriptions.create(
        model="whisper-1",
        file=(file.filename or "audio.m4a", audio_bytes, file.content_type or "application/octet-stream"),
    )

    return (getattr(transcription, "text", None) or "").strip()


async def _infer_portion_from_text(transcript: str) -> Dict[str, Any]:
    if openai_client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    cleaned = (transcript or "").strip()
    if not cleaned:
        return {"quantity": None, "unit": None}

    response = await openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You infer a portion amount from a user's spoken message. "
                    "Return JSON only with schema: {\"quantity\": number|null, \"unit\": \"g\"|\"oz\"|null}. "
                    "Rules: "
                    "- If the user gives grams, use unit 'g'. "
                    "- If the user gives ounces/oz, use unit 'oz'. "
                    "- If the user mentions a number without a unit, assume grams. "
                    "- If the user says something ambiguous (e.g. 'a scoop', 'one serving') and you cannot infer a numeric quantity, return nulls. "
                    "- Do not include any extra keys."
                ),
            },
            {"role": "user", "content": cleaned},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content if response.choices else ""
    extracted = _extract_json_from_text(content)
    parsed = json.loads(extracted) if extracted else {}
    if not isinstance(parsed, dict):
        return {"quantity": None, "unit": None}

    qty = parsed.get("quantity")
    unit = parsed.get("unit")

    try:
        qty_num = float(qty) if qty is not None else None
    except Exception:
        qty_num = None

    if unit is not None:
        unit = str(unit).strip().lower()
        if unit not in {"g", "oz"}:
            unit = None

    return {"quantity": qty_num, "unit": unit}


async def _parse_voice_meal_text(transcript: str) -> List[VoiceToMealFoodItem]:
    if openai_client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    cleaned = (transcript or "").strip()
    if not cleaned:
        return []

    response = await openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract structured food items from a meal description. "
                    "Return JSON only with the schema: {\"foods\": [{\"name\": string, \"quantity_grams\": number}]}. "
                    "IMPORTANT: Always return food names in English only (translate to English if the input is not English). "
                    "Food names must be plain ASCII/English, not native script (e.g., output 'roti' not 'रोटी'). "
                    "If quantity is missing, infer a reasonable default portion size in grams. "
                    "If the user gives household measures (eggs, cups), convert to grams."
                ),
            },
            {"role": "user", "content": cleaned},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content if response.choices else ""
    extracted = _extract_json_from_text(content)
    parsed = json.loads(extracted) if extracted else {}
    foods = parsed.get("foods", []) if isinstance(parsed, dict) else []
    if not isinstance(foods, list):
        return []

    normalized: List[VoiceToMealFoodItem] = []
    for f in foods:
        if not isinstance(f, dict):
            continue
        name = str(f.get("name", "")).strip()
        if not name:
            continue
        try:
            qty = float(f.get("quantity_grams", 0) or 0)
        except Exception:
            qty = 0.0
        normalized.append(VoiceToMealFoodItem(name=name, quantity_grams=max(qty, 0.0)))

    return normalized

# ============ API ROUTES ============

@api_router.get("/")
async def root():
    return {"message": "Loggr API v1.0"}

# ===== User Management =====

@api_router.post("/user/onboard", response_model=UserProfile)
async def onboard_user(user_data: UserProfileCreate, uid: str = Depends(get_current_uid)):
    """Create user profile with calculated targets"""
    try:
        # Parse date of birth and calculate age
        dob = date.fromisoformat(user_data.date_of_birth)
        age = calculate_age_from_dob(dob)

        targets = calculate_calorie_target(
            user_data.weight,
            user_data.height,
            age,
            user_data.gender,
            user_data.activity_level,
            user_data.goal,
        )

        pool = _require_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                 """
                 INSERT INTO profiles (
                     id, name, date_of_birth, age, gender, height, weight,
                     goal, activity_level, dietary_preference,
                     daily_calorie_target, protein_target, carbs_target, fat_target,
                     onboarding_completed, last_weight_check
                 ) VALUES (
                     $1,$2,$3,$4,$5,$6,$7,
                     $8,$9,$10,
                     $11,$12,$13,$14,
                     $15,$16
                 )
                 ON CONFLICT (id) DO UPDATE SET
                     name = EXCLUDED.name,
                     date_of_birth = EXCLUDED.date_of_birth,
                     age = EXCLUDED.age,
                     gender = EXCLUDED.gender,
                     height = EXCLUDED.height,
                     weight = EXCLUDED.weight,
                     goal = EXCLUDED.goal,
                     activity_level = EXCLUDED.activity_level,
                     dietary_preference = EXCLUDED.dietary_preference,
                     daily_calorie_target = EXCLUDED.daily_calorie_target,
                     protein_target = EXCLUDED.protein_target,
                     carbs_target = EXCLUDED.carbs_target,
                     fat_target = EXCLUDED.fat_target,
                     onboarding_completed = EXCLUDED.onboarding_completed,
                     last_weight_check = EXCLUDED.last_weight_check
                 RETURNING *
                 """,
                 to_uuid(uid),
                 user_data.name,
                 dob,
                 age,
                 user_data.gender,
                 user_data.height,
                 user_data.weight,
                 user_data.goal,
                 user_data.activity_level,
                 user_data.dietary_preference,
                 targets["daily_calorie_target"],
                 targets["protein_target"],
                 targets["carbs_target"],
                 targets["fat_target"],
                 True,  # onboarding_completed
                 datetime.utcnow(),  # last_weight_check - set to now on onboarding
            )

            # Also record initial weight in weight history
            await conn.execute(
                """
                INSERT INTO weight_history (user_id, weight, recorded_at, notes)
                VALUES ($1, $2, $3, $4)
                """,
                to_uuid(uid),
                user_data.weight,
                datetime.utcnow(),
                "Initial weight from onboarding",
            )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create profile")
        return UserProfile(**profile_from_record(row))

    except ValueError as e:
        logger.error(f"Invalid date format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid date_of_birth format. Use YYYY-MM-DD")
    except Exception as e:
        logger.error(f"Error onboarding user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/meals/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    user_id: str = Form(...),
    audio: UploadFile = File(...),
    uid: str = Depends(get_current_uid),
):
    """Transcribe short audio (used for portion dictation in barcode flow)."""
    try:
        _require_user_match(uid, user_id)
        transcript = await _transcribe_audio_file(audio)
        return TranscribeResponse(transcript=transcript)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TRANSCRIBE] Error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/meals/infer-portion", response_model=PortionInferResponse)
async def infer_portion(
    user_id: str = Form(...),
    audio: UploadFile = File(...),
    uid: str = Depends(get_current_uid),
):
    """Transcribe audio and infer portion quantity+unit (g/oz) for barcode flow."""
    try:
        _require_user_match(uid, user_id)
        transcript = await _transcribe_audio_file(audio)
        inferred = await _infer_portion_from_text(transcript)
        return PortionInferResponse(
            transcript=transcript,
            quantity=inferred.get("quantity"),
            unit=inferred.get("unit"),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[INFER_PORTION] Error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class UsernameUpdateRequest(BaseModel):
    username: str


class ProfileUpdateRequest(BaseModel):
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


@api_router.post("/user/me/username")
async def set_my_username(payload: UsernameUpdateRequest, uid: str = Depends(get_current_uid)):
    username = (payload.username or "").strip().lower()
    if not re.match(r"^[a-z0-9_]{3,20}$", username):
        raise HTTPException(status_code=400, detail="Username must be 3-20 chars and contain only letters, numbers, underscores")

    pool = _require_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                "UPDATE profiles SET username = $2 WHERE id = $1 RETURNING id, username",
                to_uuid(uid),
                username,
            )
        except UniqueViolationError:
            raise HTTPException(status_code=409, detail="Username is already taken")

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(row["id"]), "username": row["username"]}


@api_router.put("/user/me/profile", response_model=UserProfile)
async def update_my_profile(payload: ProfileUpdateRequest, uid: str = Depends(get_current_uid)):
    bio = payload.bio
    if bio is not None:
        bio = str(bio).strip()
        if len(bio) > 160:
            raise HTTPException(status_code=400, detail="Bio must be 160 characters or less")

    avatar_url = payload.avatar_url
    if avatar_url is not None:
        avatar_url = str(avatar_url).strip()
        if avatar_url == "":
            avatar_url = None

    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE profiles
            SET bio = COALESCE($2, bio),
                avatar_url = COALESCE($3, avatar_url)
            WHERE id = $1
            RETURNING *
            """,
            to_uuid(uid),
            bio,
            avatar_url,
        )

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**profile_from_record(row))


@api_router.get("/users/search")
async def search_users(query: str = Query("", min_length=1, max_length=32), uid: str = Depends(get_current_uid)):
    q = query.strip().lower()
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
              p.id,
              p.name,
              p.username,
              EXISTS(
                SELECT 1
                FROM user_follows uf
                WHERE uf.follower_id = $1 AND uf.following_id = p.id
              ) AS is_following
            FROM profiles p
            WHERE p.username IS NOT NULL
              AND lower(p.username) LIKE $2
            ORDER BY lower(p.username) ASC
            LIMIT 25
            """,
            to_uuid(uid),
            f"%{q}%",
        )

    results = []
    for r in rows:
        results.append({
            "id": str(r["id"]),
            "name": r["name"],
            "username": r["username"],
            "is_following": bool(r["is_following"]),
        })

    return {"results": results}


@api_router.post("/users/{target_user_id}/follow")
async def follow_user(target_user_id: str, uid: str = Depends(get_current_uid)):
    if uid == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    pool = _require_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM profiles WHERE id = $1", to_uuid(target_user_id))
        if not exists:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute(
            "INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            to_uuid(uid),
            to_uuid(target_user_id),
        )
    return {"ok": True}


@api_router.delete("/users/{target_user_id}/follow")
async def unfollow_user(target_user_id: str, uid: str = Depends(get_current_uid)):
    if uid == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot unfollow yourself")
    pool = _require_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2",
            to_uuid(uid),
            to_uuid(target_user_id),
        )
    return {"ok": True}


@api_router.get("/users/me/following")
async def list_following(uid: str = Depends(get_current_uid)):
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.name, p.username
            FROM user_follows uf
            JOIN profiles p ON p.id = uf.following_id
            WHERE uf.follower_id = $1
            ORDER BY uf.created_at DESC
            LIMIT 200
            """,
            to_uuid(uid),
        )
    return {
        "following": [
            {"id": str(r["id"]), "name": r["name"], "username": r["username"]}
            for r in rows
        ]
    }


@api_router.get("/users/me/followers")
async def list_followers(uid: str = Depends(get_current_uid)):
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.name, p.username
            FROM user_follows uf
            JOIN profiles p ON p.id = uf.follower_id
            WHERE uf.following_id = $1
            ORDER BY uf.created_at DESC
            LIMIT 200
            """,
            to_uuid(uid),
        )
    return {
        "followers": [
            {"id": str(r["id"]), "name": r["name"], "username": r["username"]}
            for r in rows
        ]
    }


@api_router.get("/users/{user_id}/public-stats")
async def get_public_user_stats(user_id: str, uid: str = Depends(get_current_uid)):
    """Public-facing stats for profile/leaderboard: XP/level/streak + follower counts (no meal scan)."""
    pool = _require_pool()
    async with pool.acquire() as conn:
        await _ensure_user_xp(conn, user_id)
        row = await conn.fetchrow(
            """
            SELECT
              p.id,
              p.name,
              p.username,
              p.bio,
              p.avatar_url,
              ux.total_xp,
              ux.level,
              ux.current_streak,
              ux.longest_streak,
              ux.quests_completed,
              ux.badges_earned,
              (SELECT COUNT(*)::int FROM user_follows uf WHERE uf.following_id = p.id) AS followers_count,
              (SELECT COUNT(*)::int FROM user_follows uf WHERE uf.follower_id = p.id) AS following_count,
              EXISTS(
                SELECT 1 FROM user_follows uf
                WHERE uf.follower_id = $2 AND uf.following_id = p.id
              ) AS is_followed_by_me
            FROM profiles p
            JOIN user_xp ux ON ux.user_id = p.id
            WHERE p.id = $1
            """,
            to_uuid(user_id),
            to_uuid(uid),
        )

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "username": row["username"],
        "bio": row["bio"],
        "avatar_url": row["avatar_url"],
        "total_xp": int(row["total_xp"] or 0),
        "level": int(row["level"] or 1),
        "current_streak": int(row["current_streak"] or 0),
        "longest_streak": int(row["longest_streak"] or 0),
        "quests_completed": int(row["quests_completed"] or 0),
        "badges_earned": int(row["badges_earned"] or 0),
        "followers_count": int(row["followers_count"] or 0),
        "following_count": int(row["following_count"] or 0),
        "is_followed_by_me": bool(row["is_followed_by_me"]),
    }



@api_router.get("/user/me", response_model=UserProfile)
async def get_me(uid: str = Depends(get_current_uid)):
    """Get current user's profile"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", to_uuid(uid))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**profile_from_record(row))


@api_router.get("/user/{user_id}", response_model=UserProfile)
async def get_user(user_id: str, uid: str = Depends(get_current_uid)):
    """Get user profile"""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", to_uuid(user_id))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**profile_from_record(row))


@api_router.put("/user/{user_id}/goals", response_model=UserProfile)
async def update_goals(user_id: str, payload: GoalsUpdateRequest, uid: str = Depends(get_current_uid)):
    """Update user goals and recalculate targets"""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", to_uuid(user_id))
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

    targets = calculate_calorie_target(
        float(user_row["weight"]),
        float(user_row["height"]),
        int(user_row["age"]),
        str(user_row["gender"]),
        payload.activity_level,
        payload.goal,
    )

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE profiles
            SET goal = $2,
                activity_level = $3,
                daily_calorie_target = $4,
                protein_target = $5,
                carbs_target = $6,
                fat_target = $7
            WHERE id = $1
            RETURNING *
            """,
            to_uuid(user_id),
            payload.goal,
            payload.activity_level,
            targets["daily_calorie_target"],
            targets["protein_target"],
            targets["carbs_target"],
            targets["fat_target"],
        )

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**profile_from_record(row))


class WeightCheckRequest(BaseModel):
    weight: float
    notes: Optional[str] = None


class WeightHistoryEntry(BaseModel):
    id: str
    weight: float
    recorded_at: datetime
    notes: Optional[str] = None


@api_router.post("/user/me/weight-check", response_model=UserProfile)
async def record_weight_check(payload: WeightCheckRequest, uid: str = Depends(get_current_uid)):
    """Record monthly weight check and update profile"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Get current profile
        user_row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", to_uuid(uid))
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        # Calculate new targets if weight changed significantly
        old_weight = float(user_row["weight"])
        new_weight = payload.weight

        # Get age from DOB or stored age
        dob = user_row.get("date_of_birth")
        if dob:
            age = calculate_age_from_dob(dob)
        else:
            age = int(user_row["age"])

        targets = calculate_calorie_target(
            new_weight,
            float(user_row["height"]),
            age,
            str(user_row["gender"]),
            str(user_row["activity_level"]),
            str(user_row["goal"]),
        )

        # Update profile with new weight and recalculated targets
        row = await conn.fetchrow(
            """
            UPDATE profiles
            SET weight = $2,
                last_weight_check = $3,
                daily_calorie_target = $4,
                protein_target = $5,
                carbs_target = $6,
                fat_target = $7
            WHERE id = $1
            RETURNING *
            """,
            to_uuid(uid),
            new_weight,
            datetime.utcnow(),
            targets["daily_calorie_target"],
            targets["protein_target"],
            targets["carbs_target"],
            targets["fat_target"],
        )

        # Record in weight history
        await conn.execute(
            """
            INSERT INTO weight_history (user_id, weight, recorded_at, notes)
            VALUES ($1, $2, $3, $4)
            """,
            to_uuid(uid),
            new_weight,
            datetime.utcnow(),
            payload.notes or f"Weight changed from {old_weight:.1f}kg to {new_weight:.1f}kg",
        )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    return UserProfile(**profile_from_record(row))


@api_router.get("/user/me/weight-history")
async def get_weight_history(uid: str = Depends(get_current_uid), limit: int = 12):
    """Get user's weight history (last N entries, default 12 months)"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, weight, recorded_at, notes
            FROM weight_history
            WHERE user_id = $1
            ORDER BY recorded_at DESC
            LIMIT $2
            """,
            to_uuid(uid),
            limit,
        )

    return [
        WeightHistoryEntry(
            id=str(row["id"]),
            weight=float(row["weight"]),
            recorded_at=row["recorded_at"],
            notes=row.get("notes"),
        )
        for row in rows
    ]


# ===== Food Database =====


@api_router.get("/foods/search")
async def search_foods(query: str = "", category: str = "", vegetarian_only: bool = False):
    """Search foods from Postgres cache"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, brand, barcode, category,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                   source, external_id, verified
            FROM foods
            WHERE ($1 = '' OR lower(name) LIKE '%' || lower($1) || '%'
                OR (brand IS NOT NULL AND lower(brand) LIKE '%' || lower($1) || '%'))
              AND ($2 = '' OR category = $2)
              AND ($3::bool = false OR is_vegetarian = true)
            ORDER BY name ASC
            LIMIT 200
            """,
            (query or "").strip(),
            (category or "").strip(),
            bool(vegetarian_only),
        )

    foods = [dict(r) for r in rows]
    for f in foods:
        f["id"] = str(f["id"])
    return {"foods": foods, "count": len(foods)}


@api_router.get("/foods/categories")
async def get_categories():
    """Get all food categories"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT category FROM foods ORDER BY category ASC")
    return {"categories": [str(r["category"]) for r in rows]}


async def _save_barcode_async(pool, barcode_data: Dict[str, Any]):
    """Save barcode data to barcodes table in background (non-blocking)."""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO barcodes (
                    barcode, product_name, brand, image_url,
                    calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                    fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                    ingredients, source, source_updated_at, verified
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8,
                    $9, $10, $11,
                    $12, 'openfoodfacts', now(), false
                )
                ON CONFLICT (barcode) DO UPDATE SET
                    product_name = EXCLUDED.product_name,
                    brand = EXCLUDED.brand,
                    image_url = EXCLUDED.image_url,
                    calories_per_100g = EXCLUDED.calories_per_100g,
                    protein_per_100g = EXCLUDED.protein_per_100g,
                    carbs_per_100g = EXCLUDED.carbs_per_100g,
                    fat_per_100g = EXCLUDED.fat_per_100g,
                    fiber_g_per_100g = EXCLUDED.fiber_g_per_100g,
                    sugar_g_per_100g = EXCLUDED.sugar_g_per_100g,
                    sodium_mg_per_100g = EXCLUDED.sodium_mg_per_100g,
                    ingredients = EXCLUDED.ingredients,
                    source_updated_at = now()
                """,
                barcode_data["barcode"],
                barcode_data["name"],
                barcode_data["brand"],
                barcode_data["image_url"],
                barcode_data["calories_per_100g"],
                barcode_data["protein_per_100g"],
                barcode_data["carbs_per_100g"],
                barcode_data["fat_per_100g"],
                barcode_data["fiber_g_per_100g"],
                barcode_data["sugar_g_per_100g"],
                barcode_data["sodium_mg_per_100g"],
                barcode_data["ingredients"],
            )
    except Exception as e:
        print(f"[Async] Failed to save barcode {barcode_data.get('barcode')}: {e}")


async def _generate_health_check_for_barcode(barcode: str, food_data: Dict[str, Any]) -> Dict[str, Any] | None:
    """Generate AI health check for barcode and cache it."""
    if openai_client is None:
        return None

    try:
        health_prompt = {
            "barcode": barcode,
            "name": food_data.get("name") or food_data.get("product_name") or "",
            "brand": food_data.get("brand") or "(unknown)",
            "nutrition_per_100g": {
                "calories": float(food_data.get("calories_per_100g") or 0),
                "protein_g": float(food_data.get("protein_per_100g") or 0),
                "carbs_g": float(food_data.get("carbs_per_100g") or 0),
                "fat_g": float(food_data.get("fat_per_100g") or 0),
                "fiber_g": float(food_data.get("fiber_g_per_100g") or 0),
                "sugar_g": float(food_data.get("sugar_g_per_100g") or 0),
                "sodium_mg": float(food_data.get("sodium_mg_per_100g") or 0),
            },
            "ingredients": food_data.get("ingredients") or "(not available)",
        }

        system_prompt = """You are NutriLens, a consumer-friendly nutrition label explainer.
Given a product's nutrition data and ingredients, provide a health analysis.

Return a JSON object:
{
  "verdict": "good" | "caution" | "avoid",
  "verdict_reason": "Brief 1-sentence explanation of the verdict",
  "summary": "2-3 sentence overview of the product's health profile",
  "red_flags": [
    {
      "title": "Issue name",
      "severity": "low" | "medium" | "high",
      "reason": "Brief explanation",
      "what_it_is": "Plain language explanation",
      "why_it_matters": "Health impact",
      "suggestion": "Healthier alternative"
    }
  ],
  "positives": ["Good aspect 1", "Good aspect 2"]
}

Focus on: added sugars, high sodium, ultra-processed additives, refined oils, artificial ingredients.
Limit red_flags to 6 most important. Return ONLY valid JSON."""

        health_response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(health_prompt)},
            ],
            max_tokens=1500,
            temperature=0.2,
        )

        health_text = (health_response.choices[0].message.content or "").strip()
        if health_text.startswith("```"):
            health_text = health_text.split("```")[1]
            if health_text.startswith("json"):
                health_text = health_text[4:]
            health_text = health_text.strip()

        health_data = json.loads(health_text)

        # Build response matching FoodHealthCheckResponse structure
        red_flags = []
        for f in (health_data.get("red_flags") or [])[:6]:
            red_flags.append({
                "title": str(f.get("title") or "Issue"),
                "severity": str(f.get("severity") or "medium"),
                "reason": str(f.get("reason") or ""),
                "what_it_is": f.get("what_it_is"),
                "why_it_matters": f.get("why_it_matters"),
                "evidence": f.get("evidence"),
                "suggestion": f.get("suggestion"),
            })

        result = {
            "barcode": barcode,
            "name": food_data.get("name") or food_data.get("product_name") or "",
            "brand": food_data.get("brand"),
            "verdict": health_data.get("verdict") or "caution",
            "summary": health_data.get("summary") or "",
            "verdict_reason": health_data.get("verdict_reason") or "",
            "red_flags": red_flags,
            "positives": (health_data.get("positives") or [])[:6],
        }

        # Cache the result
        pool = _require_pool()
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO food_health_check_cache (barcode, response_json, expires_at)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (barcode) DO UPDATE
                SET response_json = EXCLUDED.response_json,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = now()
                """,
                barcode,
                json.dumps(result),
                expires_at,
            )

        return result
    except Exception as e:
        print(f"Health check generation failed for {barcode}: {e}")
        return None


@api_router.get("/foods/barcode/{barcode}")
async def get_food_by_barcode(
    barcode: str,
    uid: str = Depends(get_current_uid),
    include_health_check: bool = False,
):
    """Lookup a packaged food by barcode.

    Flow:
    1. Check food_health_check_cache first (if include_health_check=true)
    2. Check barcodes table for nutrition data
    3. If not found, fetch from OpenFoodFacts
    4. Generate health check if needed (async cache to barcodes table)
    """
    variants = _barcode_variants(barcode)
    if not variants:
        raise HTTPException(status_code=400, detail="Missing barcode")

    code = variants[0]
    pool = _require_pool()

    cached_health_check: Dict[str, Any] | None = None
    food_data: Dict[str, Any] | None = None
    from_cache = False

    async with pool.acquire() as conn:
        # Step 1: Check health check cache first (if requested)
        if include_health_check:
            cache_row = await conn.fetchrow(
                """
                SELECT response_json, expires_at
                FROM food_health_check_cache
                WHERE barcode = ANY($1::text[])
                  AND expires_at > now()
                LIMIT 1
                """,
                variants,
            )
            if cache_row and cache_row["response_json"]:
                raw = cache_row["response_json"]
                try:
                    if isinstance(raw, dict):
                        cached_health_check = raw
                    elif isinstance(raw, str):
                        cached_health_check = json.loads(raw)
                    else:
                        # asyncpg jsonb may come back as a mapping-like proxy; avoid dict() on sequences.
                        cached_health_check = json.loads(json.dumps(raw))
                except Exception:
                    cached_health_check = None
                from_cache = bool(cached_health_check)

        # Step 2: Check barcodes table
        row = await conn.fetchrow(
            """
            SELECT barcode, product_name, brand,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                   image_url, ingredients, source, verified
            FROM barcodes
            WHERE barcode = ANY($1::text[])
            LIMIT 1
            """,
            variants,
        )

        if row:
            food_data = {
                "id": row["barcode"],
                "name": row["product_name"],
                "brand": row["brand"],
                "barcode": row["barcode"],
                "category": "packaged",
                "calories_per_100g": float(row["calories_per_100g"] or 0),
                "protein_per_100g": float(row["protein_per_100g"] or 0),
                "carbs_per_100g": float(row["carbs_per_100g"] or 0),
                "fat_per_100g": float(row["fat_per_100g"] or 0),
                "fiber_g_per_100g": float(row["fiber_g_per_100g"] or 0) if row["fiber_g_per_100g"] else None,
                "sugar_g_per_100g": float(row["sugar_g_per_100g"] or 0) if row["sugar_g_per_100g"] else None,
                "sodium_mg_per_100g": float(row["sodium_mg_per_100g"] or 0) if row["sodium_mg_per_100g"] else None,
                "image_url": row["image_url"],
                "ingredients": row["ingredients"],
                "source": row["source"],
                "verified": row["verified"],
            }

    # Step 3: If not in barcodes table, fetch from OpenFoodFacts
    if not food_data:
        payload: Dict[str, Any] | None = None
        product: Dict[str, Any] | None = None
        used_code: str | None = None

        for candidate in variants:
            payload = await _fetch_openfoodfacts(candidate)
            product = (payload or {}).get("product")
            if product:
                used_code = candidate
                break

        if not product or not used_code:
            raise HTTPException(status_code=404, detail="Barcode not found")

        nutriments = product.get("nutriments") or {}
        name = _openfoodfacts_best_name(product, used_code)
        brand = (product.get("brands") or "").strip() or None
        image_url = (product.get("image_url") or "").strip() or None
        ingredients = (product.get("ingredients_text") or product.get("ingredients_text_en") or "").strip() or None

        calories_per_100g = float(_to_float(nutriments.get("energy-kcal_100g")) or 0)
        protein_per_100g = float(_to_float(nutriments.get("proteins_100g")) or 0)
        carbs_per_100g = float(_to_float(nutriments.get("carbohydrates_100g")) or 0)
        fat_per_100g = float(_to_float(nutriments.get("fat_100g")) or 0)
        fiber_g_per_100g = float(_to_float(nutriments.get("fiber_100g")) or 0) if nutriments.get("fiber_100g") else None
        sugar_g_per_100g = float(_to_float(nutriments.get("sugars_100g")) or 0) if nutriments.get("sugars_100g") else None
        sodium_mg_per_100g = float(_to_float(nutriments.get("sodium_100g")) or 0) * 1000 if nutriments.get("sodium_100g") else None

        food_data = {
            "id": used_code,
            "name": name,
            "brand": brand,
            "barcode": used_code,
            "category": "packaged",
            "calories_per_100g": calories_per_100g,
            "protein_per_100g": protein_per_100g,
            "carbs_per_100g": carbs_per_100g,
            "fat_per_100g": fat_per_100g,
            "fiber_g_per_100g": fiber_g_per_100g,
            "sugar_g_per_100g": sugar_g_per_100g,
            "sodium_mg_per_100g": sodium_mg_per_100g,
            "image_url": image_url,
            "ingredients": ingredients,
            "source": "openfoodfacts",
            "verified": False,
        }

        # Save to barcodes table asynchronously (non-blocking)
        asyncio.create_task(_save_barcode_async(pool, food_data))

    # Check if data is incomplete
    needs_contribution = _is_barcode_data_incomplete(food_data)

    # Step 4: Generate health check if requested and not cached
    health_check = cached_health_check
    if include_health_check and not cached_health_check and not needs_contribution:
        health_check = await _generate_health_check_for_barcode(food_data["barcode"], food_data)

    result = {
        "food": food_data,
        "cached": from_cache,
        "needs_contribution": needs_contribution,
    }

    if include_health_check:
        result["health_check"] = health_check

    return result


@api_router.post("/foods/label-submissions", response_model=FoodLabelSubmissionResponse)
async def submit_food_label(payload: FoodLabelSubmissionRequest, uid: str = Depends(get_current_uid)):
    """Allow users to contribute nutrition/ingredients label photos when barcode lookup fails."""
    _require_user_match(uid, payload.user_id)

    barcode = _normalize_barcode(payload.barcode)
    if not barcode:
        raise HTTPException(status_code=400, detail="Missing barcode")

    images = [str(x).strip() for x in (payload.images_base64 or []) if str(x).strip()]
    if not images:
        raise HTTPException(status_code=400, detail="Missing images")

    pool = _require_pool()
    submission_id = uuid.uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO food_label_submissions (id, user_id, barcode, images_base64, notes, status)
            VALUES ($1, $2::uuid, $3, $4::jsonb, $5, 'pending')
            """,
            submission_id,
            payload.user_id,
            barcode,
            json.dumps(images),
            (payload.notes or None),
        )

    return FoodLabelSubmissionResponse(submission_id=str(submission_id), status="pending")


@api_router.post("/foods/process-label")
async def process_label_image(payload: ProcessLabelRequest, uid: str = Depends(get_current_uid)):
    """Process a nutrition label image with AI to extract data and perform health check.

    Flow:
    1. Send image to GPT-4 Vision to extract nutrition data
    2. Save extracted food to database (for review)
    3. Run health check analysis on extracted data
    4. Return both food and health check results
    """
    _require_user_match(uid, payload.user_id)

    if openai_client is None:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")

    barcode = _normalize_barcode(payload.barcode)
    if not barcode:
        raise HTTPException(status_code=400, detail="Missing barcode")

    images_b64: List[str] = []
    if payload.images_base64:
        images_b64 = [str(x or "").strip() for x in (payload.images_base64 or []) if str(x or "").strip()]
    elif payload.image_base64:
        images_b64 = [str(payload.image_base64 or "").strip()]

    if not images_b64:
        raise HTTPException(status_code=400, detail="Missing image")

    if len(images_b64) > 3:
        raise HTTPException(status_code=400, detail="Too many images (max 3)")

    front_b64 = (payload.front_image_base64 or "").strip() or None

    pool = _require_pool()

    # Step 1: Extract nutrition data from image using GPT-4 Vision
    extraction_prompt = """Analyze this nutrition label image and extract the following information.
Return a JSON object with these fields:

{
  "name": "Product name if visible, otherwise describe the product",
  "brand": "Brand name if visible, otherwise null",
  "serving_size_g": 100,
  "calories_per_100g": number,
  "protein_per_100g": number (in grams),
  "carbs_per_100g": number (in grams),
  "fat_per_100g": number (in grams),
  "fiber_g_per_100g": number or null,
  "sugar_g_per_100g": number or null,
  "sodium_mg_per_100g": number or null,
  "ingredients": "Full ingredients list text if visible, otherwise null"
}

IMPORTANT:
- If the label shows values per serving, convert to per 100g
- If any value is not visible or unclear, use 0 for required fields or null for optional
- Extract the full ingredients list exactly as written
- Return ONLY valid JSON, no other text"""

    try:
        content_parts: List[Dict[str, Any]] = [{"type": "text", "text": extraction_prompt}]
        for b64 in images_b64:
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{b64}",
                        "detail": "high",
                    },
                }
            )

        vision_response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": content_parts,
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=1500,
            temperature=0.1,
        )

        raw_text = (vision_response.choices[0].message.content or "").strip()
        # Clean up markdown code blocks if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        try:
            extracted = json.loads(raw_text)
        except json.JSONDecodeError:
            # Fallback: attempt to parse the first JSON object embedded in the response.
            start = raw_text.find("{")
            end = raw_text.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    extracted = json.loads(raw_text[start : end + 1])
                except json.JSONDecodeError:
                    repair_prompt = (
                        "You are a strict JSON repair tool. "
                        "Convert the following text into a single valid JSON object. "
                        "Return ONLY JSON, no markdown or extra text."
                    )

                    repair_response = await openai_client.chat.completions.create(
                        model=OPENAI_MODEL,
                        messages=[
                            {"role": "user", "content": repair_prompt + "\n\n" + (raw_text[start : end + 1] or "")}
                        ],
                        response_format={"type": "json_object"},
                        max_tokens=1500,
                        temperature=0.0,
                    )
                    repair_text = (repair_response.choices[0].message.content or "").strip()
                    extracted = json.loads(repair_text)
            else:
                repair_prompt = (
                    "You are a strict JSON repair tool. "
                    "Convert the following text into a single valid JSON object. "
                    "Return ONLY JSON, no markdown or extra text."
                )

                repair_response = await openai_client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=[{"role": "user", "content": repair_prompt + "\n\n" + (raw_text or "")}],
                    response_format={"type": "json_object"},
                    max_tokens=1500,
                    temperature=0.0,
                )
                repair_text = (repair_response.choices[0].message.content or "").strip()
                extracted = json.loads(repair_text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")

    # If barcode already exists in our barcodes table, prefer its name/brand.
    # We'll still use the label photo to extract missing ingredients/nutrition.
    existing_barcode: Dict[str, Any] | None = None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT barcode, product_name, brand,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                   ingredients
            FROM barcodes
            WHERE barcode = $1
            LIMIT 1
            """,
            barcode,
        )
        if row:
            existing_barcode = dict(row)

    # Validate extracted data
    extracted_name = str(extracted.get("name") or "").strip() or None
    extracted_brand = extracted.get("brand")
    if extracted_brand is not None:
        extracted_brand = str(extracted_brand).strip() or None

    extracted_calories = float(extracted.get("calories_per_100g") or 0)
    extracted_protein = float(extracted.get("protein_per_100g") or 0)
    extracted_carbs = float(extracted.get("carbs_per_100g") or 0)
    extracted_fat = float(extracted.get("fat_per_100g") or 0)
    extracted_fiber = float(extracted.get("fiber_g_per_100g") or 0) if extracted.get("fiber_g_per_100g") else None
    extracted_sugar = float(extracted.get("sugar_g_per_100g") or 0) if extracted.get("sugar_g_per_100g") else None
    extracted_sodium = float(extracted.get("sodium_mg_per_100g") or 0) if extracted.get("sodium_mg_per_100g") else None
    extracted_ingredients = extracted.get("ingredients")
    if extracted_ingredients is not None:
        extracted_ingredients = str(extracted_ingredients).strip() or None

    name = (
        (existing_barcode or {}).get("product_name")
        or extracted_name
        or f"Barcode {barcode}"
    )
    brand = (existing_barcode or {}).get("brand") or extracted_brand

    def _prefer_extracted_numeric(extracted_val: float, existing_val: Any) -> float:
        if float(extracted_val or 0) > 0:
            return float(extracted_val)
        return float(existing_val or 0)

    calories_per_100g = _prefer_extracted_numeric(extracted_calories, (existing_barcode or {}).get("calories_per_100g"))
    protein_per_100g = _prefer_extracted_numeric(extracted_protein, (existing_barcode or {}).get("protein_per_100g"))
    carbs_per_100g = _prefer_extracted_numeric(extracted_carbs, (existing_barcode or {}).get("carbs_per_100g"))
    fat_per_100g = _prefer_extracted_numeric(extracted_fat, (existing_barcode or {}).get("fat_per_100g"))

    fiber_g_per_100g = extracted_fiber if extracted_fiber is not None else (existing_barcode or {}).get("fiber_g_per_100g")
    sugar_g_per_100g = extracted_sugar if extracted_sugar is not None else (existing_barcode or {}).get("sugar_g_per_100g")
    sodium_mg_per_100g = extracted_sodium if extracted_sodium is not None else (existing_barcode or {}).get("sodium_mg_per_100g")

    ingredients = extracted_ingredients or (existing_barcode or {}).get("ingredients")

    review_id = uuid.uuid4()

    label_urls: List[str] = []
    front_url: str | None = None
    try:
        now_key = datetime.now(timezone.utc).strftime("%Y%m%d")
        for idx, b64 in enumerate(images_b64[:3]):
            label_path = f"label_reviews/{barcode}/{now_key}/{review_id}_label_{idx + 1}.jpg"
            label_bytes = base64.b64decode(_normalize_base64_image(b64))
            await _upload_supabase_storage_object(SUPABASE_STORAGE_BUCKET, label_path, "image/jpeg", label_bytes)
            label_urls.append(await _supabase_storage_object_url(SUPABASE_STORAGE_BUCKET, label_path))

        if front_b64:
            front_path = f"label_reviews/{barcode}/{now_key}/{review_id}_front.jpg"
            front_bytes = base64.b64decode(_normalize_base64_image(front_b64))
            await _upload_supabase_storage_object(SUPABASE_STORAGE_BUCKET, front_path, "image/jpeg", front_bytes)
            front_url = await _supabase_storage_object_url(SUPABASE_STORAGE_BUCKET, front_path)
    except Exception as e:
        logger.error(f"[LABEL_REVIEW_STORAGE] Upload failed: {type(e).__name__}: {str(e)}")

    review_notes_payload = {
        "label_image_url": (label_urls[0] if label_urls else None),
        "label_image_urls": label_urls,
        "front_image_url": front_url,
    }
    review_notes = json.dumps(review_notes_payload)

    # Step 2: Generate health check first (before saving, so we can store it with the review)
    health_check_result = None
    try:
        health_prompt = {
            "barcode": barcode,
            "name": name,
            "brand": brand or "(unknown)",
            "nutrition_per_100g": {
                "calories": calories_per_100g,
                "protein_g": protein_per_100g,
                "carbs_g": carbs_per_100g,
                "fat_g": fat_per_100g,
                "fiber_g": fiber_g_per_100g or 0,
                "sugar_g": sugar_g_per_100g or 0,
                "sodium_mg": sodium_mg_per_100g or 0,
            },
            "ingredients": ingredients or "(not available)",
        }

        system_prompt = """You are NutriLens, a consumer-friendly nutrition label explainer.
Given a product's nutrition data and ingredients, provide a health analysis.

Return a JSON object:
{
  "verdict": "good" | "caution" | "avoid",
  "verdict_reason": "Brief 1-sentence explanation of the verdict",
  "summary": "2-3 sentence overview of the product's health profile",
  "red_flags": [
    {
      "title": "Issue name",
      "severity": "low" | "medium" | "high",
      "reason": "Brief explanation",
      "what_it_is": "Plain language explanation of the ingredient/issue",
      "why_it_matters": "Health impact",
      "suggestion": "Healthier alternative"
    }
  ],
  "positives": ["Good aspect 1", "Good aspect 2"]
}

Focus on: added sugars, high sodium, ultra-processed additives, refined oils, artificial ingredients.
Limit red_flags to 6 most important. Return ONLY valid JSON."""

        health_response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(health_prompt)},
            ],
            max_tokens=1500,
            temperature=0.2,
        )

        health_text = (health_response.choices[0].message.content or "").strip()
        if health_text.startswith("```"):
            health_text = health_text.split("```")[1]
            if health_text.startswith("json"):
                health_text = health_text[4:]
            health_text = health_text.strip()

        health_data = json.loads(health_text)

        # Build response
        red_flags = []
        for f in (health_data.get("red_flags") or [])[:6]:
            red_flags.append(FoodHealthFlag(
                title=str(f.get("title") or "Issue"),
                severity=str(f.get("severity") or "medium"),
                reason=str(f.get("reason") or ""),
                what_it_is=f.get("what_it_is"),
                why_it_matters=f.get("why_it_matters"),
                evidence=f.get("evidence"),
                suggestion=f.get("suggestion"),
            ))

        health_check_result = FoodHealthCheckResponse(
            barcode=barcode,
            name=name,
            brand=brand,
            verdict=health_data.get("verdict") or "caution",
            summary=health_data.get("summary") or "",
            verdict_reason=health_data.get("verdict_reason") or "",
            red_flags=red_flags,
            positives=(health_data.get("positives") or [])[:6],
        )
    except Exception as e:
        # Health check is optional, don't fail the whole request
        print(f"Health check generation failed: {e}")
        health_data = None

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO food_label_reviews (
                id, barcode, submitted_by,
                product_name, brand,
                calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                ingredients, health_check_json, review_notes, status
            ) VALUES (
                $1, $2, $3::uuid,
                $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14::jsonb, $15, 'pending'
            )
            """,
            review_id,
            barcode,
            payload.user_id,
            name,
            brand,
            calories_per_100g,
            protein_per_100g,
            carbs_per_100g,
            fat_per_100g,
            fiber_g_per_100g,
            sugar_g_per_100g,
            sodium_mg_per_100g,
            ingredients,
            json.dumps(health_check_result.model_dump()) if health_check_result else None,
            review_notes,
        )

    # Build food data object to return (not saved to foods table yet - pending review)
    food_data = {
        "id": str(review_id),
        "name": name,
        "brand": brand,
        "barcode": barcode,
        "category": "packaged",
        "calories_per_100g": calories_per_100g,
        "protein_per_100g": protein_per_100g,
        "carbs_per_100g": carbs_per_100g,
        "fat_per_100g": fat_per_100g,
        "fiber_g_per_100g": fiber_g_per_100g,
        "sugar_g_per_100g": sugar_g_per_100g,
        "sodium_mg_per_100g": sodium_mg_per_100g,
        "ingredients": ingredients,
        "image_url": None,
        "source": "user_label",
        "verified": False,
        "pending_review": True,
    }

    return {
        "food": food_data,
        "health_check": health_check_result.model_dump() if health_check_result else None,
    }


class ApproveLabelReviewRequest(BaseModel):
    review_id: str
    action: str  # "approve" or "reject"
    notes: str | None = None


@api_router.post("/admin/label-reviews/action")
async def approve_label_review(
    payload: ApproveLabelReviewRequest,
    admin_key: str = Header(None, alias="X-Admin-Key"),
):
    """Admin endpoint to approve or reject a label review.

    When approved:
    - Data is copied to the foods table
    - Health check is cached in food_health_check_cache
    """
    # Verify admin key
    if not ADMIN_SYNC_KEY or admin_key != ADMIN_SYNC_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")

    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    pool = _require_pool()

    async with pool.acquire() as conn:
        # Fetch the review
        review = await conn.fetchrow(
            """
            SELECT id, barcode, product_name, brand,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                   ingredients, health_check_json, status
            FROM food_label_reviews
            WHERE id = $1
            """,
            uuid.UUID(payload.review_id),
        )

        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        if review["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Review already {review['status']}")

        if payload.action == "reject":
            # Just mark as rejected
            await conn.execute(
                """
                UPDATE food_label_reviews
                SET status = 'rejected', review_notes = $1, reviewed_at = now()
                WHERE id = $2
                """,
                payload.notes,
                uuid.UUID(payload.review_id),
            )
            return {"status": "rejected", "review_id": payload.review_id}

        # Approve: Save to barcodes table
        barcode = review["barcode"]

        # Upsert into barcodes table
        await conn.execute(
            """
            INSERT INTO barcodes (
                barcode, product_name, brand,
                calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                ingredients, source, verified
            ) VALUES (
                $1, $2, $3,
                $4, $5, $6, $7,
                $8, $9, $10,
                $11, 'user_contribution', true
            )
            ON CONFLICT (barcode) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                brand = EXCLUDED.brand,
                calories_per_100g = EXCLUDED.calories_per_100g,
                protein_per_100g = EXCLUDED.protein_per_100g,
                carbs_per_100g = EXCLUDED.carbs_per_100g,
                fat_per_100g = EXCLUDED.fat_per_100g,
                fiber_g_per_100g = EXCLUDED.fiber_g_per_100g,
                sugar_g_per_100g = EXCLUDED.sugar_g_per_100g,
                sodium_mg_per_100g = EXCLUDED.sodium_mg_per_100g,
                ingredients = EXCLUDED.ingredients,
                source = 'user_contribution',
                verified = true
            """,
            barcode,
            review["product_name"],
            review["brand"],
            review["calories_per_100g"],
            review["protein_per_100g"],
            review["carbs_per_100g"],
            review["fat_per_100g"],
            review["fiber_g_per_100g"],
            review["sugar_g_per_100g"],
            review["sodium_mg_per_100g"],
            review["ingredients"],
        )

        # Cache health check if available
        if review["health_check_json"]:
            expires_at = datetime.now(timezone.utc) + timedelta(days=365)  # 1 year for user contributions
            await conn.execute(
                """
                INSERT INTO food_health_check_cache (barcode, response_json, expires_at)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (barcode) DO UPDATE
                SET response_json = EXCLUDED.response_json,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = now()
                """,
                barcode,
                json.dumps(review["health_check_json"]) if isinstance(review["health_check_json"], dict) else review["health_check_json"],
                expires_at,
            )

        # Mark review as approved
        await conn.execute(
            """
            UPDATE food_label_reviews
            SET status = 'approved', review_notes = $1, reviewed_at = now()
            WHERE id = $2
            """,
            payload.notes,
            uuid.UUID(payload.review_id),
        )

    return {
        "status": "approved",
        "review_id": payload.review_id,
        "barcode": barcode,
    }


@api_router.get("/admin/label-reviews")
async def list_label_reviews(
    status: str = "pending",
    limit: int = 50,
    admin_key: str = Header(None, alias="X-Admin-Key"),
):
    """Admin endpoint to list label reviews for approval."""
    if not ADMIN_SYNC_KEY or admin_key != ADMIN_SYNC_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")

    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, barcode, product_name, brand,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   ingredients, health_check_json, status, created_at
            FROM food_label_reviews
            WHERE status = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            status,
            limit,
        )

    return {
        "reviews": [
            {
                "id": str(r["id"]),
                "barcode": r["barcode"],
                "product_name": r["product_name"],
                "brand": r["brand"],
                "calories_per_100g": r["calories_per_100g"],
                "protein_per_100g": r["protein_per_100g"],
                "carbs_per_100g": r["carbs_per_100g"],
                "fat_per_100g": r["fat_per_100g"],
                "ingredients": r["ingredients"],
                "health_check": r["health_check_json"],
                "status": r["status"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@api_router.post("/foods/health-check", response_model=FoodHealthCheckResponse)
async def food_health_check(payload: FoodHealthCheckRequest, uid: str = Depends(get_current_uid)):
    """AI health check for a packaged food by barcode.

    Returns a simple verdict and the most important red flags people typically who don't read the labels.
    This is not medical advice.
    """
    try:
        _require_user_match(uid, payload.user_id)

        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        variants = _barcode_variants(payload.barcode)
        if not variants:
            raise HTTPException(status_code=400, detail="Missing barcode")

        code = variants[0]

        pool = _require_pool()

        # 1) Fetch product + attempt cache hit (do not hold DB conn during OpenAI call)
        product: Dict[str, Any] | None = None
        cache_barcode: str = ""
        prompt: Dict[str, Any] | None = None
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT name, brand, barcode,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                       ingredients, image_url
                FROM foods
                WHERE barcode = ANY($1::text[])
                LIMIT 1
                """,
                variants,
            )

            if not row:
                raise HTTPException(status_code=404, detail="Product not found. Scan the barcode first.")

            product = dict(row)
            cache_barcode = (product.get("barcode") or code or "").strip()

            if cache_barcode:
                cached = await conn.fetchrow(
                    """
                    SELECT response_json
                    FROM food_health_check_cache
                    WHERE barcode = $1
                      AND expires_at > now()
                      AND (expires_at::date > now()::date)
                    LIMIT 1
                    """,
                    cache_barcode,
                )
                if cached and cached.get("response_json"):
                    try:
                        return FoodHealthCheckResponse(**dict(cached["response_json"]))
                    except Exception:
                        # If cached payload shape drifted, ignore cache and recompute.
                        pass

            ingredients = (product.get("ingredients") or "").strip()
            if not ingredients:
                ingredients = "(ingredients not available)"

            prompt = {
                "barcode": product.get("barcode") or code,
                "name": product.get("name") or f"Barcode {code}",
                "brand": product.get("brand"),
                "per_100g": {
                    "calories_kcal": float(product.get("calories_per_100g") or 0),
                    "protein_g": float(product.get("protein_per_100g") or 0),
                    "carbs_g": float(product.get("carbs_per_100g") or 0),
                    "fat_g": float(product.get("fat_per_100g") or 0),
                    "fiber_g": float(product.get("fiber_g_per_100g") or 0),
                    "sugar_g": float(product.get("sugar_g_per_100g") or 0),
                    "sodium_mg": float(product.get("sodium_mg_per_100g") or 0),
                },
                "ingredients": ingredients,
            }

            per_100g = prompt.get("per_100g") or {}
            has_any_nutrition = any(float(per_100g.get(k) or 0) > 0 for k in per_100g.keys())
            has_real_ingredients = ingredients != "(ingredients not available)"
            if (not has_any_nutrition) and (not has_real_ingredients):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "needs_contribution",
                        "message": "Product found but label/nutrition data is missing. Ask user to contribute photos.",
                        "barcode": prompt.get("barcode") or code,
                    },
                )

        response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are NutriLens, a consumer-friendly nutrition label explainer. "
                        "Given a packaged food's ingredients and per-100g nutrients, decide if it's GOOD, CAUTION, or AVOID. "
                        "Explain clearly and specifically using evidence from the label. "
                        "Focus on common marketing traps: added sugars, high sodium, ultra-processed additives, refined oils, "
                        "misleading 'healthy' positioning, and low protein/fiber where relevant. "
                        "Do NOT give medical advice. Avoid scary language; be factual. "
                        "Return ONLY valid JSON with this shape: "
                        "{\n"
                        "  \"verdict\": \"good|caution|avoid\",\n"
                        "  \"summary\": \"1-2 sentence consumer summary\",\n"
                        "  \"verdict_reason\": \"Short explanation of why this verdict\",\n"
                        "  \"red_flags\": [\n"
                        "    {\n"
                        "      \"title\": \"string\",\n"
                        "      \"severity\": \"low|medium|high\",\n"
                        "      \"reason\": \"one-line reason\",\n"
                        "      \"what_it_is\": \"what this ingredient/nutrient means in plain language\",\n"
                        "      \"why_it_matters\": \"why it matters for health (general, non-medical)\",\n"
                        "      \"evidence\": \"e.g., ingredient names found or sugar/sodium per 100g\",\n"
                        "      \"suggestion\": \"what to choose instead / what to look for\"\n"
                        "    }\n"
                        "  ],\n"
                        "  \"positives\": [\"1-6 short positives\"]\n"
                        "}"
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt),
                },
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content if response.choices else ""
        parsed: Dict[str, Any] = json.loads(content or "{}")

        verdict = (parsed.get("verdict") or "caution").strip().lower()
        if verdict not in {"good", "caution", "avoid"}:
            verdict = "caution"

        verdict_reason = str(parsed.get("verdict_reason") or "").strip()

        flags_in = parsed.get("red_flags") or []
        red_flags: List[FoodHealthFlag] = []
        if isinstance(flags_in, list):
            for f in flags_in[:8]:
                if not isinstance(f, dict):
                    continue
                title = str(f.get("title") or "").strip()
                reason = str(f.get("reason") or "").strip()
                severity = str(f.get("severity") or "medium").strip().lower()
                if severity not in {"low", "medium", "high"}:
                    severity = "medium"
                what_it_is = str(f.get("what_it_is") or "").strip() or None
                why_it_matters = str(f.get("why_it_matters") or "").strip() or None
                evidence = str(f.get("evidence") or "").strip() or None
                suggestion = str(f.get("suggestion") or "").strip() or None

                if title and reason:
                    red_flags.append(
                        FoodHealthFlag(
                            title=title,
                            severity=severity,
                            reason=reason,
                            what_it_is=what_it_is,
                            why_it_matters=why_it_matters,
                            evidence=evidence,
                            suggestion=suggestion,
                        )
                    )

        positives_in = parsed.get("positives") or []
        positives: List[str] = []
        if isinstance(positives_in, list):
            positives = [str(x).strip() for x in positives_in if str(x).strip()][:6]

        if not product or not prompt:
            raise HTTPException(status_code=500, detail="Failed to prepare analysis input")

        result = FoodHealthCheckResponse(
            barcode=product.get("barcode") or code,
            name=product.get("name") or f"Barcode {code}",
            brand=product.get("brand"),
            verdict=verdict,
            summary=str(parsed.get("summary") or "").strip() or "",
            verdict_reason=verdict_reason,
            red_flags=red_flags,
            positives=positives,
        )

        # 3) Cache result for 30 days
        if cache_barcode:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO food_health_check_cache (barcode, response_json, created_at, updated_at, expires_at)
                    VALUES ($1, $2::jsonb, now(), now(), now() + interval '30 days')
                    ON CONFLICT (barcode)
                    DO UPDATE SET
                        response_json = EXCLUDED.response_json,
                        updated_at = now(),
                        expires_at = EXCLUDED.expires_at
                    """,
                    cache_barcode,
                    json.dumps(result.model_dump()),
                )

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FOOD_HEALTH_CHECK] Error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ===== Meal Logging =====

@api_router.post("/meals/log-photo")
async def log_meal_photo(request: PhotoAnalysisRequest, uid: str = Depends(get_current_uid)):
    """Log meal from photo using AI analysis"""
    try:
        _require_user_match(uid, request.user_id)
        analysis = await analyze_food_image(request.image_base64)
        if "error" in analysis:
            raise HTTPException(status_code=500, detail=analysis["error"])

        pool = _require_pool()
        matched_foods: List[Dict[str, Any]] = []
        async with pool.acquire() as conn:
            for food in analysis.get("foods", []):
                matched = await match_food_to_database_db(
                    conn,
                    food.get("name", ""),
                    float(food.get("estimated_quantity_grams", 0) or 0),
                )
                matched["confidence"] = food.get("confidence", "medium")
                matched_foods.append(matched)

        return {
            "coin_detected": analysis.get("coin_detected", False),
            "coin_type": analysis.get("coin_type"),
            "foods": matched_foods,
            "notes": analysis.get("notes", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error logging photo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/meals/voice-to-meal", response_model=VoiceToMealResponse)
async def voice_to_meal(
    user_id: str = Form(...),
    audio: UploadFile = File(...),
    uid: str = Depends(get_current_uid),
):
    """Transcribe uploaded audio and parse into structured foods for the existing confirmation UI."""
    try:
        logger.info(f"[VOICE_TO_MEAL] Starting voice-to-meal for user={user_id}")
        _require_user_match(uid, user_id)

        logger.info(f"[VOICE_TO_MEAL] Transcribing audio file")
        transcript = await _transcribe_audio_file(audio)
        logger.info(f"[VOICE_TO_MEAL] Transcript: {transcript}")
        
        logger.info(f"[VOICE_TO_MEAL] Parsing transcript into foods")
        parsed_foods = await _parse_voice_meal_text(transcript)
        logger.info(f"[VOICE_TO_MEAL] Parsed {len(parsed_foods)} foods: {[f.name for f in parsed_foods]}")

        pool = _require_pool()
        matched_foods: List[Dict[str, Any]] = []
        async with pool.acquire() as conn:
            for idx, item in enumerate(parsed_foods):
                try:
                    logger.info(f"[VOICE_TO_MEAL] Matching food {idx+1}/{len(parsed_foods)}: {item.name} ({item.quantity_grams}g)")
                    matched = await match_food_to_database_db(conn, item.name, float(item.quantity_grams))
                    matched["displayQuantity"] = round(float(item.quantity_grams), 1)
                    matched["displayUnit"] = "g"
                    matched_foods.append(matched)
                    logger.info(f"[VOICE_TO_MEAL] Successfully matched: {item.name} -> food_id={matched.get('food_id')}, needs_review={matched.get('needs_review', False)}")
                except HTTPException as e:
                    logger.error(f"[VOICE_TO_MEAL] Failed to match food '{item.name}': {e.status_code} - {e.detail}")
                    raise
                except Exception as e:
                    logger.error(f"[VOICE_TO_MEAL] Unexpected error matching food '{item.name}': {str(e)}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Failed to match food '{item.name}': {str(e)}")

        logger.info(f"[VOICE_TO_MEAL] Successfully matched all {len(matched_foods)} foods")
        return VoiceToMealResponse(transcript=transcript, foods=matched_foods)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[VOICE_TO_MEAL] Unexpected error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/meals/text-to-meal", response_model=VoiceToMealResponse)
async def text_to_meal(payload: TextToMealRequest, uid: str = Depends(get_current_uid)):
    """Parse a typed meal description into structured foods for the manual logging confirmation UI."""
    try:
        _require_user_match(uid, payload.user_id)

        transcript = (payload.text or "").strip()
        parsed_foods = await _parse_voice_meal_text(transcript)
        if not parsed_foods:
            return VoiceToMealResponse(transcript=transcript, foods=[])

        pool = _require_pool()
        matched_foods: List[Dict[str, Any]] = []
        async with pool.acquire() as conn:
            for item in parsed_foods:
                matched = await match_food_to_database_db(conn, item.name, float(item.quantity_grams))
                matched["displayQuantity"] = round(float(item.quantity_grams), 1)
                matched["displayUnit"] = "g"
                matched_foods.append(matched)

        return VoiceToMealResponse(transcript=transcript, foods=matched_foods)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TEXT_TO_MEAL] Error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/meals/log", response_model=MealLog)
async def log_meal(meal_data: MealLogCreate, uid: str = Depends(get_current_uid)):
    """Log a meal manually or save photo analysis result"""
    try:
        logger.info(f"[LOG_MEAL] Starting meal log for user={meal_data.user_id}, meal_type={meal_data.meal_type}, foods_count={len(meal_data.foods)}")
        _require_user_match(uid, meal_data.user_id)

        # Calculate macro totals
        total_calories = sum([f["calories"] for f in meal_data.foods])
        total_protein = sum([f["protein"] for f in meal_data.foods])
        total_carbs = sum([f["carbs"] for f in meal_data.foods])
        total_fat = sum([f["fat"] for f in meal_data.foods])
        
        logger.info(f"[LOG_MEAL] Calculated totals: cal={total_calories}, protein={total_protein}, carbs={total_carbs}, fat={total_fat}")

        # Prepare foods JSON with hidden metrics for analytics
        foods_for_db = []
        foods_for_micros: list[dict[str, Any]] = []
        missing_food_id_count = 0
        missing_quantity_count = 0
        
        for f in meal_data.foods:
            fid = f.get("food_id")
            grams = f.get("quantity")
            if grams is None:
                grams = f.get("displayQuantity")
            try:
                grams_f = float(grams or 0)
            except Exception:
                grams_f = 0.0
            if not fid:
                missing_food_id_count += 1
            if grams is None:
                missing_quantity_count += 1

            food_item = {
                "food_id": str(fid) if fid else None,
                "quantity": grams_f,
                "name": f.get("name", "Unknown"),
                "calories": f.get("calories", 0),
                "protein": f.get("protein", 0),
                "carbs": f.get("carbs", 0),
                "fat": f.get("fat", 0),
                "sugar": f.get("sugar", 0),  # Hidden metric
                "sodium": f.get("sodium", 0),  # Hidden metric
                "trans_fat": f.get("trans_fat", 0),  # Hidden metric
                "saturated_fat": f.get("saturated_fat", 0),  # Hidden metric
                "ingredients": f.get("ingredients", []),  # For frequent ingredients
            }
            foods_for_db.append(food_item)

            if fid and grams_f > 0:
                foods_for_micros.append({"food_id": str(fid), "quantity": grams_f})

        if missing_food_id_count:
            logger.info(f"[LOG_MEAL] {missing_food_id_count}/{len(meal_data.foods)} foods missing food_id; micros may be partial")
        if missing_quantity_count:
            logger.info(f"[LOG_MEAL] {missing_quantity_count}/{len(meal_data.foods)} foods missing quantity; micros may be partial")

        pool = _require_pool()
        async with pool.acquire() as conn:
            profile_exists = await conn.fetchval(
                "SELECT 1 FROM profiles WHERE id = $1",
                to_uuid(meal_data.user_id),
            )
            logger.info(f"[LOG_MEAL] Profile check: exists={profile_exists}")
            if not profile_exists:
                raise HTTPException(status_code=404, detail="User not found")

            # Compute micronutrients using the foods table per-100g data (single source of truth).
            micros = _create_empty_micros()
            if foods_for_micros:
                food_ids: list[uuid.UUID] = []
                for f in foods_for_micros:
                    try:
                        food_ids.append(uuid.UUID(str(f.get("food_id"))))
                    except Exception:
                        continue

                foods_by_id: dict[str, dict] = {}
                if food_ids:
                    food_rows = await conn.fetch(
                        """
                        SELECT
                            id,
                            fiber_g_per_100g,
                            sugar_g_per_100g,
                            saturated_fat_g_per_100g,
                            trans_fat_g_per_100g,
                            cholesterol_mg_per_100g,
                            sodium_mg_per_100g,
                            potassium_mg_per_100g,
                            vitamin_a_ug_per_100g,
                            calcium_mg_per_100g,
                            iron_mg_per_100g,
                            magnesium_mg_per_100g,
                            phosphorus_mg_per_100g,
                            zinc_mg_per_100g,
                            copper_mg_per_100g,
                            manganese_mg_per_100g,
                            selenium_ug_per_100g,
                            vitamin_c_mg_per_100g,
                            vitamin_d_ug_per_100g,
                            vitamin_e_mg_per_100g,
                            vitamin_k_ug_per_100g,
                            thiamin_b1_mg_per_100g,
                            riboflavin_b2_mg_per_100g,
                            niacin_b3_mg_per_100g,
                            vitamin_b6_mg_per_100g,
                            folate_ug_per_100g,
                            vitamin_b12_ug_per_100g,
                            caffeine_mg_per_100g,
                            alcohol_g_per_100g
                        FROM foods
                        WHERE id = ANY($1::uuid[])
                        """,
                        list({*food_ids}),
                    )
                    for fr in food_rows:
                        foods_by_id[str(fr["id"])] = dict(fr)

                micros = _compute_meal_micros({"foods": foods_for_micros}, foods_by_id)
            else:
                logger.info("[LOG_MEAL] No valid food_id+quantity pairs; storing empty micros")

            meal_dict = meal_data.dict()
            meal_dict.update(
                {
                    "total_calories": total_calories,
                    "total_protein": total_protein,
                    "total_carbs": total_carbs,
                    "total_fat": total_fat,
                    "foods": foods_for_db,  # Override with enriched foods
                    "micros": micros,  # Add micros for analytics
                }
            )

            meal_log = MealLog(**meal_dict)

            # Check if any foods in this meal are pending_review
            food_ids_to_check: List[uuid.UUID] = []
            for f in meal_data.foods:
                fid = f.get("food_id")
                if fid:
                    try:
                        food_ids_to_check.append(uuid.UUID(str(fid)))
                    except Exception:
                        pass
            
            logger.info(f"[LOG_MEAL] Checking review status for {len(food_ids_to_check)} food IDs")
            
            meal_review_status = "finalized"
            if food_ids_to_check:
                pending_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM foods WHERE id = ANY($1::uuid[]) AND review_status = 'pending_review'",
                    food_ids_to_check,
                )
                logger.info(f"[LOG_MEAL] Found {pending_count} pending foods")
                if pending_count and int(pending_count) > 0:
                    meal_review_status = "pending_review"
                    logger.info(f"[LOG_MEAL] Meal contains {pending_count} pending foods, marking as pending_review")
            else:
                logger.info(f"[LOG_MEAL] No food IDs to check, using finalized status")

            logger.info(f"[LOG_MEAL] Inserting meal with review_status={meal_review_status}")
            row = await conn.fetchrow(
                """
                INSERT INTO meals (
                    id, user_id, meal_type, foods, micros,
                    total_calories, total_protein, total_carbs, total_fat,
                    image_base64, logging_method, notes, timestamp, review_status
                ) VALUES (
                    $1,$2,$3,$4::jsonb,$5::jsonb,
                    $6,$7,$8,$9,
                    $10,$11,$12,$13,$14
                )
                RETURNING *
                """,
                to_uuid(meal_log.id),
                to_uuid(meal_log.user_id),
                meal_log.meal_type,
                json.dumps(meal_log.foods),
                json.dumps(meal_log.micros),
                float(meal_log.total_calories),
                float(meal_log.total_protein),
                float(meal_log.total_carbs),
                float(meal_log.total_fat),
                meal_log.image_base64,
                meal_log.logging_method,
                meal_log.notes,
                meal_log.timestamp,
                meal_review_status,
            )

            logger.info(f"[LOG_MEAL] Meal inserted successfully, meal_id={row['id']}")

            try:
                ts = meal_log.timestamp
                if isinstance(ts, datetime):
                    activity_date = ts.date()
                    await _upsert_user_daily_activity(
                        conn,
                        meal_data.user_id,
                        activity_date,
                        was_active=True,
                        logged_food=True,
                        logged_at=ts,
                    )
            except Exception:
                logger.warning("[LOG_MEAL] Failed to upsert user_daily_activity", exc_info=True)

            food_ids: List[uuid.UUID] = []
            for f in meal_data.foods:
                fid = f.get("food_id")
                if not fid:
                    continue
                try:
                    food_ids.append(uuid.UUID(str(fid)))
                except Exception:
                    continue

            if food_ids:
                logger.info(f"[LOG_MEAL] Updating last_used_at for {len(food_ids)} foods")
                await conn.execute(
                    "UPDATE foods SET last_used_at = now() WHERE id = ANY($1::uuid[])",
                    food_ids,
                )
                
                # Mark pending foods as approved and queue items as ready when meal is saved
                # This allows immediate enrichment without waiting for finalize endpoint
                approved_count = await conn.execute(
                    "UPDATE foods SET review_status = 'approved' WHERE id = ANY($1::uuid[]) AND review_status = 'pending_review'",
                    food_ids,
                )
                
                ready_count = await conn.execute(
                    "UPDATE foods_ingestion_queue SET status = 'ready', updated_at = now() WHERE food_id = ANY($1::uuid[]) AND status = 'pending'",
                    food_ids,
                )
                
                logger.info(f"[LOG_MEAL] Auto-approved {approved_count} pending foods, marked {ready_count} queue items as ready")

        if not row:
            logger.error(f"[LOG_MEAL] Failed to insert meal - no row returned")
            raise HTTPException(status_code=500, detail="Failed to log meal")
        
        logger.info(f"[LOG_MEAL] Converting row to MealLog response")
        meal_response = MealLog(**meal_from_record(row))
        logger.info(f"[LOG_MEAL] Successfully logged meal, returning response")
        return meal_response
    except HTTPException as e:
        logger.error(f"[LOG_MEAL] HTTPException: status={e.status_code}, detail={e.detail}")
        raise
    except Exception as e:
        logger.error(f"[LOG_MEAL] Unexpected error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class PendingFoodUpdate(BaseModel):
    food_id: str
    name: str
    quantity: float

class FinalizeMealRequest(BaseModel):
    meal_id: str
    food_updates: List[PendingFoodUpdate]

@api_router.post("/meals/pending/finalize")
async def finalize_pending_meal(request: FinalizeMealRequest, uid: str = Depends(get_current_uid)):
    """Finalize a pending meal by confirming/editing pending foods"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Get the meal and verify ownership
        meal = await conn.fetchrow(
            "SELECT user_id, foods, review_status FROM meals WHERE id = $1",
            to_uuid(request.meal_id),
        )
        if not meal:
            raise HTTPException(status_code=404, detail="Meal not found")
        
        _require_user_match(uid, str(meal["user_id"]))
        
        if meal["review_status"] != "pending_review":
            raise HTTPException(status_code=400, detail="Meal is not pending review")
        
        # Update food names if edited by user
        for update in request.food_updates:
            food_id = to_uuid(update.food_id)
            
            # Check if food is pending_review
            food_status = await conn.fetchval(
                "SELECT review_status FROM foods WHERE id = $1",
                food_id,
            )
            
            if food_status == "pending_review":
                # Update food name and mark as approved
                await conn.execute(
                    """
                    UPDATE foods 
                    SET name = $2, review_status = 'approved', updated_at = now()
                    WHERE id = $1
                    """,
                    food_id,
                    update.name.strip(),
                )
                
                # Mark queue item as ready for processing (user has confirmed)
                await conn.execute(
                    """
                    UPDATE foods_ingestion_queue
                    SET query = $2, status = 'ready', updated_at = now()
                    WHERE food_id = $1 AND status = 'pending'
                    """,
                    food_id,
                    update.name.strip(),
                )
                
                logger.info(f"User confirmed food: {update.name} (food_id={update.food_id}), queue marked as ready")
        
        # Update meal foods with new quantities if changed
        foods_json = json.loads(meal["foods"]) if isinstance(meal["foods"], str) else meal["foods"]
        for update in request.food_updates:
            for food in foods_json:
                if food.get("food_id") == update.food_id:
                    food["name"] = update.name
                    food["quantity"] = update.quantity
                    # Recalculate macros based on new quantity (still 0 until enriched)
                    multiplier = update.quantity / 100.0
                    food["calories"] = round(food.get("calories_per_100g", 0) * multiplier, 2)
                    food["protein"] = round(food.get("protein_per_100g", 0) * multiplier, 2)
                    food["carbs"] = round(food.get("carbs_per_100g", 0) * multiplier, 2)
                    food["fat"] = round(food.get("fat_per_100g", 0) * multiplier, 2)
        
        # Recalculate meal totals
        total_calories = sum([f.get("calories", 0) for f in foods_json])
        total_protein = sum([f.get("protein", 0) for f in foods_json])
        total_carbs = sum([f.get("carbs", 0) for f in foods_json])
        total_fat = sum([f.get("fat", 0) for f in foods_json])
        
        # Mark meal as finalized
        await conn.execute(
            """
            UPDATE meals
            SET review_status = 'finalized',
                foods = $2::jsonb,
                total_calories = $3,
                total_protein = $4,
                total_carbs = $5,
                total_fat = $6
            WHERE id = $1
            """,
            to_uuid(request.meal_id),
            json.dumps(foods_json),
            total_calories,
            total_protein,
            total_carbs,
            total_fat,
        )
        
        logger.info(f"Finalized meal {request.meal_id} with {len(request.food_updates)} confirmed foods")
        
        return {"status": "finalized", "meal_id": request.meal_id}


@api_router.get("/meals/history/{user_id}")
async def get_meal_history(
    user_id: str, 
    days: int = 7, 
    timezone_offset: int = 0,  # Offset in minutes from UTC (e.g., IST = 330)
    uid: str = Depends(get_current_uid)
):
    """Get meal history for user in their local timezone"""
    _require_user_match(uid, user_id)
    if days < 1 or days > 3650:
        raise HTTPException(status_code=400, detail="Invalid days")

    pool = _require_pool()
    async with pool.acquire() as conn:
        # Calculate cutoff time in user's timezone
        # Convert user's "now" to UTC for comparison
        rows = await conn.fetch(
            """
            SELECT *
            FROM meals
            WHERE user_id = $1
              AND timestamp >= (now() AT TIME ZONE 'UTC' + make_interval(mins => $3::int) - make_interval(days => $2::int))
            ORDER BY timestamp DESC
            LIMIT 1000
            """,
            to_uuid(user_id),
            int(days),
            int(timezone_offset),
        )

        meals = [meal_from_record(r) for r in rows]

        food_ids: list[uuid.UUID] = []
        for m in meals:
            foods = m.get("foods") or []
            if not isinstance(foods, list):
                continue
            for f in foods:
                if not isinstance(f, dict):
                    continue
                fid = f.get("food_id")
                if not fid:
                    continue
                try:
                    food_ids.append(uuid.UUID(str(fid)))
                except Exception:
                    continue

        foods_by_id: dict[str, dict] = {}
        if food_ids:
            food_rows = await conn.fetch(
                """
                SELECT
                    id,
                    fiber_g_per_100g,
                    sugar_g_per_100g,
                    saturated_fat_g_per_100g,
                    trans_fat_g_per_100g,
                    cholesterol_mg_per_100g,
                    sodium_mg_per_100g,
                    potassium_mg_per_100g,
                    vitamin_a_ug_per_100g,
                    calcium_mg_per_100g,
                    iron_mg_per_100g,
                    magnesium_mg_per_100g,
                    phosphorus_mg_per_100g,
                    zinc_mg_per_100g,
                    copper_mg_per_100g,
                    manganese_mg_per_100g,
                    selenium_ug_per_100g,
                    vitamin_c_mg_per_100g,
                    vitamin_d_ug_per_100g,
                    vitamin_e_mg_per_100g,
                    vitamin_k_ug_per_100g,
                    thiamin_b1_mg_per_100g,
                    riboflavin_b2_mg_per_100g,
                    niacin_b3_mg_per_100g,
                    vitamin_b6_mg_per_100g,
                    folate_ug_per_100g,
                    vitamin_b12_ug_per_100g,
                    caffeine_mg_per_100g,
                    alcohol_g_per_100g
                FROM foods
                WHERE id = ANY($1::uuid[])
                """,
                list({*food_ids}),
            )
            for fr in food_rows:
                foods_by_id[str(fr["id"])] = dict(fr)

        for m in meals:
            m["micros"] = _compute_meal_micros(m, foods_by_id)

    return {"meals": meals, "count": len(meals)}


@api_router.get("/meals/stats/{user_id}")
async def get_daily_stats(
    user_id: str, 
    date: str = None, 
    timezone_offset: int = 0,  # Offset in minutes from UTC (e.g., IST = 330)
    uid: str = Depends(get_current_uid)
):
    """Get nutrition stats for a specific day in user's local timezone"""
    _require_user_match(uid, user_id)
    
    # Get current time in user's timezone
    utc_now = datetime.now(timezone.utc)
    user_now = utc_now + timedelta(minutes=timezone_offset)
    
    target_date = user_now
    try:
        if date:
            date_str = date.strip()
            if date_str.endswith("Z"):
                date_str = date_str[:-1] + "+00:00"
            target_date = datetime.fromisoformat(date_str)
            if target_date.tzinfo is None:
                # Assume date is in user's timezone
                target_date = target_date.replace(tzinfo=timezone.utc) + timedelta(minutes=timezone_offset)
            else:
                target_date = target_date.astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date")

    # Calculate day boundaries in user's timezone, then convert to UTC for query
    start_of_day_user = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day_user = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # Convert back to UTC for database query
    start_of_day = start_of_day_user - timedelta(minutes=timezone_offset)
    end_of_day = end_of_day_user - timedelta(minutes=timezone_offset)

    pool = _require_pool()
    async with pool.acquire() as conn:
        agg = await conn.fetchrow(
            """
            SELECT
                COUNT(*)::int AS meals_logged,
                COALESCE(SUM(total_calories), 0)::double precision AS total_calories,
                COALESCE(SUM(total_protein), 0)::double precision AS total_protein,
                COALESCE(SUM(total_carbs), 0)::double precision AS total_carbs,
                COALESCE(SUM(total_fat), 0)::double precision AS total_fat
            FROM meals
            WHERE user_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
            """,
            to_uuid(user_id),
            start_of_day,
            end_of_day,
        )

        user_row = await conn.fetchrow(
            """
            SELECT daily_calorie_target, protein_target, carbs_target, fat_target
            FROM profiles
            WHERE id = $1
            """,
            to_uuid(user_id),
        )

    # Some users may not have a profile row yet (e.g., partial onboarding).
    # Return stats with sensible defaults instead of failing the whole analytics request.
    if not user_row:
        user_row = {
            "daily_calorie_target": 2000,
            "protein_target": 120,
            "carbs_target": 250,
            "fat_target": 70,
        }

    return {
        "date": target_date.isoformat(),
        "meals_logged": int(agg["meals_logged"] if agg else 0),
        "total_calories": round(float(agg["total_calories"] if agg else 0), 2),
        "total_protein": round(float(agg["total_protein"] if agg else 0), 2),
        "total_carbs": round(float(agg["total_carbs"] if agg else 0), 2),
        "total_fat": round(float(agg["total_fat"] if agg else 0), 2),
        "targets": {
            "calories": float(user_row["daily_calorie_target"]),
            "protein": float(user_row["protein_target"]),
            "carbs": float(user_row["carbs_target"]),
            "fat": float(user_row["fat_target"]),
        },
    }

# ===== Admin Sync (weekly cron entrypoint) =====

@api_router.post("/admin/foods/sync")
async def admin_foods_sync(
    x_admin_key: str | None = Header(default=None),
    batch_size: int = 0,
    full_sync: bool = False,
):
    """Unified sync entrypoint. Prioritizes queue items (user-requested foods), then refreshes existing foods."""
    _require_admin_key(x_admin_key)

    bs = int(batch_size or 0) if int(batch_size or 0) > 0 else FOODS_SYNC_BATCH_SIZE
    used_since = datetime.now(timezone.utc) - timedelta(days=FOODS_SYNC_USED_DAYS)
    stale_before = datetime.now(timezone.utc) - timedelta(days=FOODS_SYNC_STALE_DAYS)

    pool = _require_pool()
    async with pool.acquire() as conn:
        # Priority 1: Process foods_ingestion_queue (user-requested foods that need enrichment)
        queue_rows = await conn.fetch(
            """
            SELECT f.id, f.name, f.source, f.external_id, f.barcode, f.retry_count, f.retry_after,
                   q.id as queue_id, q.query, q.attempt_count
            FROM foods f
            JOIN foods_ingestion_queue q ON q.food_id = f.id
            WHERE q.status = 'ready'
               OR (q.status = 'error' AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now()))
            ORDER BY q.created_at ASC
            LIMIT $1
            """,
            bs,
        )
        
        # Priority 2: Fill remaining batch with regular refresh foods (if queue didn't fill batch)
        remaining = bs - len(queue_rows)
        refresh_rows = []
        if remaining > 0:
            refresh_rows = await conn.fetch(
                """
                SELECT id, name, source, external_id, barcode, retry_count, retry_after
                FROM foods
                WHERE (
                    $4::bool = true
                    OR (last_used_at IS NOT NULL AND last_used_at >= $1)
                    OR (last_used_at IS NULL AND last_synced_at IS NULL)
                )
                  AND (
                    last_synced_at IS NULL
                    OR last_synced_at < $2
                    OR fiber_g_per_100g IS NULL
                    OR sodium_mg_per_100g IS NULL
                    OR vitamin_c_mg_per_100g IS NULL
                    OR iron_mg_per_100g IS NULL
                  )
                  AND (retry_count IS NULL OR retry_count < 5 OR retry_after IS NULL OR retry_after < now())
                  AND NOT EXISTS (
                    SELECT 1 FROM foods_ingestion_queue WHERE food_id = foods.id
                  )
                ORDER BY
                  (fiber_g_per_100g IS NULL) DESC,
                  (sodium_mg_per_100g IS NULL) DESC,
                  (vitamin_c_mg_per_100g IS NULL) DESC,
                  (iron_mg_per_100g IS NULL) DESC,
                  last_used_at DESC,
                  last_synced_at ASC NULLS FIRST
                LIMIT $3
                """,
                used_since,
                stale_before,
                remaining,
                bool(full_sync),
            )
        
        rows = list(queue_rows) + list(refresh_rows)
        logger.info(f"Syncing {len(rows)} foods (queue={len(queue_rows)}, refresh={len(refresh_rows)})")

        ok = 0
        failed = 0
        skipped = 0
        
        total = len(rows)
        logger.info(f"Syncing {total} foods...")

        for idx, r in enumerate(rows, 1):
            food_id = r["id"]
            food_name = (r["name"] or "").strip()
            source = (r["source"] or "").strip().lower()
            external_id = (r["external_id"] or "").strip()
            barcode = (r["barcode"] or "").strip()

            # Progress logging every 10 foods
            if idx % 10 == 0:
                logger.info(f"Progress: {idx}/{total} (ok={ok}, failed={failed}, skipped={skipped})")
            
            try:
                # Check exponential backoff retry_after
                retry_after = r.get("retry_after")
                if retry_after and retry_after > datetime.now(timezone.utc):
                    skipped += 1
                    continue
                
                payload: Dict[str, Any] | None = None
                update: Dict[str, Any] = {}

                if barcode:
                    payload = await _fetch_openfoodfacts(barcode)
                    if payload and payload.get("product"):
                        product = payload["product"]
                        nutriments = product.get("nutriments") or {}
                        if (v := _to_float(nutriments.get("energy-kcal_100g"))) is not None:
                            update["calories_per_100g"] = v
                        if (v := _to_float(nutriments.get("proteins_100g"))) is not None:
                            update["protein_per_100g"] = v
                        if (v := _to_float(nutriments.get("carbohydrates_100g"))) is not None:
                            update["carbs_per_100g"] = v
                        if (v := _to_float(nutriments.get("fat_100g"))) is not None:
                            update["fat_per_100g"] = v
                        if (v := _to_float(nutriments.get("fiber_100g"))) is not None:
                            update["fiber_g_per_100g"] = v
                        if (v := _to_float(nutriments.get("sugars_100g"))) is not None:
                            update["sugar_g_per_100g"] = v
                        if (v := _to_float(nutriments.get("saturated-fat_100g"))) is not None:
                            update["saturated_fat_g_per_100g"] = v
                        if (v := _to_float(nutriments.get("trans-fat_100g"))) is not None:
                            update["trans_fat_g_per_100g"] = v
                        if (v := _off_nutriment_to_mg_per_100g(nutriments, "sodium_100g")) is not None:
                            update["sodium_mg_per_100g"] = v
                        update["brand"] = product.get("brands")
                        update["image_url"] = product.get("image_url")
                        update["ingredients"] = product.get("ingredients_text")
                        update["source"] = source or "openfoodfacts"
                        update["external_id"] = external_id or barcode
                        update["barcode"] = barcode

                elif (source == "usda" and external_id) or (not barcode and food_name):
                    # USDA path: either we already have an external_id, or we fall back to a name-based search.
                    # This prevents skipping existing foods that were created without barcode/external_id.
                    if external_id.startswith("search:"):
                        # Optimize: use search response nutrients directly (1 API call instead of 2)
                        term = external_id[len("search:"):].replace("_", " ")
                        search_res = await _usda_search(term, 5)
                        if not search_res:
                            failed += 1
                            await conn.execute(
                                "UPDATE foods SET sync_status='error', sync_error=$2, last_synced_at=now() WHERE id=$1",
                                food_id,
                                "usda_search_failed",
                            )
                            continue
                        foods = search_res.get("foods") or []
                        if not foods:
                            failed += 1
                            await conn.execute(
                                "UPDATE foods SET sync_status='error', sync_error=$2, last_synced_at=now() WHERE id=$1",
                                food_id,
                                "usda_no_results",
                            )
                            continue
                        chosen = None
                        for cand in foods:
                            if cand.get("fdcId") and (cand.get("foodNutrients") or []):
                                chosen = cand
                                break
                        if not chosen:
                            failed += 1
                            await conn.execute(
                                "UPDATE foods SET sync_status='error', sync_error=$2, last_synced_at=now() WHERE id=$1",
                                food_id,
                                "usda_no_nutrients_in_results",
                            )
                            continue
                        fdc_id = chosen.get("fdcId")
                        payload = chosen

                        # Only update external_id if it's different and won't violate unique constraint
                        new_external_id = str(fdc_id)
                        if external_id != new_external_id:
                            existing = await conn.fetchval(
                                "SELECT id FROM foods WHERE source = 'usda' AND external_id = $1 AND id != $2",
                                new_external_id,
                                food_id,
                            )
                            if not existing:
                                update["external_id"] = new_external_id
                    elif external_id:
                        payload = await _fetch_usda_food(external_id)
                    else:
                        # No external_id yet: search by the DB name
                        search_res = await _usda_search(food_name, 5)
                        if not search_res:
                            failed += 1
                            await conn.execute(
                                "UPDATE foods SET sync_status='error', sync_error=$2, last_synced_at=now() WHERE id=$1",
                                food_id,
                                "usda_search_failed",
                            )
                            continue
                        foods = search_res.get("foods") or []
                        if not foods:
                            failed += 1
                            await conn.execute(
                                "UPDATE foods SET sync_status='error', sync_error=$2, last_synced_at=now() WHERE id=$1",
                                food_id,
                                "usda_no_results",
                            )
                            continue
                        chosen = None
                        for cand in foods:
                            if cand.get("fdcId") and (cand.get("foodNutrients") or []):
                                chosen = cand
                                break
                        if not chosen:
                            failed += 1
                            await conn.execute(
                                "UPDATE foods SET sync_status='error', sync_error=$2, last_synced_at=now() WHERE id=$1",
                                food_id,
                                "usda_no_nutrients_in_results",
                            )
                            continue
                        fdc_id = chosen.get("fdcId")
                        payload = chosen
                        source = "usda"
                        update["source"] = "usda"
                        # Only set external_id if it won't violate uniqueness
                        new_external_id = str(fdc_id)
                        existing = await conn.fetchval(
                            "SELECT id FROM foods WHERE source = 'usda' AND external_id = $1 AND id != $2",
                            new_external_id,
                            food_id,
                        )
                        if not existing:
                            update["external_id"] = new_external_id

                    if payload:
                        m = _usda_nutrients_to_map(payload)

                        def pick(name: str) -> Dict[str, Any] | None:
                            return m.get(name.lower())

                        if (n := pick("Energy")) and (n.get("unit", "").strip().upper() == "KCAL"):
                            update["calories_per_100g"] = float(n["amount"])
                        if (n := pick("Protein")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["protein_per_100g"] = v
                        if (n := pick("Carbohydrate, by difference")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["carbs_per_100g"] = v
                        if (n := pick("Total lipid (fat)")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["fat_per_100g"] = v
                        if (n := pick("Fiber, total dietary")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["fiber_g_per_100g"] = v
                        if (n := pick("Sodium, Na")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["sodium_mg_per_100g"] = v
                        if (n := pick("Vitamin C, total ascorbic acid")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["vitamin_c_mg_per_100g"] = v
                        if (n := pick("Iron, Fe")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["iron_mg_per_100g"] = v
                        # Additional micronutrients
                        if (n := pick("Sugars, total including NLEA")) or (n := pick("Sugars, total")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["sugar_g_per_100g"] = v
                        if (n := pick("Fatty acids, total saturated")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["saturated_fat_g_per_100g"] = v
                        if (n := pick("Fatty acids, total trans")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["trans_fat_g_per_100g"] = v
                        
                        # Comprehensive micronutrient extraction
                        if (n := pick("Cholesterol")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["cholesterol_mg_per_100g"] = v
                        if (n := pick("Potassium, K")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["potassium_mg_per_100g"] = v
                        if (n := pick("Calcium, Ca")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["calcium_mg_per_100g"] = v
                        if (n := pick("Magnesium, Mg")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["magnesium_mg_per_100g"] = v
                        if (n := pick("Phosphorus, P")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["phosphorus_mg_per_100g"] = v
                        if (n := pick("Zinc, Zn")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["zinc_mg_per_100g"] = v
                        if (n := pick("Copper, Cu")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["copper_mg_per_100g"] = v
                        if (n := pick("Manganese, Mn")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["manganese_mg_per_100g"] = v
                        if (n := pick("Selenium, Se")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["selenium_ug_per_100g"] = v
                        
                        # Vitamins
                        if (n := pick("Vitamin A, RAE")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["vitamin_a_ug_per_100g"] = v
                        if (n := pick("Vitamin D (D2 + D3)")) or (n := pick("Vitamin D")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["vitamin_d_ug_per_100g"] = v
                        if (n := pick("Vitamin E (alpha-tocopherol)")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["vitamin_e_mg_per_100g"] = v
                        if (n := pick("Vitamin K (phylloquinone)")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["vitamin_k_ug_per_100g"] = v
                        
                        # B-complex vitamins
                        if (n := pick("Thiamin")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["thiamin_b1_mg_per_100g"] = v
                        if (n := pick("Riboflavin")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["riboflavin_b2_mg_per_100g"] = v
                        if (n := pick("Niacin")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["niacin_b3_mg_per_100g"] = v
                        if (n := pick("Vitamin B-6")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["vitamin_b6_mg_per_100g"] = v
                        if (n := pick("Folate, total")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["folate_ug_per_100g"] = v
                        if (n := pick("Vitamin B-12")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["vitamin_b12_ug_per_100g"] = v
                        
                        # Extras
                        if (n := pick("Caffeine")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "mg")
                            if v is not None:
                                update["caffeine_mg_per_100g"] = v
                        if (n := pick("Alcohol, ethyl")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "g")
                            if v is not None:
                                update["alcohol_g_per_100g"] = v
                        
                        # Extract metadata fields from USDA response
                        if "brandName" in payload:
                            update["brand"] = payload["brandName"]
                        if "ingredients" in payload:
                            update["ingredients"] = payload["ingredients"]
                        if "publicationDate" in payload:
                            pub_date = payload["publicationDate"]
                            if pub_date:
                                try:
                                    # Convert to a Python date object for asyncpg
                                    if isinstance(pub_date, str) and "/" in pub_date:
                                        month, day, year = pub_date.split("/")
                                        update["publication_date"] = datetime(
                                            int(year), int(month), int(day), tzinfo=timezone.utc
                                        ).date()
                                    elif isinstance(pub_date, str) and "-" in pub_date:
                                        y, m, d = pub_date.split("-")
                                        update["publication_date"] = datetime(
                                            int(y), int(m), int(d), tzinfo=timezone.utc
                                        ).date()
                                except Exception:
                                    pass
                        if "dataType" in payload:
                            update["data_type"] = payload["dataType"]
                        if "brandedFoodCategory" in payload and not update.get("category"):
                            update["category"] = payload["brandedFoodCategory"]
                        
                        # Set is_generic based on dataType
                        data_type = (payload.get("dataType") or "").strip().lower()
                        update["is_generic"] = data_type != "branded"
                        
                        update["source"] = "usda"

                else:
                    skipped += 1
                    continue

                # Always update at minimum the source and sync status
                if not update:
                    update["source"] = source or "usda"

                sql_update = """
                    UPDATE foods
                    SET calories_per_100g = COALESCE($2, calories_per_100g),
                        protein_per_100g = COALESCE($3, protein_per_100g),
                        carbs_per_100g = COALESCE($4, carbs_per_100g),
                        fat_per_100g = COALESCE($5, fat_per_100g),
                        fiber_g_per_100g = COALESCE($6, fiber_g_per_100g),
                        sugar_g_per_100g = COALESCE($7, sugar_g_per_100g),
                        saturated_fat_g_per_100g = COALESCE($8, saturated_fat_g_per_100g),
                        trans_fat_g_per_100g = COALESCE($9, trans_fat_g_per_100g),
                        cholesterol_mg_per_100g = COALESCE($10, cholesterol_mg_per_100g),
                        sodium_mg_per_100g = COALESCE($11, sodium_mg_per_100g),
                        potassium_mg_per_100g = COALESCE($12, potassium_mg_per_100g),
                        calcium_mg_per_100g = COALESCE($13, calcium_mg_per_100g),
                        iron_mg_per_100g = COALESCE($14, iron_mg_per_100g),
                        magnesium_mg_per_100g = COALESCE($15, magnesium_mg_per_100g),
                        phosphorus_mg_per_100g = COALESCE($16, phosphorus_mg_per_100g),
                        zinc_mg_per_100g = COALESCE($17, zinc_mg_per_100g),
                        copper_mg_per_100g = COALESCE($18, copper_mg_per_100g),
                        manganese_mg_per_100g = COALESCE($19, manganese_mg_per_100g),
                        selenium_ug_per_100g = COALESCE($20, selenium_ug_per_100g),
                        vitamin_a_ug_per_100g = COALESCE($21, vitamin_a_ug_per_100g),
                        vitamin_c_mg_per_100g = COALESCE($22, vitamin_c_mg_per_100g),
                        vitamin_d_ug_per_100g = COALESCE($23, vitamin_d_ug_per_100g),
                        vitamin_e_mg_per_100g = COALESCE($24, vitamin_e_mg_per_100g),
                        vitamin_k_ug_per_100g = COALESCE($25, vitamin_k_ug_per_100g),
                        thiamin_b1_mg_per_100g = COALESCE($26, thiamin_b1_mg_per_100g),
                        riboflavin_b2_mg_per_100g = COALESCE($27, riboflavin_b2_mg_per_100g),
                        niacin_b3_mg_per_100g = COALESCE($28, niacin_b3_mg_per_100g),
                        vitamin_b6_mg_per_100g = COALESCE($29, vitamin_b6_mg_per_100g),
                        folate_ug_per_100g = COALESCE($30, folate_ug_per_100g),
                        vitamin_b12_ug_per_100g = COALESCE($31, vitamin_b12_ug_per_100g),
                        caffeine_mg_per_100g = COALESCE($32, caffeine_mg_per_100g),
                        alcohol_g_per_100g = COALESCE($33, alcohol_g_per_100g),
                        raw_payload = COALESCE($34::jsonb, raw_payload),
                        brand = COALESCE($35, brand),
                        image_url = COALESCE($36, image_url),
                        ingredients = COALESCE($37, ingredients),
                        source = COALESCE($38, source),
                        external_id = COALESCE($39, external_id),
                        barcode = COALESCE($40, barcode),
                        data_type = COALESCE($41, data_type),
                        publication_date = COALESCE($42, publication_date),
                        is_generic = COALESCE($43, is_generic),
                        review_status = 'approved',
                        verified = true,
                        sync_status = 'ok',
                        sync_error = NULL,
                        retry_count = 0,
                        retry_after = NULL,
                        last_synced_at = now()
                    WHERE id = $1
                """

                params = (
                    food_id,
                    update.get("calories_per_100g"),
                    update.get("protein_per_100g"),
                    update.get("carbs_per_100g"),
                    update.get("fat_per_100g"),
                    update.get("fiber_g_per_100g"),
                    update.get("sugar_g_per_100g"),
                    update.get("saturated_fat_g_per_100g"),
                    update.get("trans_fat_g_per_100g"),
                    update.get("cholesterol_mg_per_100g"),
                    update.get("sodium_mg_per_100g"),
                    update.get("potassium_mg_per_100g"),
                    update.get("calcium_mg_per_100g"),
                    update.get("iron_mg_per_100g"),
                    update.get("magnesium_mg_per_100g"),
                    update.get("phosphorus_mg_per_100g"),
                    update.get("zinc_mg_per_100g"),
                    update.get("copper_mg_per_100g"),
                    update.get("manganese_mg_per_100g"),
                    update.get("selenium_ug_per_100g"),
                    update.get("vitamin_a_ug_per_100g"),
                    update.get("vitamin_c_mg_per_100g"),
                    update.get("vitamin_d_ug_per_100g"),
                    update.get("vitamin_e_mg_per_100g"),
                    update.get("vitamin_k_ug_per_100g"),
                    update.get("thiamin_b1_mg_per_100g"),
                    update.get("riboflavin_b2_mg_per_100g"),
                    update.get("niacin_b3_mg_per_100g"),
                    update.get("vitamin_b6_mg_per_100g"),
                    update.get("folate_ug_per_100g"),
                    update.get("vitamin_b12_ug_per_100g"),
                    update.get("caffeine_mg_per_100g"),
                    update.get("alcohol_g_per_100g"),
                    json.dumps(payload) if payload is not None else None,
                    update.get("brand"),
                    update.get("image_url"),
                    update.get("ingredients"),
                    update.get("source"),
                    update.get("external_id"),
                    update.get("barcode"),
                    update.get("data_type"),
                    update.get("publication_date"),
                    update.get("is_generic"),
                )

                try:
                    await conn.execute(sql_update, *params)
                except UniqueViolationError:
                    # If external_id update collides, retry once without changing external_id
                    if update.get("external_id"):
                        update.pop("external_id", None)
                        params2 = (
                            food_id,
                            update.get("calories_per_100g"),
                            update.get("protein_per_100g"),
                            update.get("carbs_per_100g"),
                            update.get("fat_per_100g"),
                            update.get("fiber_g_per_100g"),
                            update.get("sugar_g_per_100g"),
                            update.get("saturated_fat_g_per_100g"),
                            update.get("trans_fat_g_per_100g"),
                            update.get("sodium_mg_per_100g"),
                            update.get("vitamin_c_mg_per_100g"),
                            update.get("iron_mg_per_100g"),
                            json.dumps(payload) if payload is not None else None,
                            update.get("brand"),
                            update.get("image_url"),
                            update.get("ingredients"),
                            update.get("source"),
                            None,
                            update.get("barcode"),
                            update.get("data_type"),
                            update.get("publication_date"),
                            update.get("is_generic"),
                        )
                        await conn.execute(sql_update, *params2)
                    else:
                        raise

                ok += 1
                
                # Delete queue item after successful enrichment (move from queue to foods table)
                queue_id = r.get("queue_id")
                if queue_id:
                    await conn.execute(
                        "DELETE FROM foods_ingestion_queue WHERE id=$1",
                        queue_id,
                    )
                    logger.info(f"Deleted queue item {queue_id} after successful enrichment")
                    
            except httpx.HTTPStatusError as e:
                failed += 1
                retry_count = int(r.get("retry_count") or 0) + 1
                backoff_hours = min(2 ** retry_count, 168)  # Max 1 week
                retry_after_ts = datetime.now(timezone.utc) + timedelta(hours=backoff_hours)

                await conn.execute(
                    "UPDATE foods SET sync_status='error', sync_error=$2, retry_count=$3, retry_after=$4, last_synced_at=now() WHERE id=$1",
                    food_id,
                    f"{e.response.status_code}: {str(e)[:200]}",
                    retry_count,
                    retry_after_ts,
                )
                
                # Update queue item error status with backoff
                queue_id = r.get("queue_id")
                if queue_id:
                    attempt_count = int(r.get("attempt_count") or 0) + 1
                    await conn.execute(
                        """UPDATE foods_ingestion_queue 
                           SET status='error', attempt_count=$2, last_error=$3, 
                               next_attempt_at=$4, updated_at=now() 
                           WHERE id=$1""",
                        queue_id,
                        attempt_count,
                        f"{e.response.status_code}: {str(e)[:200]}",
                        retry_after_ts,
                    )
                    
            except Exception as e:
                failed += 1
                retry_count = int(r.get("retry_count") or 0) + 1
                backoff_hours = min(2 ** retry_count, 168)
                retry_after_ts = datetime.now(timezone.utc) + timedelta(hours=backoff_hours)

                await conn.execute(
                    "UPDATE foods SET sync_status='error', sync_error=$2, retry_count=$3, retry_after=$4, last_synced_at=now() WHERE id=$1",
                    food_id,
                    str(e)[:200],
                    retry_count,
                    retry_after_ts,
                )
                
                # Update queue item error status with backoff
                queue_id = r.get("queue_id")
                if queue_id:
                    attempt_count = int(r.get("attempt_count") or 0) + 1
                    await conn.execute(
                        """UPDATE foods_ingestion_queue 
                           SET status='error', attempt_count=$2, last_error=$3, 
                               next_attempt_at=$4, updated_at=now() 
                           WHERE id=$1""",
                        queue_id,
                        attempt_count,
                        str(e)[:200],
                        retry_after_ts,
                    )

    logger.info(f"Sync complete: selected={len(rows)}, ok={ok}, failed={failed}, skipped={skipped}")
    return {"selected": len(rows), "ok": ok, "failed": failed, "skipped": skipped}
 
 
@api_router.get("/analytics/{user_id}")
async def get_analytics(
    user_id: str,
    time_range: str = "week",
    force_refresh: bool = False,
    uid: str = Depends(get_current_uid)
):
    """Get cached analytics or trigger background refresh if needed"""
    _require_user_match(uid, user_id)
    
    if time_range not in ["week", "month", "year"]:
        raise HTTPException(status_code=400, detail="Invalid time_range")
    
    pool = _require_pool()
    async with pool.acquire() as conn:
        # If the user has no meals in the requested range, treat the period as inactive.
        # In that case we should not return stale cached insights from previous weeks/months.
        days = 7 if time_range == "week" else (30 if time_range == "month" else 365)
        meals_count = await conn.fetchval(
            """
            SELECT COUNT(1)
            FROM meals
            WHERE user_id = $1
              AND timestamp >= (now() - make_interval(days => $2::int))
            """,
            to_uuid(user_id),
            days,
        )
        if int(meals_count or 0) == 0:
            return {
                "insights": {},
                "bio_impact": {},
                "health_insights": {},
                "bio_alerts": [],
                "red_flags": [],
                "cached": False,
                "inactive": True,
                "message": "No meals logged for this period",
            }

        # Check for cached analytics
        cache = await conn.fetchrow(
            """
            SELECT insights, bio_impact, health_insights, bio_alerts, red_flags, meals_analyzed,
                   date_range_start, date_range_end, expires_at, last_refreshed_at,
                   tokens_used, refresh_count
            FROM analytics_cache
            WHERE user_id = $1 AND time_range = $2
            """,
            to_uuid(user_id),
            time_range,
        )
        
        # Return cached data if valid and not force refresh
        if cache and not force_refresh:
            expires_at = cache["expires_at"]
            if expires_at and expires_at > datetime.now(timezone.utc):
                logger.info(f"Returning cached analytics for user {user_id}, time_range={time_range}")
                parsed = _parse_analytics_cache_fields(cache)
                return {
                    **parsed,
                    "cached": True,
                    "last_refreshed_at": cache["last_refreshed_at"].isoformat(),
                    "expires_at": expires_at.isoformat(),
                    "meals_analyzed": cache["meals_analyzed"],
                }
        
        # Cache miss or expired - return stale data and trigger background refresh
        if cache:
            logger.info(f"Cache expired for user {user_id}, returning stale data and triggering refresh")
            parsed = _parse_analytics_cache_fields(cache)
            # TODO: Trigger background refresh job here
            return {
                **parsed,
                "cached": True,
                "stale": True,
                "last_refreshed_at": cache["last_refreshed_at"].isoformat(),
                "refreshing": True,
            }
        
        # No cache at all - return empty state and trigger refresh
        logger.info(f"No cache for user {user_id}, returning empty state")
        return {
            "insights": {},
            "bio_impact": {},
            "health_insights": {},
            "bio_alerts": [],
            "red_flags": [],
            "cached": False,
            "refreshing": True,
            "message": "Analytics are being generated. Please refresh in a few seconds."
        }


@api_router.get("/analytics/{user_id}/bundle")
async def get_analytics_bundle(
    user_id: str,
    time_range: str = "week",
    timezone_offset: int = 0,
    uid: str = Depends(get_current_uid),
):
    """Return frontend-ready analytics bundle in a single request.

    Includes:
    - Meal history for the requested range (same shape as /meals/history) with computed per-meal micros
    - Cached AI analytics for the same time_range (same shape as /analytics)
    """
    _require_user_match(uid, user_id)

    if time_range not in ["week", "month", "year"]:
        raise HTTPException(status_code=400, detail="Invalid time_range")

    days = 7 if time_range == "week" else (30 if time_range == "month" else 365)
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Fetch user profile for personalized targets
        profile = await conn.fetchrow(
            """
            SELECT age, gender
            FROM profiles
            WHERE id = $1
            """,
            to_uuid(user_id),
        )
        
        # Compute personalized micronutrient targets
        micro_targets = {}
        if profile:
            age = profile.get("age", 25)
            gender = profile.get("gender", "male")
            micro_targets = compute_micronutrient_targets(age, gender)
        
        rows = await conn.fetch(
            """
            SELECT *
            FROM meals
            WHERE user_id = $1
              AND timestamp >= (now() AT TIME ZONE 'UTC' + make_interval(mins => $3::int) - make_interval(days => $2::int))
            ORDER BY timestamp DESC
            LIMIT 1000
            """,
            to_uuid(user_id),
            int(days),
            int(timezone_offset),
        )

        meals = [meal_from_record(r) for r in rows]

        food_ids: list[uuid.UUID] = []
        for m in meals:
            foods = m.get("foods") or []
            if not isinstance(foods, list):
                continue
            for f in foods:
                if not isinstance(f, dict):
                    continue
                fid = f.get("food_id")
                if not fid:
                    continue
                try:
                    food_ids.append(uuid.UUID(str(fid)))
                except Exception:
                    continue

        foods_by_id: dict[str, dict] = {}
        if food_ids:
            food_rows = await conn.fetch(
                """
                SELECT
                    id,
                    fiber_g_per_100g,
                    sugar_g_per_100g,
                    saturated_fat_g_per_100g,
                    trans_fat_g_per_100g,
                    cholesterol_mg_per_100g,
                    sodium_mg_per_100g,
                    potassium_mg_per_100g,
                    vitamin_a_ug_per_100g,
                    calcium_mg_per_100g,
                    iron_mg_per_100g,
                    magnesium_mg_per_100g,
                    phosphorus_mg_per_100g,
                    zinc_mg_per_100g,
                    copper_mg_per_100g,
                    manganese_mg_per_100g,
                    selenium_ug_per_100g,
                    vitamin_c_mg_per_100g,
                    vitamin_d_ug_per_100g,
                    vitamin_e_mg_per_100g,
                    vitamin_k_ug_per_100g,
                    thiamin_b1_mg_per_100g,
                    riboflavin_b2_mg_per_100g,
                    niacin_b3_mg_per_100g,
                    vitamin_b6_mg_per_100g,
                    folate_ug_per_100g,
                    vitamin_b12_ug_per_100g,
                    caffeine_mg_per_100g,
                    alcohol_g_per_100g
                FROM foods
                WHERE id = ANY($1::uuid[])
                """,
                list({*food_ids}),
            )
            for fr in food_rows:
                foods_by_id[str(fr["id"])] = dict(fr)

        for m in meals:
            m["micros"] = _compute_meal_micros(m, foods_by_id)

        cache = await conn.fetchrow(
            """
            SELECT insights, bio_impact, health_insights, bio_alerts, red_flags, meals_analyzed,
                   date_range_start, date_range_end, expires_at, last_refreshed_at,
                   tokens_used, refresh_count
            FROM analytics_cache
            WHERE user_id = $1 AND time_range = $2
            """,
            to_uuid(user_id),
            time_range,
        )

        is_inactive = len(meals) == 0
        ai: dict = {
            "insights": {},
            "bio_impact": {},
            "health_insights": {},
            "bio_alerts": [],
            "red_flags": [],
            "cached": False,
            "refreshing": not is_inactive,
            "inactive": is_inactive,
        }

        # Only return cached AI analytics if the user was active in this period.
        if cache and not is_inactive:
            expires_at = cache["expires_at"]
            is_valid = bool(expires_at and expires_at > datetime.now(timezone.utc))
            parsed = _parse_analytics_cache_fields(cache)
            ai = {
                **parsed,
                "cached": True,
                "stale": not is_valid,
                "last_refreshed_at": cache["last_refreshed_at"].isoformat() if cache["last_refreshed_at"] else None,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "meals_analyzed": cache["meals_analyzed"],
                "inactive": False,
            }

        return {
            "time_range": time_range,
            "days": days,
            "history": {"meals": meals, "count": len(meals)},
            "ai": ai,
            "micro_targets": micro_targets,
        }


@api_router.post("/analytics/{user_id}/refresh")
async def refresh_analytics(
    user_id: str,
    time_range: str = "week",
    x_admin_key: Optional[str] = Header(None),
    uid: Optional[str] = Depends(get_current_uid_optional)
):
    """Manually refresh analytics with rate limiting"""
    # Allow admin key for background cron jobs
    if x_admin_key:
        _require_admin_key(x_admin_key)
    else:
        if not uid:
            raise HTTPException(status_code=401, detail="Unauthorized")
        _require_user_match(uid, user_id)
    
    if time_range not in ["week", "month", "year"]:
        raise HTTPException(status_code=400, detail="Invalid time_range")
    
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Fetch user profile for personalized targets
        profile = await conn.fetchrow(
            """
            SELECT age, gender
            FROM profiles
            WHERE id = $1
            """,
            to_uuid(user_id),
        )
        
        # Compute personalized micronutrient targets
        micro_targets = {}
        if profile:
            age = profile.get("age", 25)
            gender = profile.get("gender", "male")
            micro_targets = compute_micronutrient_targets(age, gender)
        
        # Check rate limiting - max 1 refresh per 5 minutes
        cache = await conn.fetchrow(
            """
            SELECT last_refreshed_at, refresh_count
            FROM analytics_cache
            WHERE user_id = $1 AND time_range = $2
            """,
            to_uuid(user_id),
            time_range,
        )
        
        if cache:
            last_refresh = cache["last_refreshed_at"]
            if last_refresh and (datetime.now(timezone.utc) - last_refresh).total_seconds() < 300:
                raise HTTPException(
                    status_code=429,
                    detail="Please wait 5 minutes between manual refreshes"
                )
        
        # Fetch meals for analysis
        days = 7 if time_range == "week" else (30 if time_range == "month" else 365)
        meals = await conn.fetch(
            """
            SELECT id, user_id, meal_type, timestamp, foods,
                   total_calories, total_protein, total_carbs, total_fat
            FROM meals
            WHERE user_id = $1
              AND timestamp >= (now() - make_interval(days => $2::int))
            ORDER BY timestamp DESC
            """,
            to_uuid(user_id),
            days,
        )
        
        if len(meals) == 0:
            return {
                "insights": {},
                "bio_impact": {},
                "health_insights": {},
                "bio_alerts": [],
                "red_flags": [],
                "inactive": True,
                "message": "No meals found for analysis"
            }

        # Ensure each meal includes computed micronutrients from foods table (USDA columns).
        # Without this, AI analysis will see micros as 0 and falsely report deficiencies.
        logger.info(f"[ANALYTICS_REFRESH] Processing {len(meals)} meals for micronutrient computation")
        meals_for_ai = [dict(m) for m in meals]
        food_ids: list[uuid.UUID] = []
        total_foods_in_meals = 0
        for m in meals_for_ai:
            foods = m.get("foods") or []
            if isinstance(foods, str):
                try:
                    foods = json.loads(foods)
                except Exception:
                    foods = []
                m["foods"] = foods
            if not isinstance(foods, list):
                continue
            for f in foods:
                if not isinstance(f, dict):
                    continue
                fid = f.get("food_id")
                if not fid:
                    continue
                try:
                    food_ids.append(uuid.UUID(str(fid)))
                except Exception:
                    continue

        foods_by_id: dict[str, dict] = {}
        if food_ids:
            food_rows = await conn.fetch(
                """
                SELECT
                    id,
                    fiber_g_per_100g,
                    sugar_g_per_100g,
                    saturated_fat_g_per_100g,
                    trans_fat_g_per_100g,
                    cholesterol_mg_per_100g,
                    sodium_mg_per_100g,
                    potassium_mg_per_100g,
                    vitamin_a_ug_per_100g,
                    calcium_mg_per_100g,
                    iron_mg_per_100g,
                    magnesium_mg_per_100g,
                    phosphorus_mg_per_100g,
                    zinc_mg_per_100g,
                    copper_mg_per_100g,
                    manganese_mg_per_100g,
                    selenium_ug_per_100g,
                    vitamin_c_mg_per_100g,
                    vitamin_d_ug_per_100g,
                    vitamin_e_mg_per_100g,
                    vitamin_k_ug_per_100g,
                    thiamin_b1_mg_per_100g,
                    riboflavin_b2_mg_per_100g,
                    niacin_b3_mg_per_100g,
                    vitamin_b6_mg_per_100g,
                    folate_ug_per_100g,
                    vitamin_b12_ug_per_100g,
                    caffeine_mg_per_100g,
                    alcohol_g_per_100g
                FROM foods
                WHERE id = ANY($1::uuid[])
                """,
                list({*food_ids}),
            )
            logger.info(f"[ANALYTICS_REFRESH] Got {len(food_rows)} food rows from database")
            foods_with_micros = 0
            for fr in food_rows:
                foods_by_id[str(fr["id"])] = dict(fr)
                if fr.get('sugar_g_per_100g') or fr.get('calcium_mg_per_100g'):
                    foods_with_micros += 1
            logger.info(f"[ANALYTICS_REFRESH] {foods_with_micros}/{len(food_rows)} foods have micronutrient data")
            if food_rows and not foods_with_micros:
                logger.error(f"[ANALYTICS_REFRESH] CRITICAL: Foods table has NO micronutrient data!")
        else:
            logger.error(f"[ANALYTICS_REFRESH] CRITICAL: No food_ids found in meals! Meals may not have food_id references.")

        for m in meals_for_ai:
            m["micros"] = _compute_meal_micros(m, foods_by_id)
        
        # Log sample meal micros for debugging
        total_micros_computed = sum(1 for m in meals_for_ai if m.get("micros", {}).get("sugar_g", 0) > 0 or m.get("micros", {}).get("calcium_mg", 0) > 0)
        logger.info(f"[ANALYTICS_REFRESH] {total_micros_computed}/{len(meals_for_ai)} meals have non-zero computed micronutrients")
        if meals_for_ai and meals_for_ai[0].get("micros"):
            sample_micros = meals_for_ai[0]["micros"]
            logger.info(f"[ANALYTICS_REFRESH] Sample meal micros: sugar={sample_micros.get('sugar_g'):.1f}g, calcium={sample_micros.get('calcium_mg'):.1f}mg, vitC={sample_micros.get('vitamin_c_mg'):.1f}mg, vitA={sample_micros.get('vitamin_a_ug'):.1f}ug, zinc={sample_micros.get('zinc_mg'):.2f}mg")
        else:
            logger.error(f"[ANALYTICS_REFRESH] CRITICAL: First meal has no micros computed!")
        
        # Generate AI analysis with personalized targets
        start_time = datetime.now(timezone.utc)
        analysis = await _generate_analytics_ai(meals_for_ai, time_range, openai_client, micro_targets)
        duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        
        # Cache the results
        ttl_hours = 6 if time_range in ["week", "month"] else 24
        await conn.execute(
            """
            INSERT INTO analytics_cache (
                user_id, time_range, insights, bio_impact, health_insights, bio_alerts, red_flags,
                meals_analyzed, date_range_start, date_range_end,
                expires_at, tokens_used, analysis_duration_ms, refresh_count
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1)
            ON CONFLICT (user_id, time_range)
            DO UPDATE SET
                insights = EXCLUDED.insights,
                bio_impact = EXCLUDED.bio_impact,
                health_insights = EXCLUDED.health_insights,
                bio_alerts = EXCLUDED.bio_alerts,
                red_flags = EXCLUDED.red_flags,
                meals_analyzed = EXCLUDED.meals_analyzed,
                date_range_start = EXCLUDED.date_range_start,
                date_range_end = EXCLUDED.date_range_end,
                expires_at = EXCLUDED.expires_at,
                last_refreshed_at = now(),
                tokens_used = EXCLUDED.tokens_used,
                analysis_duration_ms = EXCLUDED.analysis_duration_ms,
                refresh_count = analytics_cache.refresh_count + 1
            """,
            to_uuid(user_id),
            time_range,
            json.dumps(analysis["insights"]),
            json.dumps(analysis["bio_impact"]),
            json.dumps(analysis.get("health_insights", {})),
            json.dumps(analysis.get("bio_alerts", [])),
            json.dumps(analysis.get("red_flags", [])),
            len(meals),
            meals[-1]["timestamp"] if meals else datetime.now(timezone.utc),
            meals[0]["timestamp"] if meals else datetime.now(timezone.utc),
            datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
            analysis.get("tokens_used", 0),
            duration_ms,
        )
        
        logger.info(f"Analytics refreshed for user {user_id}, time_range={time_range}, tokens={analysis.get('tokens_used', 0)}, duration={duration_ms}ms")
        
        return {
            "insights": analysis["insights"],
            "bio_impact": analysis["bio_impact"],
            "health_insights": analysis.get("health_insights", {}),
            "bio_alerts": analysis.get("bio_alerts", []),
            "red_flags": analysis.get("red_flags", []),
            "cached": True,
            "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
            "meals_analyzed": len(meals),
            "tokens_used": analysis.get("tokens_used", 0),
            "duration_ms": duration_ms,
        }


@api_router.get("/admin/active-users")
async def get_active_users(x_admin_key: Optional[str] = Header(None)):
    """Get list of users who logged meals in last 24 hours"""
    _require_admin_key(x_admin_key)
    
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Get users who logged meals in last 24 hours
        active_users = await conn.fetch(
            """
            SELECT DISTINCT user_id::text
            FROM meals
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            """
        )
        
        user_ids = [row[0] for row in active_users]
        return {"active_users": user_ids}


# =====================
# CHEF API MODELS
# =====================

class ChefGenerateRequest(BaseModel):
    user_id: str
    ingredients: List[str] = Field(default_factory=list)
    goals: List[str] = Field(default_factory=list)
    cuisine: Optional[str] = None
    dietary_preference: Optional[str] = None
    target_meal: Optional[str] = None


class RecipeResponse(BaseModel):
    name: str
    description: str
    prepTime: int = 0
    servings: int = 1
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    fiber: Optional[float] = None
    ingredients: List[str] = Field(default_factory=list)
    instructions: List[str] = Field(default_factory=list)
    tips: Optional[str] = None


async def _get_nutritional_gaps(conn: asyncpg.Connection, user_id: str, timezone_offset: int = 0) -> str:
    """Calculate nutritional gaps from today's meals for the given user."""
    try:
        rows = await conn.fetch(
            """
            SELECT total_calories, total_protein, total_carbs, total_fat
            FROM meals
            WHERE user_id = $1
              AND timestamp >= (now() AT TIME ZONE 'UTC' + make_interval(mins => $2::int) - INTERVAL '1 day')
            """,
            to_uuid(user_id),
            int(timezone_offset),
        )
        
        totals = {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}
        for r in rows:
            totals["protein"] += float(r["total_protein"] or 0)
            totals["carbs"] += float(r["total_carbs"] or 0)
            totals["fat"] += float(r["total_fat"] or 0)
            totals["calories"] += float(r["total_calories"] or 0)
        
        gaps = []
        if totals["protein"] < 50:
            gaps.append("protein")
        if totals["carbs"] < 100:
            gaps.append("carbs")
        if totals["fat"] < 20:
            gaps.append("healthy fats")
        if totals["calories"] < 1200:
            gaps.append("calories")
        
        return ", ".join(gaps) if gaps else "None identified"
    except Exception as e:
        logger.warning(f"Error calculating nutritional gaps: {e}")
        return "None identified"


def _build_chef_prompt(request: ChefGenerateRequest, user_profile: Optional[dict], nutritional_gaps: str) -> str:
    """Build the AI prompt for recipe generation."""
    profile_context = ""
    if user_profile:
        goal = user_profile.get("goal", "")
        dietary = user_profile.get("dietary_preference", "")
        if goal:
            profile_context += f"\nUser's Health Goal: {goal}"
        if dietary:
            profile_context += f"\nUser's Dietary Preference: {dietary}"
    
    return f"""As a professional chef and nutritionist, create a personalized recipe based on:

Available Ingredients: {', '.join(request.ingredients) if request.ingredients else 'Any common ingredients'}
Health Goals: {', '.join(request.goals) if request.goals else 'General health'}
Preferred Cuisine: {request.cuisine or 'Any'}
Dietary Preference: {request.dietary_preference or 'No restriction'}
Target Meal Type: {request.target_meal or 'Any meal'}
Nutritional Gaps to Address: {nutritional_gaps}
{profile_context}

Requirements:
- Use only the listed ingredients or suggest minimal additions
- Focus on Indian cuisine when possible
- Provide clear, step-by-step instructions
- Include prep time and servings
- Calculate approximate nutritional values per serving
- Add cooking tips for beginners

Format response as JSON with these exact keys:
{{
  "name": "Recipe Name",
  "description": "Brief description",
  "prepTime": 30,
  "servings": 2,
  "calories": 350,
  "protein": 25,
  "carbs": 40,
  "fat": 12,
  "fiber": 5,
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["Step 1", "Step 2"],
  "tips": "Cooking tips"
}}"""


@api_router.post("/chef/generate")
async def generate_recipe(request: ChefGenerateRequest, uid: str = Depends(get_current_uid)):
    """Generate personalized recipe using AI with structured input."""
    try:
        _require_user_match(uid, request.user_id)
        
        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")
        
        pool = _require_pool()
        async with pool.acquire() as conn:
            # Fetch user profile for context
            profile_row = await conn.fetchrow(
                "SELECT goal, dietary_preference FROM profiles WHERE id = $1",
                to_uuid(request.user_id)
            )
            user_profile = dict(profile_row) if profile_row else None
            
            # Calculate nutritional gaps server-side
            nutritional_gaps = await _get_nutritional_gaps(conn, request.user_id)
        
        # Build the prompt
        prompt = _build_chef_prompt(request, user_profile, nutritional_gaps)
        
        response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional chef and nutritionist. Always respond with valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content if response.choices else ""
        extracted = extract_json_from_text(content)
        recipe = json.loads(extracted)
        
        return {
            "recipe": recipe,
            "nutritional_gaps_addressed": nutritional_gaps
        }
    except Exception as e:
        logger.error(f"Error generating recipe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================
# SAVED RECIPES API
# =====================

class SaveRecipeRequest(BaseModel):
    user_id: str
    recipe_data: Dict[str, Any]
    source: str = "chef"


@api_router.post("/recipes/save")
async def save_recipe(request: SaveRecipeRequest, uid: str = Depends(get_current_uid)):
    """Save a recipe for later use."""
    _require_user_match(uid, request.user_id)
    
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO saved_recipes (user_id, recipe_data, source)
            VALUES ($1, $2, $3)
            RETURNING id, created_at
            """,
            to_uuid(request.user_id),
            json.dumps(request.recipe_data),
            request.source,
        )
        return {
            "id": str(row["id"]),
            "created_at": row["created_at"].isoformat(),
            "message": "Recipe saved successfully"
        }


@api_router.get("/recipes/saved/{user_id}")
async def get_saved_recipes(user_id: str, uid: str = Depends(get_current_uid)):
    """Get all saved recipes for a user."""
    _require_user_match(uid, user_id)
    
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, recipe_data, source, is_favorite, times_cooked, created_at, updated_at
            FROM saved_recipes
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            to_uuid(user_id),
        )
        
        recipes = []
        for r in rows:
            recipe_data = r["recipe_data"]
            if isinstance(recipe_data, str):
                try:
                    recipe_data = json.loads(recipe_data)
                except Exception:
                    recipe_data = {}
            
            recipes.append({
                "id": str(r["id"]),
                "recipe": recipe_data,
                "source": r["source"],
                "is_favorite": r["is_favorite"],
                "times_cooked": r["times_cooked"],
                "created_at": r["created_at"].isoformat(),
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            })
        
        return {"recipes": recipes, "count": len(recipes)}


@api_router.delete("/recipes/{recipe_id}")
async def delete_saved_recipe(recipe_id: str, uid: str = Depends(get_current_uid)):
    """Delete a saved recipe."""
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Verify ownership
        owner = await conn.fetchval(
            "SELECT user_id FROM saved_recipes WHERE id = $1",
            to_uuid(recipe_id)
        )
        if not owner:
            raise HTTPException(status_code=404, detail="Recipe not found")
        _require_user_match(uid, str(owner))
        
        await conn.execute("DELETE FROM saved_recipes WHERE id = $1", to_uuid(recipe_id))
        return {"message": "Recipe deleted"}


@api_router.put("/recipes/{recipe_id}/favorite")
async def toggle_recipe_favorite(recipe_id: str, uid: str = Depends(get_current_uid)):
    """Toggle favorite status of a saved recipe."""
    pool = _require_pool()
    async with pool.acquire() as conn:
        # Verify ownership and toggle
        row = await conn.fetchrow(
            """
            UPDATE saved_recipes
            SET is_favorite = NOT is_favorite, updated_at = now()
            WHERE id = $1
            RETURNING user_id, is_favorite
            """,
            to_uuid(recipe_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Recipe not found")
        _require_user_match(uid, str(row["user_id"]))
        
        return {"is_favorite": row["is_favorite"]}


@api_router.put("/recipes/{recipe_id}/cooked")
async def increment_times_cooked(recipe_id: str, uid: str = Depends(get_current_uid)):
    """Increment the times_cooked counter for a recipe."""
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE saved_recipes
            SET times_cooked = times_cooked + 1, updated_at = now()
            WHERE id = $1
            RETURNING user_id, times_cooked
            """,
            to_uuid(recipe_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Recipe not found")
        _require_user_match(uid, str(row["user_id"]))
        
        return {"times_cooked": row["times_cooked"]}


# =====================
# QUEST API
# =====================

async def _ensure_user_xp(conn: asyncpg.Connection, user_id: str):
    """Ensure user_xp record exists for user."""
    await conn.execute(
        """
        INSERT INTO user_xp (user_id) VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        """,
        to_uuid(user_id)
    )


async def _get_user_meal_stats_for_quests(conn: asyncpg.Connection, user_id: str, quest_date: str) -> dict:
    """Get meal stats for quest progress calculation."""
    # Get meals for the quest date
    rows = await conn.fetch(
        """
        SELECT 
            COUNT(*) as meal_count,
            COALESCE(SUM(total_calories), 0) as total_calories,
            COALESCE(SUM(total_protein), 0) as total_protein,
            COALESCE(SUM(total_carbs), 0) as total_carbs,
            COALESCE(SUM(total_fat), 0) as total_fat,
            COUNT(CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 END) as photo_logs,
            COUNT(CASE WHEN meal_type = 'breakfast' AND EXTRACT(HOUR FROM timestamp) < 10 THEN 1 END) as early_breakfasts
        FROM meals
        WHERE user_id = $1
          AND DATE(timestamp) = $2::date
        """,
        to_uuid(user_id),
        quest_date
    )
    
    row = rows[0] if rows else None
    
    # Get user targets
    profile = await conn.fetchrow(
        "SELECT daily_calorie_target, protein_target, carbs_target, fat_target FROM profiles WHERE id = $1",
        to_uuid(user_id)
    )
    
    targets = {
        "calories": float(profile["daily_calorie_target"] or 2000) if profile else 2000,
        "protein": float(profile["protein_target"] or 150) if profile else 150,
        "carbs": float(profile["carbs_target"] or 200) if profile else 200,
        "fat": float(profile["fat_target"] or 65) if profile else 65,
    }
    
    return {
        "meal_count": int(row["meal_count"]) if row else 0,
        "total_calories": float(row["total_calories"]) if row else 0,
        "total_protein": float(row["total_protein"]) if row else 0,
        "total_carbs": float(row["total_carbs"]) if row else 0,
        "total_fat": float(row["total_fat"]) if row else 0,
        "photo_logs": int(row["photo_logs"]) if row else 0,
        "early_breakfasts": int(row["early_breakfasts"]) if row else 0,
        "targets": targets,
    }


def _calculate_quest_progress(quest_type: str, target_value: float, stats: dict) -> tuple[float, bool]:
    """Calculate current progress and completion status for a quest."""
    current = 0.0
    
    if quest_type == "log_meals":
        current = stats["meal_count"]
    elif quest_type == "hit_protein":
        # Progress as percentage of target
        protein_pct = (stats["total_protein"] / stats["targets"]["protein"]) * 100 if stats["targets"]["protein"] > 0 else 0
        current = min(protein_pct, 100)
    elif quest_type == "stay_under_calories":
        # Under target = 100%, over = scaled down
        cal_pct = (stats["total_calories"] / stats["targets"]["calories"]) * 100 if stats["targets"]["calories"] > 0 else 0
        current = 100 if cal_pct <= 100 else max(0, 200 - cal_pct)
    elif quest_type == "hit_all_macros":
        # Check if all macros are within ±10% of target
        p_pct = (stats["total_protein"] / stats["targets"]["protein"]) * 100 if stats["targets"]["protein"] > 0 else 0
        c_pct = (stats["total_carbs"] / stats["targets"]["carbs"]) * 100 if stats["targets"]["carbs"] > 0 else 0
        f_pct = (stats["total_fat"] / stats["targets"]["fat"]) * 100 if stats["targets"]["fat"] > 0 else 0
        
        in_range = lambda pct: 90 <= pct <= 110
        if in_range(p_pct) and in_range(c_pct) and in_range(f_pct):
            current = 100
        else:
            # Average of how close each macro is to target
            current = min(100, (min(p_pct, 100) + min(c_pct, 100) + min(f_pct, 100)) / 3)
    elif quest_type == "log_photo":
        current = stats["photo_logs"]
    elif quest_type == "log_breakfast":
        current = stats["early_breakfasts"]
    
    is_completed = current >= target_value
    return current, is_completed


@api_router.get("/quests/{user_id}/daily")
async def get_daily_quests(user_id: str, uid: str = Depends(get_current_uid)):
    """Get user's daily quests with current progress."""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    
    today = datetime.now(timezone.utc).date()
    
    async with pool.acquire() as conn:
        await _ensure_user_xp(conn, user_id)
        
        # Check if quests exist for today, if not create them
        existing = await conn.fetchval(
            "SELECT COUNT(*) FROM user_quests WHERE user_id = $1 AND quest_date = $2::date",
            to_uuid(user_id), today
        )
        
        if existing == 0:
            # Get active quest definitions and create user quests
            definitions = await conn.fetch(
                "SELECT id, quest_type, target_value FROM quest_definitions WHERE is_daily = true AND is_active = true LIMIT 3"
            )
            for defn in definitions:
                await conn.execute(
                    """
                    INSERT INTO user_quests (user_id, quest_definition_id, quest_date, target_value)
                    VALUES ($1, $2, $3::date, $4)
                    ON CONFLICT (user_id, quest_definition_id, quest_date) DO NOTHING
                    """,
                    to_uuid(user_id), defn["id"], today, float(defn["target_value"])
                )
        
        # Get meal stats for progress calculation
        stats = await _get_user_meal_stats_for_quests(conn, user_id, today)
        
        # Fetch quests with definitions
        quests = await conn.fetch(
            """
            SELECT 
                uq.id, uq.current_value, uq.target_value, uq.is_completed, uq.xp_claimed,
                qd.quest_type, qd.title, qd.description, qd.icon, qd.icon_color, 
                qd.xp_reward, qd.target_unit
            FROM user_quests uq
            JOIN quest_definitions qd ON uq.quest_definition_id = qd.id
            WHERE uq.user_id = $1 AND uq.quest_date = $2::date
            ORDER BY qd.xp_reward DESC
            """,
            to_uuid(user_id), today
        )
        
        result = []
        for q in quests:
            # Calculate real-time progress
            current, is_completed = _calculate_quest_progress(
                q["quest_type"], q["target_value"], stats
            )
            
            # Update if changed
            if current != q["current_value"] or is_completed != q["is_completed"]:
                await conn.execute(
                    """
                    UPDATE user_quests 
                    SET current_value = $1, is_completed = $2, 
                        completed_at = CASE WHEN $2 AND completed_at IS NULL THEN now() ELSE completed_at END,
                        updated_at = now()
                    WHERE id = $3
                    """,
                    current, is_completed, q["id"]
                )
            
            result.append({
                "id": str(q["id"]),
                "title": q["title"],
                "description": q["description"],
                "icon": q["icon"],
                "icon_color": q["icon_color"],
                "xp": q["xp_reward"],
                "current": round(current, 1),
                "target": q["target_value"],
                "unit": q["target_unit"],
                "is_completed": is_completed,
                "xp_claimed": q["xp_claimed"],
            })
        
        return {"quests": result, "date": today.isoformat()}


@api_router.post("/quests/{user_id}/claim/{quest_id}")
async def claim_quest_xp(user_id: str, quest_id: str, uid: str = Depends(get_current_uid)):
    """Claim XP reward for a completed quest."""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    
    async with pool.acquire() as conn:
        # Get quest and verify it's completed and not yet claimed
        quest = await conn.fetchrow(
            """
            SELECT uq.id, uq.is_completed, uq.xp_claimed, qd.xp_reward
            FROM user_quests uq
            JOIN quest_definitions qd ON uq.quest_definition_id = qd.id
            WHERE uq.id = $1 AND uq.user_id = $2
            """,
            to_uuid(quest_id), to_uuid(user_id)
        )
        
        if not quest:
            raise HTTPException(status_code=404, detail="Quest not found")
        if not quest["is_completed"]:
            raise HTTPException(status_code=400, detail="Quest not yet completed")
        if quest["xp_claimed"]:
            raise HTTPException(status_code=400, detail="XP already claimed")
        
        xp_reward = quest["xp_reward"]
        
        # Mark as claimed
        await conn.execute(
            "UPDATE user_quests SET xp_claimed = true, updated_at = now() WHERE id = $1",
            to_uuid(quest_id)
        )
        
        # Update user XP
        await _ensure_user_xp(conn, user_id)
        new_xp = await conn.fetchrow(
            """
            UPDATE user_xp 
            SET total_xp = total_xp + $1, 
                quests_completed = quests_completed + 1,
                level = GREATEST(1, (total_xp + $1) / 100 + 1),
                updated_at = now()
            WHERE user_id = $2
            RETURNING total_xp, level, quests_completed
            """,
            xp_reward, to_uuid(user_id)
        )
        
        return {
            "xp_earned": xp_reward,
            "total_xp": new_xp["total_xp"],
            "level": new_xp["level"],
            "quests_completed": new_xp["quests_completed"],
        }


@api_router.get("/quests/{user_id}/badges")
async def get_user_badges(user_id: str, uid: str = Depends(get_current_uid)):
    """Get user's badges (earned and available)."""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    
    async with pool.acquire() as conn:
        # Get all badge definitions with earned status
        badges = await conn.fetch(
            """
            SELECT 
                bd.id, bd.badge_type, bd.title, bd.description, bd.icon, 
                bd.xp_reward, bd.tier,
                ub.earned_at IS NOT NULL as earned,
                ub.earned_at
            FROM badge_definitions bd
            LEFT JOIN user_badges ub ON bd.id = ub.badge_definition_id AND ub.user_id = $1
            WHERE bd.is_active = true
            ORDER BY ub.earned_at DESC NULLS LAST, bd.tier, bd.xp_reward DESC
            """,
            to_uuid(user_id)
        )
        
        return {
            "badges": [
                {
                    "id": str(b["id"]),
                    "type": b["badge_type"],
                    "title": b["title"],
                    "description": b["description"],
                    "icon": b["icon"],
                    "xp": b["xp_reward"],
                    "tier": b["tier"],
                    "earned": b["earned"],
                    "earned_at": b["earned_at"].isoformat() if b["earned_at"] else None,
                }
                for b in badges
            ]
        }


@api_router.get("/quests/{user_id}/stats")
async def get_quest_stats(user_id: str, uid: str = Depends(get_current_uid)):
    """Get user's XP, level, streak, and quest stats."""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    
    async with pool.acquire() as conn:
        await _ensure_user_xp(conn, user_id)

        now_utc = datetime.now(timezone.utc)
        today = now_utc.date()
        yesterday = today - timedelta(days=1)

        try:
            await _upsert_user_daily_activity(
                conn,
                user_id,
                today,
                was_active=True,
                active_at=now_utc,
            )
        except Exception:
            logger.warning("[QUEST_STATS] Failed to mark user as active", exc_info=True)

        # Backfill recent history once so streak/calendar reads are fast and join-free.
        try:
            await _backfill_user_daily_activity_from_meals(conn, user_id, today - timedelta(days=120))
        except Exception:
            logger.warning("[QUEST_STATS] Failed to backfill user_daily_activity", exc_info=True)

        activity_rows = await conn.fetch(
            """
            SELECT activity_date, logged_food
            FROM user_daily_activity
            WHERE user_id = $1 AND activity_date >= $2
            """,
            to_uuid(user_id),
            yesterday,
        )

        logged_today = False
        logged_yesterday = False
        for r in activity_rows:
            if r["activity_date"] == today:
                logged_today = bool(r["logged_food"])
            if r["activity_date"] == yesterday:
                logged_yesterday = bool(r["logged_food"])
        
        # Get current stats
        stats = await conn.fetchrow(
            "SELECT total_xp, level, current_streak, longest_streak, quests_completed, badges_earned, last_active_date FROM user_xp WHERE user_id = $1",
            to_uuid(user_id)
        )
        
        current_streak = stats["current_streak"] if stats else 0
        longest_streak = stats["longest_streak"] if stats else 0
        last_active = stats["last_active_date"] if stats else None
        
        # Update streak logic
        if logged_today:
            if last_active == yesterday or (last_active == today):
                # Continue or maintain streak
                if last_active != today:
                    current_streak += 1
            elif last_active is None or (today - last_active).days > 1:
                # Start new streak
                current_streak = 1
            
            longest_streak = max(longest_streak, current_streak)
            
            await conn.execute(
                """
                UPDATE user_xp 
                SET current_streak = $1, longest_streak = $2, last_active_date = $3, updated_at = now()
                WHERE user_id = $4
                """,
                current_streak, longest_streak, today, to_uuid(user_id)
            )
        elif last_active and (today - last_active).days > 1:
            # Streak broken
            current_streak = 0
            await conn.execute(
                "UPDATE user_xp SET current_streak = 0, updated_at = now() WHERE user_id = $1",
                to_uuid(user_id)
            )
        
        # Calculate XP needed for next level
        total_xp = stats["total_xp"] if stats else 0
        level = stats["level"] if stats else 1
        xp_for_next = (level * 100) - (total_xp % 100)
        
        return {
            "total_xp": total_xp,
            "level": level,
            "xp_for_next_level": xp_for_next,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "quests_completed": stats["quests_completed"] if stats else 0,
            "badges_earned": stats["badges_earned"] if stats else 0,
        }


@api_router.get("/quests/{user_id}/streak-calendar")
async def get_streak_calendar(
    user_id: str,
    days: int = Query(90, ge=7, le=366),
    uid: str = Depends(get_current_uid),
):
    _require_user_match(uid, user_id)
    pool = _require_pool()
    now_utc = datetime.now(timezone.utc)
    end_date = now_utc.date()
    start_date = end_date - timedelta(days=int(days) - 1)

    async with pool.acquire() as conn:
        try:
            await _backfill_user_daily_activity_from_meals(conn, user_id, start_date)
        except Exception:
            logger.warning("[STREAK_CALENDAR] Failed to backfill user_daily_activity", exc_info=True)

        rows = await conn.fetch(
            """
            SELECT
                activity_date,
                was_active,
                logged_food,
                last_active_at,
                last_logged_food_at
            FROM user_daily_activity
            WHERE user_id = $1
              AND activity_date >= $2
              AND activity_date <= $3
            ORDER BY activity_date ASC
            """,
            to_uuid(user_id),
            start_date,
            end_date,
        )

        by_date: Dict[date, asyncpg.Record] = {r["activity_date"]: r for r in rows}
        out_days: List[Dict[str, Any]] = []
        cur = start_date
        while cur <= end_date:
            r = by_date.get(cur)
            out_days.append(
                {
                    "date": cur.isoformat(),
                    "was_active": bool(r["was_active"]) if r else False,
                    "logged_food": bool(r["logged_food"]) if r else False,
                    "last_active_at": r["last_active_at"].isoformat() if r and r["last_active_at"] else None,
                    "last_logged_food_at": r["last_logged_food_at"].isoformat() if r and r["last_logged_food_at"] else None,
                }
            )
            cur = cur + timedelta(days=1)

        return {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": out_days,
        }


@api_router.post("/quests/{user_id}/check-badges")
async def check_and_award_badges(user_id: str, uid: str = Depends(get_current_uid)):
    """Check if user has earned any new badges and award them."""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    
    async with pool.acquire() as conn:
        await _ensure_user_xp(conn, user_id)
        
        # Get user stats for badge checking
        meal_count = await conn.fetchval(
            "SELECT COUNT(*) FROM meals WHERE user_id = $1", to_uuid(user_id)
        )
        
        user_stats = await conn.fetchrow(
            "SELECT current_streak, quests_completed FROM user_xp WHERE user_id = $1",
            to_uuid(user_id)
        )
        streak = user_stats["current_streak"] if user_stats else 0
        quests = user_stats["quests_completed"] if user_stats else 0
        
        # Get badges not yet earned
        available = await conn.fetch(
            """
            SELECT bd.id, bd.badge_type, bd.requirement_type, bd.requirement_value, bd.xp_reward, bd.title
            FROM badge_definitions bd
            WHERE bd.is_active = true
              AND NOT EXISTS (
                  SELECT 1 FROM user_badges ub 
                  WHERE ub.badge_definition_id = bd.id AND ub.user_id = $1
              )
            """,
            to_uuid(user_id)
        )
        
        newly_earned = []
        total_xp_earned = 0
        
        for badge in available:
            earned = False
            req_type = badge["requirement_type"]
            req_val = badge["requirement_value"]
            
            if req_type == "meal_count" and meal_count >= req_val:
                earned = True
            elif req_type == "streak" and streak >= req_val:
                earned = True
            elif req_type == "quest_count" and quests >= req_val:
                earned = True
            
            if earned:
                # Award badge
                await conn.execute(
                    "INSERT INTO user_badges (user_id, badge_definition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    to_uuid(user_id), badge["id"]
                )
                
                # Add XP
                total_xp_earned += badge["xp_reward"]
                newly_earned.append({
                    "id": str(badge["id"]),
                    "title": badge["title"],
                    "xp": badge["xp_reward"],
                })
        
        # Update user XP and badge count
        if newly_earned:
            await conn.execute(
                """
                UPDATE user_xp 
                SET total_xp = total_xp + $1, 
                    badges_earned = badges_earned + $2,
                    level = GREATEST(1, (total_xp + $1) / 100 + 1),
                    updated_at = now()
                WHERE user_id = $3
                """,
                total_xp_earned, len(newly_earned), to_uuid(user_id)
            )
        
        return {
            "newly_earned": newly_earned,
            "xp_earned": total_xp_earned,
        }
@api_router.get("/quests/leaderboard")
async def get_leaderboard(
    scope: str = Query("global", pattern="^(global|friends)$"),
    uid: str = Depends(get_current_uid),
):
    """Get leaderboard. scope='global' for all users, scope='friends' for followed users + self."""
    pool = _require_pool()
    
    async with pool.acquire() as conn:
        if scope == "friends":
            rows = await conn.fetch(
                """
                SELECT 
                    ux.user_id,
                    ux.total_xp,
                    ux.level,
                    ux.badges_earned,
                    p.name,
                    ux.user_id = $1 as is_current_user
                FROM user_xp ux
                JOIN profiles p ON ux.user_id = p.id
                WHERE ux.user_id = $1
                   OR ux.user_id IN (
                        SELECT following_id
                        FROM user_follows
                        WHERE follower_id = $1
                   )
                ORDER BY ux.total_xp DESC
                LIMIT 50
                """,
                to_uuid(uid)
            )
        else:
            rows = await conn.fetch(
                """
                SELECT 
                    ux.user_id,
                    ux.total_xp,
                    ux.level,
                    ux.badges_earned,
                    p.name,
                    ux.user_id = $1 as is_current_user
                FROM user_xp ux
                JOIN profiles p ON ux.user_id = p.id
                ORDER BY ux.total_xp DESC
                LIMIT 50
                """,
                to_uuid(uid)
            )
        
        leaderboard = []
        for i, row in enumerate(rows):
            leaderboard.append({
                "rank": i + 1,
                "user_id": str(row["user_id"]),
                "name": row["name"] or "Anonymous Chef",
                "total_xp": row["total_xp"],
                "level": row["level"],
                "badges_earned": row["badges_earned"],
                "is_current_user": row["is_current_user"],
            })
            
        # If current user is not in top 50, fetch their rank (optional, for "My Rank" feature)
        # For now, we'll just return the top 50 list.
        
        return {"leaderboard": leaderboard, "scope": scope}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)