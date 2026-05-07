"""
Food service for food database management.
Handles food search, categories, barcode lookup, and USDA integration.
"""

import logging
from typing import Dict, Any, List, Optional
import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class FoodService:
    """Service for managing food database and search."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def search_foods(
        self,
        query: str = "",
        category: str = "",
        vegetarian_only: bool = False
    ) -> Dict[str, Any]:
        """
        Search foods from database.
        
        Args:
            query: Search query string
            category: Filter by category
            vegetarian_only: Filter for vegetarian foods only
        
        Returns:
            Dictionary with foods list and count
        """
        async with self.pool.acquire() as conn:
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
    
    async def get_categories(self) -> Dict[str, List[str]]:
        """
        Get all food categories.
        
        Returns:
            Dictionary with categories list
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT category FROM foods ORDER BY category ASC"
            )
        
        return {"categories": [str(r["category"]) for r in rows]}
    
    async def get_food_by_barcode(
        self,
        barcode: str,
        user_id: Optional[str] = None,
        include_health_check: bool = False,
    ) -> Dict[str, Any]:
        """
        Get food by barcode from database or external sources.

        Args:
            barcode: Product barcode
            user_id: Optional user ID for tracking
            include_health_check: Run AI health check and attach result

        Returns:
            Food data dictionary
        """
        async with self.pool.acquire() as conn:
            # First check our foods table
            food = await conn.fetchrow(
                """
                SELECT id, name, brand, barcode, category,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                       saturated_fat_g_per_100g, trans_fat_g_per_100g,
                       cholesterol_mg_per_100g, potassium_mg_per_100g,
                       source, verified, ingredients
                FROM foods
                WHERE barcode = $1
                LIMIT 1
                """,
                barcode
            )

            if food:
                result = dict(food)
                result["id"] = str(result["id"])
                result["source"] = "database"
                if include_health_check:
                    result["health_check"] = await self._run_health_check(result)
                return result

            # Check barcodes table (cached external data)
            cached = await conn.fetchrow(
                """
                SELECT barcode, product_name, brand, image_url,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                       ingredients, source, verified
                FROM barcodes
                WHERE barcode = $1
                LIMIT 1
                """,
                barcode
            )

            if cached:
                result = dict(cached)
                result["name"] = result.pop("product_name")
                result["source"] = "cache"
                if include_health_check:
                    result["health_check"] = await self._run_health_check(result)
                return result

        raise HTTPException(status_code=404, detail="Product not found")

    async def _run_health_check(self, food_data: Dict[str, Any]) -> Dict[str, Any]:
        """Delegate to LabelService health check."""
        from app.services.label_service import LabelService
        svc = LabelService(self.pool)
        return await svc._perform_health_check(food_data)
    
    async def submit_food_label(
        self,
        user_id: str,
        barcode: str,
        image_base64: str,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Submit a food label for manual review.
        
        Args:
            user_id: User UUID
            barcode: Product barcode
            image_base64: Base64 encoded label image
            notes: Optional notes from user
        
        Returns:
            Dictionary with submission ID and status
        """
        async with self.pool.acquire() as conn:
            submission_id = await conn.fetchval(
                """
                INSERT INTO food_label_submissions (
                    user_id, barcode, label_image_base64, notes, status
                )
                VALUES ($1, $2, $3, $4, 'pending')
                RETURNING id
                """,
                to_uuid(user_id),
                barcode,
                image_base64,
                notes,
            )
        
        return {
            "submission_id": str(submission_id),
            "status": "pending",
            "message": "Label submitted for review"
        }
    
    async def get_food_by_id(self, food_id: str) -> Dict[str, Any]:
        """
        Get detailed food information by ID.
        
        Args:
            food_id: Food UUID
        
        Returns:
            Complete food data dictionary
        """
        async with self.pool.acquire() as conn:
            food = await conn.fetchrow(
                """
                SELECT id, name, brand, barcode, category,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                       saturated_fat_g_per_100g, trans_fat_g_per_100g,
                       cholesterol_mg_per_100g, potassium_mg_per_100g,
                       vitamin_a_ug_per_100g, calcium_mg_per_100g, iron_mg_per_100g,
                       magnesium_mg_per_100g, phosphorus_mg_per_100g, zinc_mg_per_100g,
                       copper_mg_per_100g, manganese_mg_per_100g, selenium_ug_per_100g,
                       vitamin_c_mg_per_100g, vitamin_d_ug_per_100g, vitamin_e_mg_per_100g,
                       vitamin_k_ug_per_100g, thiamin_b1_mg_per_100g, riboflavin_b2_mg_per_100g,
                       niacin_b3_mg_per_100g, vitamin_b6_mg_per_100g, folate_ug_per_100g,
                       vitamin_b12_ug_per_100g, caffeine_mg_per_100g, alcohol_g_per_100g,
                       source, external_id, verified, is_vegetarian, ingredients,
                       created_at, updated_at
                FROM foods
                WHERE id = $1
                """,
                to_uuid(food_id)
            )
        
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")
        
        result = dict(food)
        result["id"] = str(result["id"])
        return result
    
    async def create_custom_food(
        self,
        user_id: str,
        name: str,
        calories_per_100g: float,
        protein_per_100g: float,
        carbs_per_100g: float,
        fat_per_100g: float,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Create a custom food entry.
        
        Args:
            user_id: User UUID
            name: Food name
            calories_per_100g: Calories per 100g
            protein_per_100g: Protein per 100g
            carbs_per_100g: Carbs per 100g
            fat_per_100g: Fat per 100g
            **kwargs: Additional optional nutrition fields
        
        Returns:
            Created food data
        """
        async with self.pool.acquire() as conn:
            food_id = await conn.fetchval(
                """
                INSERT INTO foods (
                    id, name, category,
                    calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                    fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                    source, created_by_user_id, verified, review_status
                )
                VALUES (
                    gen_random_uuid(), $1, $2,
                    $3, $4, $5, $6,
                    $7, $8, $9,
                    'user_custom', $10, false, 'approved'
                )
                RETURNING id
                """,
                name,
                kwargs.get("category", "custom"),
                float(calories_per_100g),
                float(protein_per_100g),
                float(carbs_per_100g),
                float(fat_per_100g),
                kwargs.get("fiber_g_per_100g", 0.0),
                kwargs.get("sugar_g_per_100g", 0.0),
                kwargs.get("sodium_mg_per_100g", 0.0),
                to_uuid(user_id),
            )
        
        return await self.get_food_by_id(str(food_id))
    
    async def get_user_custom_foods(self, user_id: str) -> Dict[str, Any]:
        """
        Get all custom foods created by a user.
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with custom foods list
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, name, category,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                       created_at
                FROM foods
                WHERE created_by_user_id = $1 AND source = 'user_custom'
                ORDER BY created_at DESC
                LIMIT 100
                """,
                to_uuid(user_id)
            )
        
        foods = []
        for r in rows:
            food = dict(r)
            food["id"] = str(food["id"])
            foods.append(food)
        
        return {"foods": foods, "count": len(foods)}
