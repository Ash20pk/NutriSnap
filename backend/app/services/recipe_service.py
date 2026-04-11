"""
Recipe service for saved recipes management.
Handles saving, retrieving, and managing user recipes.
"""

import json
import logging
from typing import Dict, Any, List
import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class RecipeService:
    """Service for managing saved recipes."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def save_recipe(
        self,
        user_id: str,
        recipe_data: Dict[str, Any],
        source: str = "chef"
    ) -> Dict[str, Any]:
        """
        Save a recipe for later use.
        
        Args:
            user_id: User UUID
            recipe_data: Recipe data dictionary
            source: Source of the recipe (chef, web, etc.)
        
        Returns:
            Dictionary with recipe ID and creation timestamp
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO saved_recipes (user_id, recipe_data, source)
                VALUES ($1, $2, $3)
                RETURNING id, created_at
                """,
                to_uuid(user_id),
                json.dumps(recipe_data),
                source,
            )
            return {
                "id": str(row["id"]),
                "created_at": row["created_at"].isoformat(),
                "message": "Recipe saved successfully"
            }
    
    async def get_saved_recipes(self, user_id: str) -> Dict[str, Any]:
        """
        Get all saved recipes for a user.
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with recipes list and count
        """
        async with self.pool.acquire() as conn:
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
    
    async def delete_recipe(self, recipe_id: str, user_id: str) -> Dict[str, str]:
        """
        Delete a saved recipe.
        
        Args:
            recipe_id: Recipe UUID
            user_id: User UUID (for ownership verification)
        
        Returns:
            Success message
        """
        async with self.pool.acquire() as conn:
            # Verify ownership
            owner = await conn.fetchval(
                "SELECT user_id FROM saved_recipes WHERE id = $1",
                to_uuid(recipe_id)
            )
            if not owner:
                raise HTTPException(status_code=404, detail="Recipe not found")
            if str(owner) != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to delete this recipe")
            
            await conn.execute("DELETE FROM saved_recipes WHERE id = $1", to_uuid(recipe_id))
            return {"message": "Recipe deleted"}
    
    async def toggle_favorite(self, recipe_id: str, user_id: str) -> Dict[str, bool]:
        """
        Toggle favorite status of a saved recipe.
        
        Args:
            recipe_id: Recipe UUID
            user_id: User UUID (for ownership verification)
        
        Returns:
            Dictionary with new favorite status
        """
        async with self.pool.acquire() as conn:
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
            if str(row["user_id"]) != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to modify this recipe")
            
            return {"is_favorite": row["is_favorite"]}
    
    async def increment_times_cooked(self, recipe_id: str, user_id: str) -> Dict[str, int]:
        """
        Increment the times_cooked counter for a recipe.
        
        Args:
            recipe_id: Recipe UUID
            user_id: User UUID (for ownership verification)
        
        Returns:
            Dictionary with updated times_cooked count
        """
        async with self.pool.acquire() as conn:
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
            if str(row["user_id"]) != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to modify this recipe")
            
            return {"times_cooked": row["times_cooked"]}
