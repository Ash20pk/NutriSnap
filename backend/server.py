from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException, Depends, Header, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import uuid
from datetime import datetime, timedelta, timezone
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Postgres (Supabase) connection
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
pg_pool: asyncpg.Pool | None = None

# OpenAI Key for AI features
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o')
OPENAI_CHEAP_MODEL = os.environ.get('OPENAI_CHEAP_MODEL', 'gpt-4o-mini')
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

# USDA Rate Limiting: 1,000 req/hour = 900 req/hour with safety margin
USDA_RATE_LIMIT_PER_HOUR = 900
USDA_RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds
_usda_request_timestamps: List[float] = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool

    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set. Configure it to your Supabase Postgres connection string.")

    pg_pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=1,
        max_size=int(os.environ.get("PG_POOL_MAX", "10")),
        command_timeout=30,
        statement_cache_size=0,
    )

    async with pg_pool.acquire() as conn:
        await _ensure_schema(conn)
    
    # Run seeding in background to avoid blocking startup
    if SEED_FOODS_ON_STARTUP or SEED_USDA_ON_STARTUP:
        import asyncio
        asyncio.create_task(_background_seed())

    try:
        yield
    finally:
        if pg_pool is not None:
            await pg_pool.close()
            pg_pool = None

# Create the main app
app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def _ensure_schema(conn: asyncpg.Connection):
    await conn.execute(
        """
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

        CREATE INDEX IF NOT EXISTS idx_foods_name_category ON foods (lower(name), category);
        CREATE INDEX IF NOT EXISTS idx_foods_category ON foods (category);
        CREATE INDEX IF NOT EXISTS idx_foods_veg ON foods (is_vegetarian);

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
        """
    )

    # Evolve foods schema for global catalog + micronutrients + sync metadata (safe/idempotent)
    await conn.execute(
        """
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


def _convert_unit(amount: float, unit: str, target_unit: str) -> float | None:
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
    url = f"https://world.openfoodfacts.org/api/v2/product/{code}.json"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url)
        if r.status_code != 200:
            return None
        return r.json()


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


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid UUID")


def _profile_from_record(record: asyncpg.Record) -> dict:
    return {
        "id": str(record["id"]),
        "name": record["name"],
        "age": record["age"],
        "gender": record["gender"],
        "height": record["height"],
        "weight": record["weight"],
        "goal": record["goal"],
        "activity_level": record["activity_level"],
        "dietary_preference": record["dietary_preference"],
        "daily_calorie_target": record["daily_calorie_target"],
        "protein_target": record["protein_target"],
        "carbs_target": record["carbs_target"],
        "fat_target": record["fat_target"],
        "created_at": record["created_at"],
        "onboarding_completed": record["onboarding_completed"],
    }


def _meal_from_record(record: asyncpg.Record) -> dict:
    foods = record["foods"]
    if isinstance(foods, str):
        try:
            foods = json.loads(foods)
        except Exception:
            # If parsing fails, keep original value and let validation raise a clear error
            pass
    return {
        "id": str(record["id"]),
        "user_id": str(record["user_id"]),
        "meal_type": record["meal_type"],
        "foods": foods,
        "total_calories": record["total_calories"],
        "total_protein": record["total_protein"],
        "total_carbs": record["total_carbs"],
        "total_fat": record["total_fat"],
        "image_base64": record["image_base64"],
        "logging_method": record["logging_method"],
        "notes": record["notes"],
        "timestamp": record["timestamp"],
    }

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


def _require_user_match(uid: str, user_id: str):
    if uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user mismatch")

# ============ MODELS ============

class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    age: int
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

class UserProfileCreate(BaseModel):
    name: str
    age: int
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

def calculate_calorie_target(weight: float, height: float, age: int, gender: str, activity_level: str, goal: str) -> Dict[str, float]:
    """Calculate daily calorie and macro targets based on user profile"""
    # Calculate BMR using Mifflin-St Jeor Equation
    if gender.lower() == "male":
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
    
    # Activity multiplier
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9
    }
    
    tdee = bmr * activity_multipliers.get(activity_level, 1.2)
    
    # Adjust for goal
    if goal == "lose_weight":
        calories = tdee - 500  # 500 calorie deficit
    elif goal == "gain_muscle":
        calories = tdee + 300  # 300 calorie surplus
    else:
        calories = tdee
    
    # Calculate macros (40% carbs, 30% protein, 30% fat)
    protein = (calories * 0.30) / 4  # 4 cal per gram
    carbs = (calories * 0.40) / 4
    fat = (calories * 0.30) / 9  # 9 cal per gram
    
    return {
        "daily_calorie_target": round(calories, 2),
        "protein_target": round(protein, 2),
        "carbs_target": round(carbs, 2),
        "fat_target": round(fat, 2)
    }

def _normalize_base64_image(image_base64: str) -> str:
    if not image_base64:
        return image_base64
    if "," in image_base64 and image_base64.strip().lower().startswith("data:"):
        return image_base64.split(",", 1)[1]
    return image_base64

def _extract_json_from_text(text: str) -> str:
    content = text or ""
    if "```json" in content:
        return content.split("```json", 1)[1].split("```", 1)[0].strip()
    if "```" in content:
        return content.split("```", 1)[1].split("```", 1)[0].strip()
    return content.strip()

async def analyze_food_image(image_base64: str) -> Dict[str, Any]:
    """Analyze food image using OpenAI Vision API"""
    try:
        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        normalized_image_base64 = _normalize_base64_image(image_base64)
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
        extracted = _extract_json_from_text(content)

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

        normalized_image_base64 = _normalize_base64_image(image_base64)
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
        extracted = _extract_json_from_text(content)
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
        extracted = _extract_json_from_text(content)
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
    return {"message": "NutriSnap API v1.0"}

# ===== User Management =====

@api_router.post("/user/onboard", response_model=UserProfile)
async def onboard_user(user_data: UserProfileCreate, uid: str = Depends(get_current_uid)):
    """Create user profile with calculated targets"""
    try:
        targets = calculate_calorie_target(
            user_data.weight,
            user_data.height,
            user_data.age,
            user_data.gender,
            user_data.activity_level,
            user_data.goal,
        )

        user_dict = user_data.dict()
        user_dict.update(targets)
        user_profile = UserProfile(id=uid, **user_dict)

        pool = _require_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                 """
                 INSERT INTO profiles (
                     id, name, age, gender, height, weight,
                     goal, activity_level, dietary_preference,
                     daily_calorie_target, protein_target, carbs_target, fat_target,
                     onboarding_completed
                 ) VALUES (
                     $1,$2,$3,$4,$5,$6,
                     $7,$8,$9,
                     $10,$11,$12,$13,
                     $14
                 )
                 ON CONFLICT (id) DO UPDATE SET
                     name = EXCLUDED.name,
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
                     onboarding_completed = EXCLUDED.onboarding_completed
                 RETURNING *
                 """,
                 _uuid(uid),
                 user_profile.name,
                 user_profile.age,
                 user_profile.gender,
                 user_profile.height,
                 user_profile.weight,
                 user_profile.goal,
                 user_profile.activity_level,
                 user_profile.dietary_preference,
                 user_profile.daily_calorie_target,
                 user_profile.protein_target,
                 user_profile.carbs_target,
                 user_profile.fat_target,
                 user_profile.onboarding_completed,
            )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create profile")
        return UserProfile(**_profile_from_record(row))
    except Exception as e:
        logger.error(f"Error onboarding user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/user/me", response_model=UserProfile)
async def get_me(uid: str = Depends(get_current_uid)):
    """Get current user's profile"""
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", _uuid(uid))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**_profile_from_record(row))


@api_router.get("/user/{user_id}", response_model=UserProfile)
async def get_user(user_id: str, uid: str = Depends(get_current_uid)):
    """Get user profile"""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", _uuid(user_id))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**_profile_from_record(row))


@api_router.put("/user/{user_id}/goals", response_model=UserProfile)
async def update_goals(user_id: str, payload: GoalsUpdateRequest, uid: str = Depends(get_current_uid)):
    """Update user goals and recalculate targets"""
    _require_user_match(uid, user_id)
    pool = _require_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", _uuid(user_id))
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
            _uuid(user_id),
            payload.goal,
            payload.activity_level,
            targets["daily_calorie_target"],
            targets["protein_target"],
            targets["carbs_target"],
            targets["fat_target"],
        )

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**_profile_from_record(row))


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


