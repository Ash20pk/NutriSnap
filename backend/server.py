from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import uuid
from datetime import datetime, timedelta
import base64
import json
from openai import AsyncOpenAI
import jwt
from jwt import PyJWKClient
import asyncpg

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Postgres (Supabase) connection
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
pg_pool: asyncpg.Pool | None = None

# OpenAI Key for AI features
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o')
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

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
    )

    async with pg_pool.acquire() as conn:
        await _ensure_schema(conn)

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
            name text NOT NULL,
            age integer NOT NULL,
            gender text NOT NULL,
            height double precision NOT NULL,
            weight double precision NOT NULL,
            goal text NOT NULL,
            activity_level text NOT NULL,
            dietary_preference text NOT NULL,
            daily_calorie_target double precision NOT NULL,
            protein_target double precision NOT NULL,
            carbs_target double precision NOT NULL,
            fat_target double precision NOT NULL,
            onboarding_completed boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now()
        );

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
        """
    )


def _require_pool() -> asyncpg.Pool:
    if pg_pool is None:
        raise RuntimeError("Postgres pool is not initialized")
    return pg_pool


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
    return {
        "id": str(record["id"]),
        "user_id": str(record["user_id"]),
        "meal_type": record["meal_type"],
        "foods": record["foods"],
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
    name_hindi: Optional[str] = None
    category: str  # "north_indian", "south_indian", "street_food", etc.
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    serving_size: float  # standard serving in grams
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

class VoiceLogRequest(BaseModel):
    text: str
    user_id: str
    meal_type: str

# ============ INDIAN FOOD DATABASE ============

INDIAN_FOODS_DB = [
    {"name": "Dal Makhani", "name_hindi": "दाल मखनी", "category": "north_indian", "calories_per_100g": 140, "protein_per_100g": 7, "carbs_per_100g": 12, "fat_per_100g": 8, "serving_size": 200, "is_vegetarian": True},
    {"name": "Butter Chicken", "name_hindi": "बटर चिकन", "category": "north_indian", "calories_per_100g": 250, "protein_per_100g": 15, "carbs_per_100g": 8, "fat_per_100g": 18, "serving_size": 200, "is_vegetarian": False},
    {"name": "Roti", "name_hindi": "रोटी", "category": "north_indian", "calories_per_100g": 260, "protein_per_100g": 8, "carbs_per_100g": 50, "fat_per_100g": 3, "serving_size": 40, "is_vegetarian": True},
    {"name": "Naan", "name_hindi": "नान", "category": "north_indian", "calories_per_100g": 310, "protein_per_100g": 9, "carbs_per_100g": 52, "fat_per_100g": 7, "serving_size": 90, "is_vegetarian": True},
    {"name": "Paneer Tikka", "name_hindi": "पनीर टिक्का", "category": "north_indian", "calories_per_100g": 220, "protein_per_100g": 14, "carbs_per_100g": 6, "fat_per_100g": 16, "serving_size": 150, "is_vegetarian": True},
    {"name": "Dosa", "name_hindi": "डोसा", "category": "south_indian", "calories_per_100g": 168, "protein_per_100g": 4, "carbs_per_100g": 28, "fat_per_100g": 4, "serving_size": 120, "is_vegetarian": True},
    {"name": "Idli", "name_hindi": "इडली", "category": "south_indian", "calories_per_100g": 58, "protein_per_100g": 2, "carbs_per_100g": 11, "fat_per_100g": 0.4, "serving_size": 40, "is_vegetarian": True},
    {"name": "Sambar", "name_hindi": "सांभर", "category": "south_indian", "calories_per_100g": 72, "protein_per_100g": 3, "carbs_per_100g": 12, "fat_per_100g": 1.5, "serving_size": 200, "is_vegetarian": True},
    {"name": "Vada", "name_hindi": "वड़ा", "category": "south_indian", "calories_per_100g": 230, "protein_per_100g": 8, "carbs_per_100g": 28, "fat_per_100g": 9, "serving_size": 50, "is_vegetarian": True},
    {"name": "Pani Puri", "name_hindi": "पानी पूरी", "category": "street_food", "calories_per_100g": 80, "protein_per_100g": 2, "carbs_per_100g": 15, "fat_per_100g": 1.5, "serving_size": 10, "is_vegetarian": True},
    {"name": "Vada Pav", "name_hindi": "वड़ा पाव", "category": "street_food", "calories_per_100g": 250, "protein_per_100g": 6, "carbs_per_100g": 38, "fat_per_100g": 8, "serving_size": 100, "is_vegetarian": True},
    {"name": "Samosa", "name_hindi": "समोसा", "category": "street_food", "calories_per_100g": 260, "protein_per_100g": 5, "carbs_per_100g": 30, "fat_per_100g": 13, "serving_size": 60, "is_vegetarian": True},
    {"name": "Chaat", "name_hindi": "चाट", "category": "street_food", "calories_per_100g": 150, "protein_per_100g": 4, "carbs_per_100g": 22, "fat_per_100g": 5, "serving_size": 100, "is_vegetarian": True},
    {"name": "Biryani", "name_hindi": "बिरयानी", "category": "north_indian", "calories_per_100g": 200, "protein_per_100g": 8, "carbs_per_100g": 28, "fat_per_100g": 6, "serving_size": 300, "is_vegetarian": False},
    {"name": "Chole Bhature", "name_hindi": "छोले भटूरे", "category": "north_indian", "calories_per_100g": 180, "protein_per_100g": 6, "carbs_per_100g": 26, "fat_per_100g": 6, "serving_size": 250, "is_vegetarian": True},
    {"name": "Palak Paneer", "name_hindi": "पालक पनीर", "category": "north_indian", "calories_per_100g": 115, "protein_per_100g": 7, "carbs_per_100g": 5, "fat_per_100g": 8, "serving_size": 200, "is_vegetarian": True},
    {"name": "Aloo Gobi", "name_hindi": "आलू गोभी", "category": "north_indian", "calories_per_100g": 90, "protein_per_100g": 2, "carbs_per_100g": 14, "fat_per_100g": 3, "serving_size": 150, "is_vegetarian": True},
    {"name": "Rajma", "name_hindi": "राजमा", "category": "north_indian", "calories_per_100g": 127, "protein_per_100g": 8, "carbs_per_100g": 22, "fat_per_100g": 0.5, "serving_size": 200, "is_vegetarian": True},
    {"name": "Paratha", "name_hindi": "पराठा", "category": "north_indian", "calories_per_100g": 320, "protein_per_100g": 7, "carbs_per_100g": 44, "fat_per_100g": 13, "serving_size": 80, "is_vegetarian": True},
    {"name": "Poha", "name_hindi": "पोहा", "category": "street_food", "calories_per_100g": 158, "protein_per_100g": 3, "carbs_per_100g": 32, "fat_per_100g": 2, "serving_size": 150, "is_vegetarian": True},
    {"name": "Upma", "name_hindi": "उपमा", "category": "south_indian", "calories_per_100g": 112, "protein_per_100g": 3, "carbs_per_100g": 20, "fat_per_100g": 2, "serving_size": 150, "is_vegetarian": True},
    {"name": "Masala Dosa", "name_hindi": "मसाला डोसा", "category": "south_indian", "calories_per_100g": 180, "protein_per_100g": 4, "carbs_per_100g": 30, "fat_per_100g": 5, "serving_size": 150, "is_vegetarian": True},
    {"name": "Uttapam", "name_hindi": "उत्तपम", "category": "south_indian", "calories_per_100g": 150, "protein_per_100g": 4, "carbs_per_100g": 26, "fat_per_100g": 3, "serving_size": 120, "is_vegetarian": True},
    {"name": "Khichdi", "name_hindi": "खिचड़ी", "category": "north_indian", "calories_per_100g": 120, "protein_per_100g": 4, "carbs_per_100g": 22, "fat_per_100g": 2, "serving_size": 200, "is_vegetarian": True},
    {"name": "Tandoori Chicken", "name_hindi": "तंदूरी चिकन", "category": "north_indian", "calories_per_100g": 150, "protein_per_100g": 22, "carbs_per_100g": 2, "fat_per_100g": 6, "serving_size": 150, "is_vegetarian": False},
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

def match_food_to_database(food_name: str, quantity_grams: float) -> Dict[str, Any]:
    """Match detected food to database and calculate nutrition"""
    # Simple fuzzy matching
    food_name_lower = food_name.lower()
    
    for food in INDIAN_FOODS_DB:
        if food_name_lower in food["name"].lower() or (food.get("name_hindi") and food_name_lower in food["name_hindi"].lower()):
            # Calculate nutrition based on quantity
            multiplier = quantity_grams / 100
            return {
                "name": food["name"],
                "quantity": quantity_grams,
                "calories": round(food["calories_per_100g"] * multiplier, 2),
                "protein": round(food["protein_per_100g"] * multiplier, 2),
                "carbs": round(food["carbs_per_100g"] * multiplier, 2),
                "fat": round(food["fat_per_100g"] * multiplier, 2),
                "matched": True
            }
    
    # If no match, return estimated values
    return {
        "name": food_name,
        "quantity": quantity_grams,
        "calories": round(quantity_grams * 1.5, 2),  # Rough estimate
        "protein": round(quantity_grams * 0.1, 2),
        "carbs": round(quantity_grams * 0.25, 2),
        "fat": round(quantity_grams * 0.05, 2),
        "matched": False
    }

# ============ API ROUTES ============

@api_router.get("/")
async def root():
    return {"message": "NutriSnap API v1.0"}

# ===== User Management =====

@api_router.post("/user/onboard", response_model=UserProfile)
async def onboard_user(user_data: UserProfileCreate, uid: str = Depends(get_current_uid)):
    """Create user profile with calculated targets"""
    try:
        # Calculate targets
        targets = calculate_calorie_target(
            user_data.weight,
            user_data.height,
            user_data.age,
            user_data.gender,
            user_data.activity_level,
            user_data.goal
        )
        
        # Create user profile
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
    
    # Recalculate targets
    targets = calculate_calorie_target(
        float(user_row["weight"]),
        float(user_row["height"]),
        int(user_row["age"]),
        str(user_row["gender"]),
        payload.activity_level,
        payload.goal
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
    """Search food database"""
    results = INDIAN_FOODS_DB.copy()
    
    if query:
        query_lower = query.lower()
        results = [f for f in results if query_lower in f["name"].lower() or (f.get("name_hindi") and query_lower in f["name_hindi"])]
    
    if category:
        results = [f for f in results if f["category"] == category]
    
    if vegetarian_only:
        results = [f for f in results if f["is_vegetarian"]]
    
    return {"foods": results, "count": len(results)}

@api_router.get("/foods/categories")
async def get_categories():
    """Get all food categories"""
    categories = list(set([f["category"] for f in INDIAN_FOODS_DB]))
    return {"categories": categories}

# ===== Meal Logging =====

@api_router.post("/meals/log-photo")
async def log_meal_photo(request: PhotoAnalysisRequest, uid: str = Depends(get_current_uid)):
    """Log meal from photo using AI analysis"""
    try:
        _require_user_match(uid, request.user_id)
        # Analyze image
        analysis = await analyze_food_image(request.image_base64)
        
        if "error" in analysis:
            raise HTTPException(status_code=500, detail=analysis["error"])
        
        # Match foods to database
        matched_foods = []
        for food in analysis.get("foods", []):
            matched = match_food_to_database(food["name"], food["estimated_quantity_grams"])
            matched["confidence"] = food.get("confidence", "medium")
            matched_foods.append(matched)
        
        return {
            "coin_detected": analysis.get("coin_detected", False),
            "coin_type": analysis.get("coin_type"),
            "foods": matched_foods,
            "notes": analysis.get("notes", "")
        }
    except Exception as e:
        logger.error(f"Error logging photo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/meals/log", response_model=MealLog)
async def log_meal(meal_data: MealLogCreate, uid: str = Depends(get_current_uid)):
    """Log a meal manually or save photo analysis result"""
    try:
        _require_user_match(uid, meal_data.user_id)
        # Calculate totals
        total_calories = sum([f["calories"] for f in meal_data.foods])
        total_protein = sum([f["protein"] for f in meal_data.foods])
        total_carbs = sum([f["carbs"] for f in meal_data.foods])
        total_fat = sum([f["fat"] for f in meal_data.foods])
        
        meal_dict = meal_data.dict()
        meal_dict.update({
            "total_calories": total_calories,
            "total_protein": total_protein,
            "total_carbs": total_carbs,
            "total_fat": total_fat
        })
        
        meal_log = MealLog(**meal_dict)

        pool = _require_pool()
        async with pool.acquire() as conn:
            # Ensure user exists (foreign key depends on it)
            profile_exists = await conn.fetchval("SELECT 1 FROM profiles WHERE id = $1", _uuid(meal_data.user_id))
            if not profile_exists:
                raise HTTPException(status_code=404, detail="User not found")

            row = await conn.fetchrow(
                """
                INSERT INTO meals (
                    id, user_id, meal_type, foods,
                    total_calories, total_protein, total_carbs, total_fat,
                    image_base64, logging_method, notes, timestamp
                ) VALUES (
                    $1,$2,$3,$4::jsonb,
                    $5,$6,$7,$8,
                    $9,$10,$11,$12
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
            )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to log meal")
        return MealLog(**_meal_from_record(row))
    except Exception as e:
        logger.error(f"Error logging meal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/meals/log-voice")
