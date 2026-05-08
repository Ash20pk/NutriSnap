"""
Meal routes for meal logging, history, and daily summaries.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date

from app.services.meal_service import MealService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/meals", tags=["meals"])


def get_meal_service() -> MealService:
    """Dependency to get meal service instance."""
    pool = get_pool()
    return MealService(pool)


# Pydantic models for request/response
class FoodItem(BaseModel):
    food_id: Optional[str] = None
    id: Optional[str] = None
    name: str
    calories: Optional[float] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    quantity: Optional[float] = None
    displayQuantity: Optional[float] = None
    displayUnit: Optional[str] = None
    unit: Optional[str] = None

    model_config = {"extra": "allow"}


class MealLogCreate(BaseModel):
    user_id: str
    meal_type: str
    foods: List[FoodItem]
    image_base64: Optional[str] = None
    logging_method: str
    notes: Optional[str] = None
    timestamp: Optional[datetime] = None
    review_status: Optional[str] = "finalized"


@router.post("/log")
async def log_meal(
    meal_data: MealLogCreate,
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """
    Log a meal with foods and compute micronutrients.
    
    Args:
        meal_data: Meal data including foods, type, image, etc.
        uid: Current user ID (from auth)
        service: Meal service instance
    
    Returns:
        Logged meal with computed micronutrients
    """
    require_user_match(uid, meal_data.user_id)
    
    # Convert Pydantic models to dicts
    foods = [f.model_dump() for f in meal_data.foods]
    
    return await service.log_meal(
        user_id=meal_data.user_id,
        meal_type=meal_data.meal_type,
        foods=foods,
        image_base64=meal_data.image_base64,
        logging_method=meal_data.logging_method,
        notes=meal_data.notes,
        timestamp=meal_data.timestamp,
        review_status=meal_data.review_status or "finalized"
    )


@router.get("/{user_id}/history")
async def get_meal_history(
    user_id: str,
    days: int = Query(7, ge=1, le=365),
    timezone_offset: int = Query(0),
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """
    Get meal history for a user.
    
    Args:
        user_id: User UUID
        days: Number of days to fetch
        timezone_offset: Timezone offset in minutes
        uid: Current user ID (from auth)
        service: Meal service instance
    
    Returns:
        List of meals with computed micronutrients
    """
    require_user_match(uid, user_id)
    meals = await service.get_meal_history(user_id, days, timezone_offset)
    return {"meals": meals}


@router.get("/history/{user_id}")
async def get_meal_history_legacy(
    user_id: str,
    days: int = Query(7, ge=1, le=365),
    timezone_offset: int = Query(0),
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """
    Backwards-compatible meal history route.

    Legacy clients call: GET /api/meals/history/{user_id}
    Modular route is:   GET /api/meals/{user_id}/history
    """
    require_user_match(uid, user_id)
    meals = await service.get_meal_history(user_id, days, timezone_offset)
    return {"meals": meals}


@router.get("/{user_id}/daily-summary")
async def get_daily_summary(
    user_id: str,
    target_date: Optional[str] = Query(None),
    timezone_offset: int = Query(0),
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """
    Get daily nutrition summary for a specific date.
    
    Args:
        user_id: User UUID
        target_date: Date in YYYY-MM-DD format (defaults to today in user's tz)
        timezone_offset: Timezone offset in minutes (e.g. +330 for IST)
        uid: Current user ID (from auth)
        service: Meal service instance
    
    Returns:
        Daily summary with totals and targets
    """
    require_user_match(uid, user_id)
    
    parsed_date = None
    if target_date:
        parsed_date = date.fromisoformat(target_date)
    
    return await service.get_daily_summary(user_id, parsed_date, timezone_offset)


@router.get("/stats/{user_id}")
async def get_daily_stats(
    user_id: str,
    date: Optional[str] = Query(None),
    timezone_offset: int = Query(0),
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """Get nutrition stats for a specific day in user's local timezone."""
    require_user_match(uid, user_id)
    return await service.get_daily_stats(user_id=user_id, date_str=date, timezone_offset=timezone_offset)


class MealUpdate(BaseModel):
    meal_type: Optional[str] = None
    foods: Optional[List[FoodItem]] = None
    notes: Optional[str] = None


@router.put("/{meal_id}")
async def update_meal(
    meal_id: str,
    meal_data: MealUpdate,
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """
    Update a meal's type, foods, and/or notes. Only the owner may update.

    Args:
        meal_id: Meal UUID
        meal_data: Fields to update (all optional)
        uid: Current user ID (from auth)
        service: Meal service instance

    Returns:
        Updated meal
    """
    foods = [f.model_dump() for f in meal_data.foods] if meal_data.foods is not None else None
    return await service.update_meal(
        meal_id=meal_id,
        user_id=uid,
        meal_type=meal_data.meal_type,
        foods=foods,
        notes=meal_data.notes,
    )


@router.delete("/{meal_id}")
async def delete_meal(
    meal_id: str,
    uid: str = Depends(get_current_uid),
    service: MealService = Depends(get_meal_service)
):
    """
    Delete a meal.
    
    Args:
        meal_id: Meal UUID
        uid: Current user ID (from auth)
        service: Meal service instance
    
    Returns:
        Success message
    """
    return await service.delete_meal(meal_id, uid)