@api_router.post("/meals/log", response_model=MealLog)
async def log_meal(meal_data: MealLogCreate, uid: str = Depends(get_current_uid)):
    """Log a meal manually or save photo analysis result"""
    try:
        logger.info(f"[LOG_MEAL] Starting meal log for user={meal_data.user_id}, meal_type={meal_data.meal_type}, foods_count={len(meal_data.foods)}")
        _require_user_match(uid, meal_data.user_id)

        total_calories = sum([f["calories"] for f in meal_data.foods])
        total_protein = sum([f["protein"] for f in meal_data.foods])
        total_carbs = sum([f["carbs"] for f in meal_data.foods])
        total_fat = sum([f["fat"] for f in meal_data.foods])
        
        logger.info(f"[LOG_MEAL] Calculated totals: cal={total_calories}, protein={total_protein}, carbs={total_carbs}, fat={total_fat}")

        meal_dict = meal_data.dict()
        meal_dict.update(
            {
                "total_calories": total_calories,
                "total_protein": total_protein,
                "total_carbs": total_carbs,
                "total_fat": total_fat,
            }
        )

        meal_log = MealLog(**meal_dict)
        pool = _require_pool()
        async with pool.acquire() as conn:
            profile_exists = await conn.fetchval(
                "SELECT 1 FROM profiles WHERE id = $1",
                _uuid(meal_data.user_id),
            )
            logger.info(f"[LOG_MEAL] Profile check: exists={profile_exists}")
            if not profile_exists:
                raise HTTPException(status_code=404, detail="User not found")

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
                    id, user_id, meal_type, foods,
                    total_calories, total_protein, total_carbs, total_fat,
                    image_base64, logging_method, notes, timestamp, review_status
                ) VALUES (
                    $1,$2,$3,$4::jsonb,
                    $5,$6,$7,$8,
                    $9,$10,$11,$12,$13
                )
                RETURNING *
                """,
                _uuid(meal_log.id),
                _uuid(meal_log.user_id),
                meal_log.meal_type,
                json.dumps(meal_log.foods),
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
        meal_response = MealLog(**_meal_from_record(row))
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
            _uuid(request.meal_id),
        )
        if not meal:
            raise HTTPException(status_code=404, detail="Meal not found")
        
        _require_user_match(uid, str(meal["user_id"]))
        
        if meal["review_status"] != "pending_review":
            raise HTTPException(status_code=400, detail="Meal is not pending review")
        
        # Update food names if edited by user
        for update in request.food_updates:
            food_id = _uuid(update.food_id)
            
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
            _uuid(request.meal_id),
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
            _uuid(user_id),
            int(days),
            int(timezone_offset),
        )

        meals = [_meal_from_record(r) for r in rows]

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
                    sodium_mg_per_100g,
                    potassium_mg_per_100g,
                    calcium_mg_per_100g,
                    iron_mg_per_100g,
                    vitamin_c_mg_per_100g
                FROM foods
                WHERE id = ANY($1::uuid[])
                """,
                list({*food_ids}),
            )
            for fr in food_rows:
                foods_by_id[str(fr["id"])] = dict(fr)

        for m in meals:
            micros = {
                "fiber_g": 0.0,
                "sugar_g": 0.0,
                "saturated_fat_g": 0.0,
                "sodium_mg": 0.0,
                "potassium_mg": 0.0,
                "calcium_mg": 0.0,
                "iron_mg": 0.0,
                "vitamin_c_mg": 0.0,
            }

            foods = m.get("foods") or []
            if isinstance(foods, list):
                for f in foods:
                    if not isinstance(f, dict):
                        continue
                    fid = f.get("food_id")
                    if not fid:
                        continue
                    row = foods_by_id.get(str(fid))
                    if not row:
                        continue

                    grams = f.get("quantity")
                    if grams is None:
                        grams = f.get("displayQuantity")
                    try:
                        grams_f = float(grams or 0)
                    except Exception:
                        grams_f = 0.0
                    if grams_f <= 0:
                        continue
                    ratio = grams_f / 100.0

                    micros["fiber_g"] += float(row.get("fiber_g_per_100g") or 0) * ratio
                    micros["sugar_g"] += float(row.get("sugar_g_per_100g") or 0) * ratio
                    micros["saturated_fat_g"] += float(row.get("saturated_fat_g_per_100g") or 0) * ratio
                    micros["sodium_mg"] += float(row.get("sodium_mg_per_100g") or 0) * ratio
                    micros["potassium_mg"] += float(row.get("potassium_mg_per_100g") or 0) * ratio
                    micros["calcium_mg"] += float(row.get("calcium_mg_per_100g") or 0) * ratio
                    micros["iron_mg"] += float(row.get("iron_mg_per_100g") or 0) * ratio
                    micros["vitamin_c_mg"] += float(row.get("vitamin_c_mg_per_100g") or 0) * ratio

            m["micros"] = micros

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
            _uuid(user_id),
            start_of_day,
            end_of_day,
        )

        user_row = await conn.fetchrow(
            """
            SELECT daily_calorie_target, protein_target, carbs_target, fat_target
            FROM profiles
            WHERE id = $1
            """,
            _uuid(user_id),
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
                        if (n := pick("Vitamin A, RAE")) or (n := pick("Vitamin A, IU")):
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
                        if (n := pick("Folate, total")) or (n := pick("Folate, DFE")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["folate_ug_per_100g"] = v
                        if (n := pick("Vitamin B-12")):
                            v = _convert_unit(float(n["amount"]), n.get("unit", ""), "ug")
                            if v is not None:
                                update["vitamin_b12_ug_per_100g"] = v
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
                        sodium_mg_per_100g = COALESCE($10, sodium_mg_per_100g),
                        vitamin_c_mg_per_100g = COALESCE($11, vitamin_c_mg_per_100g),
                        iron_mg_per_100g = COALESCE($12, iron_mg_per_100g),
                        raw_payload = COALESCE($13::jsonb, raw_payload),
                        brand = COALESCE($14, brand),
                        image_url = COALESCE($15, image_url),
                        ingredients = COALESCE($16, ingredients),
                        source = COALESCE($17, source),
                        external_id = COALESCE($18, external_id),
                        barcode = COALESCE($19, barcode),
                        data_type = COALESCE($20, data_type),
                        publication_date = COALESCE($21, publication_date),
                        is_generic = COALESCE($22, is_generic),
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
                    update.get("sodium_mg_per_100g"),
                    update.get("vitamin_c_mg_per_100g"),
                    update.get("iron_mg_per_100g"),
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
 
 
@api_router.post("/chef/generate")
async def generate_recipe(request: dict, uid: str = Depends(get_current_uid)):
    """Generate personalized recipe using AI"""
    try:
        _ = uid
        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        prompt = request.get("prompt", "")

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
        extracted = _extract_json_from_text(content)
        recipe = json.loads(extracted)
        return {"recipe": recipe}
    except Exception as e:
        logger.error(f"Error generating recipe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)