async def log_meal_voice(request: VoiceLogRequest, uid: str = Depends(get_current_uid)):
    """Parse voice input and log meal"""
    try:
        _require_user_match(uid, request.user_id)
        if openai_client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        response = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a nutrition assistant. Parse meal descriptions into structured JSON. Always respond with valid JSON only.",
                },
                {
                    "role": "user",
                    "content": f"""Parse this meal description into structured data:
            "{request.text}"
            
            Return ONLY a JSON response (no markdown, no explanation) with this format:
            {{
                "foods": [
                    {{
                        "name": "Food name",
                        "estimated_quantity_grams": 150
                    }}
                ]
            }}
            
            Focus on Indian cuisine. Estimate quantities if not specified.""",
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content if response.choices else ""
        extracted = _extract_json_from_text(content)

        result = json.loads(extracted)
        
        # Match foods to database
        matched_foods = []
        for food in result.get("foods", []):
            matched = match_food_to_database(food["name"], food["estimated_quantity_grams"])
            matched_foods.append(matched)
        
        return {"foods": matched_foods}
    except Exception as e:
        logger.error(f"Error parsing voice input: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/meals/history/{user_id}")
async def get_meal_history(user_id: str, days: int = 7, uid: str = Depends(get_current_uid)):
    """Get meal history for user"""
    _require_user_match(uid, user_id)
    if days < 1 or days > 3650:
        raise HTTPException(status_code=400, detail="Invalid days")

    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM meals
            WHERE user_id = $1
              AND timestamp >= (now() - make_interval(days => $2::int))
            ORDER BY timestamp DESC
            LIMIT 1000
            """,
            _uuid(user_id),
            int(days),
        )

    meals = [_meal_from_record(r) for r in rows]
    return {"meals": meals, "count": len(meals)}

@api_router.get("/meals/stats/{user_id}")
async def get_daily_stats(user_id: str, date: str = None, uid: str = Depends(get_current_uid)):
    """Get nutrition stats for a specific day"""
    _require_user_match(uid, user_id)
    try:
        if date:
            target_date = datetime.fromisoformat(date)
        else:
            target_date = datetime.utcnow()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date")

    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

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

    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

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
                {
                    "role": "user",
                    "content": prompt,
                },
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