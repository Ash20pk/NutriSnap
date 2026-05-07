"""
Food routes for food database and search.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.services.food_service import FoodService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid

router = APIRouter(prefix="/foods", tags=["foods"])


def get_food_service() -> FoodService:
    """Dependency to get food service instance."""
    pool = get_pool()
    return FoodService(pool)


# Pydantic models
class FoodLabelSubmissionRequest(BaseModel):
    user_id: str
    barcode: str
    image_base64: str
    notes: Optional[str] = None


class CustomFoodCreate(BaseModel):
    name: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    category: Optional[str] = "custom"
    fiber_g_per_100g: Optional[float] = 0.0
    sugar_g_per_100g: Optional[float] = 0.0
    sodium_mg_per_100g: Optional[float] = 0.0


@router.get("/search")
async def search_foods(
    query: str = Query(""),
    category: str = Query(""),
    vegetarian_only: bool = Query(False),
    service: FoodService = Depends(get_food_service)
):
    """
    Search foods from database.
    
    Args:
        query: Search query string
        category: Filter by category
        vegetarian_only: Filter for vegetarian foods only
        service: Food service instance
    
    Returns:
        Dictionary with foods list and count
    """
    return await service.search_foods(query, category, vegetarian_only)


@router.get("/categories")
async def get_categories(
    service: FoodService = Depends(get_food_service)
):
    """
    Get all food categories.
    
    Args:
        service: Food service instance
    
    Returns:
        Dictionary with categories list
    """
    return await service.get_categories()


@router.get("/barcode/{barcode}")
async def get_food_by_barcode(
    barcode: str,
    background_tasks: BackgroundTasks,
    include_health_check: bool = Query(False),
    uid: str = Depends(get_current_uid),
    service: FoodService = Depends(get_food_service)
):
    result = await service.get_food_by_barcode(barcode, uid, include_health_check=include_health_check)

    health_check = result.pop("health_check", None)
    source = result.get("source", "")
    cached = source in ("cache", "database")

    # If sourced from OpenFood Facts, check completeness before caching
    if source == "openfoodfacts":
        calories = result.get("calories_per_100g") or 0
        protein  = result.get("protein_per_100g")  or 0
        carbs    = result.get("carbs_per_100g")    or 0
        fat      = result.get("fat_per_100g")      or 0
        has_nutrition   = any(v > 0 for v in [calories, protein, carbs, fat])
        has_ingredients = bool(result.get("ingredients"))

        if not has_nutrition or not has_ingredients:
            # Incomplete — ask user to contribute, do NOT cache partial data
            return {
                "food": result,
                "cached": False,
                "needs_contribution": True,
                "health_check": None,
            }

        # Only cache when data is complete
        background_tasks.add_task(service._cache_barcode, barcode, result)

    return {
        "food": result,
        "cached": cached,
        "needs_contribution": False,
        "health_check": health_check,
    }


@router.get("/{food_id}")
async def get_food_by_id(
    food_id: str,
    service: FoodService = Depends(get_food_service)
):
    """
    Get detailed food information by ID.
    
    Args:
        food_id: Food UUID
        service: Food service instance
    
    Returns:
        Complete food data dictionary
    """
    return await service.get_food_by_id(food_id)


@router.post("/label-submissions")
async def submit_food_label(
    payload: FoodLabelSubmissionRequest,
    uid: str = Depends(get_current_uid),
    service: FoodService = Depends(get_food_service)
):
    """
    Submit a food label for manual review.
    
    Args:
        payload: Label submission data
        uid: Current user ID (from auth)
        service: Food service instance
    
    Returns:
        Dictionary with submission ID and status
    """
    return await service.submit_food_label(
        user_id=payload.user_id,
        barcode=payload.barcode,
        image_base64=payload.image_base64,
        notes=payload.notes
    )


@router.post("/custom")
async def create_custom_food(
    payload: CustomFoodCreate,
    uid: str = Depends(get_current_uid),
    service: FoodService = Depends(get_food_service)
):
    """
    Create a custom food entry.
    
    Args:
        payload: Custom food data
        uid: Current user ID (from auth)
        service: Food service instance
    
    Returns:
        Created food data
    """
    return await service.create_custom_food(
        user_id=uid,
        name=payload.name,
        calories_per_100g=payload.calories_per_100g,
        protein_per_100g=payload.protein_per_100g,
        carbs_per_100g=payload.carbs_per_100g,
        fat_per_100g=payload.fat_per_100g,
        category=payload.category,
        fiber_g_per_100g=payload.fiber_g_per_100g,
        sugar_g_per_100g=payload.sugar_g_per_100g,
        sodium_mg_per_100g=payload.sodium_mg_per_100g,
    )


@router.get("/custom/me")
async def get_user_custom_foods(
    uid: str = Depends(get_current_uid),
    service: FoodService = Depends(get_food_service)
):
    """
    Get all custom foods created by the current user.
    
    Args:
        uid: Current user ID (from auth)
        service: Food service instance
    
    Returns:
        Dictionary with custom foods list
    """
    return await service.get_user_custom_foods(uid)
