from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import base64
from openai import OpenAI
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI client
openai_client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

async def analyze_food_image(image_base64: str) -> Dict[str, Any]:
    """Analyze food image using OpenAI Vision API"""
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """You are a nutrition expert analyzing food images. 
                            Identify all food items in the image and estimate their quantities.
                            Look for a coin in the image for scale reference (Indian coins: ₹1=16mm, ₹2=25mm, ₹5=23mm, ₹10=27mm).
                            
                            Return a JSON response with this format:
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
                            
                            Focus on Indian cuisine if applicable."""
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000
        )
        
        content = response.choices[0].message.content
        # Extract JSON from response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        result = json.loads(content)
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
async def onboard_user(user_data: UserProfileCreate):
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
        user_profile = UserProfile(**user_dict)
        
        # Save to database
        await db.users.insert_one(user_profile.dict())
        
        return user_profile
    except Exception as e:
        logger.error(f"Error onboarding user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/user/{user_id}", response_model=UserProfile)
async def get_user(user_id: str):
    """Get user profile"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**user)

@api_router.put("/user/{user_id}/goals")
async def update_goals(user_id: str, goal: str, activity_level: str):
    """Update user goals and recalculate targets"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Recalculate targets
    targets = calculate_calorie_target(
        user["weight"],
        user["height"],
        user["age"],
        user["gender"],
        activity_level,
        goal
    )
    
    # Update database
    await db.users.update_one(
        {"id": user_id},
        {"$set": {**targets, "goal": goal, "activity_level": activity_level}}
    )
    
    return {"message": "Goals updated successfully", "targets": targets}

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
async def log_meal_photo(request: PhotoAnalysisRequest):
    """Log meal from photo using AI analysis"""
    try:
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
async def log_meal(meal_data: MealLogCreate):
    """Log a meal manually or save photo analysis result"""
    try:
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
        
        # Save to database
        await db.meals.insert_one(meal_log.dict())
        
        return meal_log
    except Exception as e:
        logger.error(f"Error logging meal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/meals/log-voice")
async def log_meal_voice(request: VoiceLogRequest):
    """Parse voice input and log meal"""
    try:
        # Use OpenAI to parse voice input
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": f"""Parse this meal description into structured data:
                    "{request.text}"
                    
                    Return JSON with this format:
                    {{
                        "foods": [
                            {{
                                "name": "Food name",
                                "estimated_quantity_grams": 150
                            }}
                        ]
                    }}
                    
                    Focus on Indian cuisine. Estimate quantities if not specified."""
                }
            ],
            max_tokens=500
        )
        
        content = response.choices[0].message.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        result = json.loads(content)
        
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
async def get_meal_history(user_id: str, days: int = 7):
    """Get meal history for user"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    meals = await db.meals.find({
        "user_id": user_id,
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", -1).to_list(1000)
    
    return {"meals": meals, "count": len(meals)}

@api_router.get("/meals/stats/{user_id}")
async def get_daily_stats(user_id: str, date: str = None):
    """Get nutrition stats for a specific day"""
    if date:
        target_date = datetime.fromisoformat(date)
    else:
        target_date = datetime.utcnow()
    
    # Get meals for the day
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    meals = await db.meals.find({
        "user_id": user_id,
        "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
    }).to_list(1000)
    
    # Calculate totals
    total_calories = sum([m["total_calories"] for m in meals])
    total_protein = sum([m["total_protein"] for m in meals])
    total_carbs = sum([m["total_carbs"] for m in meals])
    total_fat = sum([m["total_fat"] for m in meals])
    
    # Get user targets
    user = await db.users.find_one({"id": user_id})
    
    return {
        "date": target_date.isoformat(),
        "meals_logged": len(meals),
        "total_calories": round(total_calories, 2),
        "total_protein": round(total_protein, 2),
        "total_carbs": round(total_carbs, 2),
        "total_fat": round(total_fat, 2),
        "targets": {
            "calories": user.get("daily_calorie_target", 2000) if user else 2000,
            "protein": user.get("protein_target", 150) if user else 150,
            "carbs": user.get("carbs_target", 200) if user else 200,
            "fat": user.get("fat_target", 65) if user else 65
        }
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()