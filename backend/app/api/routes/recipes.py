"""
Recipe routes for saved recipes management.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Dict, Any

from app.services.recipe_service import RecipeService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/recipes", tags=["recipes"])


def get_recipe_service() -> RecipeService:
    """Dependency to get recipe service instance."""
    pool = get_pool()
    return RecipeService(pool)


# Pydantic models
class SaveRecipeRequest(BaseModel):
    user_id: str
    recipe_data: Dict[str, Any]
    source: str = "chef"


@router.post("/save")
async def save_recipe(
    request: SaveRecipeRequest,
    uid: str = Depends(get_current_uid),
    service: RecipeService = Depends(get_recipe_service)
):
    """
    Save a recipe for later use.
    
    Args:
        request: Recipe save request data
        uid: Current user ID (from auth)
        service: Recipe service instance
    
    Returns:
        Dictionary with recipe ID and creation timestamp
    """
    require_user_match(uid, request.user_id)
    return await service.save_recipe(
        user_id=request.user_id,
        recipe_data=request.recipe_data,
        source=request.source
    )


@router.get("/saved/{user_id}")
async def get_saved_recipes(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: RecipeService = Depends(get_recipe_service)
):
    """
    Get all saved recipes for a user.
    
    Args:
        user_id: User UUID
        uid: Current user ID (from auth)
        service: Recipe service instance
    
    Returns:
        Dictionary with recipes list and count
    """
    require_user_match(uid, user_id)
    return await service.get_saved_recipes(user_id)


@router.delete("/{recipe_id}")
async def delete_saved_recipe(
    recipe_id: str,
    uid: str = Depends(get_current_uid),
    service: RecipeService = Depends(get_recipe_service)
):
    """
    Delete a saved recipe.
    
    Args:
        recipe_id: Recipe UUID
        uid: Current user ID (from auth)
        service: Recipe service instance
    
    Returns:
        Success message
    """
    return await service.delete_recipe(recipe_id, uid)


@router.put("/{recipe_id}/favorite")
async def toggle_recipe_favorite(
    recipe_id: str,
    uid: str = Depends(get_current_uid),
    service: RecipeService = Depends(get_recipe_service)
):
    """
    Toggle favorite status of a saved recipe.
    
    Args:
        recipe_id: Recipe UUID
        uid: Current user ID (from auth)
        service: Recipe service instance
    
    Returns:
        Dictionary with new favorite status
    """
    return await service.toggle_favorite(recipe_id, uid)


@router.put("/{recipe_id}/cooked")
async def increment_times_cooked(
    recipe_id: str,
    uid: str = Depends(get_current_uid),
    service: RecipeService = Depends(get_recipe_service)
):
    """
    Increment the times_cooked counter for a recipe.
    
    Args:
        recipe_id: Recipe UUID
        uid: Current user ID (from auth)
        service: Recipe service instance
    
    Returns:
        Dictionary with updated times_cooked count
    """
    return await service.increment_times_cooked(recipe_id, uid)
