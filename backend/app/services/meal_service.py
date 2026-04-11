"""
Meal service for meal logging and management.
Handles meal creation, retrieval, and micronutrient computation.
"""

import json
import logging
import uuid as uuid_lib
from datetime import datetime, date, timedelta, timezone
from typing import Dict, Any, List, Optional
import asyncpg
from fastapi import HTTPException

from app.utils.micronutrients import create_empty_micros, compute_meal_micros
from app.db.queries import to_uuid, meal_from_record

logger = logging.getLogger(__name__)


class MealService:
    """Service for managing meal logging and retrieval."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def log_meal(
        self,
        user_id: str,
        meal_type: str,
        foods: List[Dict[str, Any]],
        image_base64: Optional[str],
        logging_method: str,
        notes: Optional[str],
        timestamp: Optional[datetime] = None,
        review_status: str = "finalized"
    ) -> Dict[str, Any]:
        """
        Log a meal with foods and compute micronutrients.
        
        Args:
            user_id: User UUID
            meal_type: Type of meal (breakfast, lunch, dinner, snack)
            foods: List of food items with nutrition data
            image_base64: Optional base64 encoded image
            logging_method: How the meal was logged (photo, manual, etc)
            notes: Optional notes about the meal
            timestamp: Optional timestamp (defaults to now)
            review_status: Review status (finalized or pending_review)
        
        Returns:
            Logged meal dictionary
        """
        try:
            logger.info(f"[LOG_MEAL] Starting meal log for user {user_id}")

            try:
                foods_preview = [
                    {
                        "name": f.get("name"),
                        "food_id": f.get("food_id") or f.get("id"),
                        "quantity": f.get("quantity"),
                        "displayQuantity": f.get("displayQuantity"),
                        "displayUnit": f.get("displayUnit"),
                        "calories": f.get("calories"),
                        "calories_per_100g": f.get("calories_per_100g"),
                    }
                    for f in (foods or [])[:5]
                ]
                logger.info(
                    "[LOG_MEAL] Foods payload preview: %s",
                    json.dumps({"foods_count": len(foods or []), "foods_preview": foods_preview}, default=str),
                )
            except Exception as e:
                logger.warning(f"[LOG_MEAL] Failed to log foods payload preview: {type(e).__name__}: {str(e)}")

            normalized_foods: List[Dict[str, Any]] = []
            for f in foods or []:
                if not isinstance(f, dict):
                    continue

                # Keep the same structure, but ensure numeric fields exist.
                nf = dict(f)

                # Normalize food_id
                if not nf.get("food_id") and nf.get("id"):
                    nf["food_id"] = nf.get("id")

                # Normalize quantity in grams
                qty_raw = nf.get("quantity")
                if qty_raw is None:
                    qty_raw = nf.get("displayQuantity")

                try:
                    qty = float(qty_raw) if qty_raw is not None else 0.0
                except Exception:
                    qty = 0.0

                # If unit is oz, convert to grams
                unit = (nf.get("displayUnit") or nf.get("unit") or "g")
                unit = str(unit).strip().lower() if unit is not None else "g"
                grams = qty * 28.3495 if unit == "oz" else qty
                nf["quantity"] = grams

                # Persist a consistent unit in stored JSON
                nf["displayUnit"] = "g"
                nf["unit"] = "g"

                # Keep displayQuantity aligned with normalized grams if the client omitted it or used oz
                if nf.get("displayQuantity") is None or unit == "oz":
                    nf["displayQuantity"] = grams

                # Compute totals from per-100g macros if totals are missing
                ratio = grams / 100.0 if grams else 0.0
                for key in ("calories", "protein", "carbs", "fat"):
                    if nf.get(key) is None:
                        per100_key = f"{key}_per_100g"
                        per100 = nf.get(per100_key)
                        try:
                            nf[key] = round(float(per100 or 0) * ratio, 2)
                        except Exception:
                            nf[key] = 0.0

                normalized_foods.append(nf)

            foods = normalized_foods
            
            # Calculate totals from foods
            total_calories = sum([f.get("calories", 0) for f in foods])
            total_protein = sum([f.get("protein", 0) for f in foods])
            total_carbs = sum([f.get("carbs", 0) for f in foods])
            total_fat = sum([f.get("fat", 0) for f in foods])
            
            logger.info(f"[LOG_MEAL] Totals: cal={total_calories}, p={total_protein}, c={total_carbs}, f={total_fat}")
            
            # Track foods with missing data for logging
            foods_for_micros = []
            missing_food_id_count = 0
            missing_quantity_count = 0
            
            for f in foods:
                food_id = f.get("food_id")
                quantity = f.get("quantity") or f.get("displayQuantity")
                
                if not food_id:
                    missing_food_id_count += 1
                if not quantity:
                    missing_quantity_count += 1
                
                if food_id and quantity:
                    foods_for_micros.append(f)
            
            if missing_food_id_count:
                logger.info(f"[LOG_MEAL] {missing_food_id_count}/{len(foods)} foods missing food_id; micros may be partial")
            if missing_quantity_count:
                logger.info(f"[LOG_MEAL] {missing_quantity_count}/{len(foods)} foods missing quantity; micros may be partial")
            
            async with self.pool.acquire() as conn:
                # Verify user exists
                profile_exists = await conn.fetchval(
                    "SELECT 1 FROM profiles WHERE id = $1",
                    to_uuid(user_id),
                )
                logger.info(f"[LOG_MEAL] Profile check: exists={profile_exists}")
                
                if not profile_exists:
                    raise HTTPException(status_code=404, detail="User not found")
                
                # Compute micronutrients using foods table
                micros = create_empty_micros()
                if foods_for_micros:
                    food_ids: List[uuid_lib.UUID] = []
                    for f in foods_for_micros:
                        try:
                            food_ids.append(uuid_lib.UUID(str(f["food_id"])))
                        except Exception as e:
                            logger.warning(f"[LOG_MEAL] Invalid food_id: {f.get('food_id')}, error: {e}")
                            continue
                    
                    if food_ids:
                        logger.info(f"[LOG_MEAL] Fetching {len(food_ids)} foods for micro computation")
                        food_rows = await conn.fetch(
                            """
                            SELECT
                                id,
                                fiber_g_per_100g, sugar_g_per_100g,
                                saturated_fat_g_per_100g, trans_fat_g_per_100g,
                                cholesterol_mg_per_100g, sodium_mg_per_100g,
                                potassium_mg_per_100g, vitamin_a_ug_per_100g,
                                calcium_mg_per_100g, iron_mg_per_100g,
                                magnesium_mg_per_100g, phosphorus_mg_per_100g,
                                zinc_mg_per_100g, copper_mg_per_100g,
                                manganese_mg_per_100g, selenium_ug_per_100g,
                                vitamin_c_mg_per_100g, vitamin_d_ug_per_100g,
                                vitamin_e_mg_per_100g, vitamin_k_ug_per_100g,
                                thiamin_b1_mg_per_100g, riboflavin_b2_mg_per_100g,
                                niacin_b3_mg_per_100g, vitamin_b6_mg_per_100g,
                                folate_ug_per_100g, vitamin_b12_ug_per_100g,
                                caffeine_mg_per_100g, alcohol_g_per_100g
                            FROM foods
                            WHERE id = ANY($1::uuid[])
                            """,
                            food_ids,
                        )
                        
                        foods_by_id = {str(row["id"]): dict(row) for row in food_rows}
                        logger.info(f"[LOG_MEAL] Found {len(foods_by_id)} foods in DB")
                        
                        # Compute micros
                        meal_dict = {"foods": foods}
                        micros = compute_meal_micros(meal_dict, foods_by_id)
                        logger.info(f"[LOG_MEAL] Computed micros: {list(micros.keys())[:5]}...")
                
                # Create meal record
                meal_id = str(uuid_lib.uuid4())
                meal_timestamp = timestamp or datetime.utcnow()
                
                logger.info(f"[LOG_MEAL] Inserting meal with id={meal_id}")
                
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
                    to_uuid(meal_id),
                    to_uuid(user_id),
                    meal_type,
                    json.dumps(foods),
                    json.dumps(micros),
                    float(total_calories),
                    float(total_protein),
                    float(total_carbs),
                    float(total_fat),
                    image_base64,
                    logging_method,
                    notes,
                    meal_timestamp,
                    review_status,
                )
                
                # Update user daily activity
                await self._upsert_user_daily_activity(
                    conn,
                    user_id,
                    meal_timestamp.date(),
                    logged_food=True,
                    logged_at=meal_timestamp,
                )
                
                # Auto-approve pending foods if this meal is finalized
                if review_status == "finalized" and foods_for_micros:
                    await self._auto_approve_pending_foods(conn, [f["food_id"] for f in foods_for_micros])
                
                if not row:
                    logger.error(f"[LOG_MEAL] Failed to insert meal - no row returned")
                    raise HTTPException(status_code=500, detail="Failed to log meal")
                
                logger.info(f"[LOG_MEAL] Successfully logged meal, returning response")
                return meal_from_record(row)
        
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[LOG_MEAL] Unexpected error: {type(e).__name__}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_meal_history(
        self,
        user_id: str,
        days: int = 7,
        timezone_offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get meal history for a user.
        
        Args:
            user_id: User UUID
            days: Number of days to fetch
            timezone_offset: Timezone offset in minutes
        
        Returns:
            List of meals with computed micronutrients
        """
        async with self.pool.acquire() as conn:
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
            
            # Compute micronutrients for meals
            await self._compute_meal_micronutrients(conn, meals)
            
            return meals
    
    async def get_daily_summary(
        self,
        user_id: str,
        target_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Get daily nutrition summary for a specific date.
        
        Args:
            user_id: User UUID
            target_date: Date to get summary for (defaults to today)
        
        Returns:
            Daily summary with totals and targets
        """
        if target_date is None:
            target_date = date.today()
        
        start_of_day = datetime.combine(target_date, datetime.min.time())
        end_of_day = datetime.combine(target_date, datetime.max.time())
        
        async with self.pool.acquire() as conn:
            # Get meal totals
            stats = await conn.fetchrow(
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
            
            # Get user targets
            user_row = await conn.fetchrow(
                """
                SELECT daily_calorie_target, protein_target, carbs_target, fat_target
                FROM profiles
                WHERE id = $1
                """,
                to_uuid(user_id),
            )
        
        # Default targets if user not found
        if not user_row:
            user_row = {
                "daily_calorie_target": 2000,
                "protein_target": 120,
                "carbs_target": 250,
                "fat_target": 70,
            }
        
        return {
            "date": target_date.isoformat(),
            "meals_logged": stats["meals_logged"],
            "totals": {
                "calories": float(stats["total_calories"]),
                "protein": float(stats["total_protein"]),
                "carbs": float(stats["total_carbs"]),
                "fat": float(stats["total_fat"]),
            },
            "targets": {
                "calories": float(user_row["daily_calorie_target"]),
                "protein": float(user_row["protein_target"]),
                "carbs": float(user_row["carbs_target"]),
                "fat": float(user_row["fat_target"]),
            },
        }

    async def get_daily_stats(
        self,
        user_id: str,
        date_str: Optional[str] = None,
        timezone_offset: int = 0,
    ) -> Dict[str, Any]:
        utc_now = datetime.now(timezone.utc)
        user_now = utc_now + timedelta(minutes=int(timezone_offset or 0))

        target_dt = user_now
        try:
            if date_str:
                ds = date_str.strip()
                if ds.endswith("Z"):
                    ds = ds[:-1] + "+00:00"
                target_dt = datetime.fromisoformat(ds)
                if target_dt.tzinfo is None:
                    target_dt = target_dt.replace(tzinfo=timezone.utc) + timedelta(minutes=int(timezone_offset or 0))
                else:
                    target_dt = target_dt.astimezone(timezone.utc)
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid date")

        start_of_day_user = target_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day_user = target_dt.replace(hour=23, minute=59, second=59, microsecond=999999)

        start_of_day = start_of_day_user - timedelta(minutes=int(timezone_offset or 0))
        end_of_day = end_of_day_user - timedelta(minutes=int(timezone_offset or 0))

        async with self.pool.acquire() as conn:
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

        if not user_row:
            user_row = {
                "daily_calorie_target": 2000,
                "protein_target": 120,
                "carbs_target": 250,
                "fat_target": 70,
            }

        return {
            "date": target_dt.isoformat(),
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
    
    async def delete_meal(self, meal_id: str, user_id: str) -> Dict[str, str]:
        """
        Delete a meal.
        
        Args:
            meal_id: Meal UUID
            user_id: User UUID (for ownership verification)
        
        Returns:
            Success message
        """
        async with self.pool.acquire() as conn:
            # Verify ownership
            owner = await conn.fetchval(
                "SELECT user_id FROM meals WHERE id = $1",
                to_uuid(meal_id)
            )
            
            if not owner:
                raise HTTPException(status_code=404, detail="Meal not found")
            
            if str(owner) != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to delete this meal")
            
            # Delete meal
            await conn.execute(
                "DELETE FROM meals WHERE id = $1",
                to_uuid(meal_id)
            )
        
        return {"message": "Meal deleted successfully"}
    
    async def _compute_meal_micronutrients(
        self,
        conn: asyncpg.Connection,
        meals: List[Dict[str, Any]]
    ) -> None:
        """
        Compute micronutrients for a list of meals in place.
        
        Args:
            conn: Database connection
            meals: List of meal dictionaries (modified in place)
        """
        # Collect all food IDs
        food_ids: List[uuid_lib.UUID] = []
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
                    food_ids.append(uuid_lib.UUID(str(fid)))
                except Exception:
                    continue
        
        # Fetch food data
        foods_by_id: Dict[str, Dict] = {}
        if food_ids:
            food_rows = await conn.fetch(
                """
                SELECT
                    id,
                    fiber_g_per_100g, sugar_g_per_100g,
                    saturated_fat_g_per_100g, trans_fat_g_per_100g,
                    cholesterol_mg_per_100g, sodium_mg_per_100g,
                    potassium_mg_per_100g, vitamin_a_ug_per_100g,
                    calcium_mg_per_100g, iron_mg_per_100g,
                    magnesium_mg_per_100g, phosphorus_mg_per_100g,
                    zinc_mg_per_100g, copper_mg_per_100g,
                    manganese_mg_per_100g, selenium_ug_per_100g,
                    vitamin_c_mg_per_100g, vitamin_d_ug_per_100g,
                    vitamin_e_mg_per_100g, vitamin_k_ug_per_100g,
                    thiamin_b1_mg_per_100g, riboflavin_b2_mg_per_100g,
                    niacin_b3_mg_per_100g, vitamin_b6_mg_per_100g,
                    folate_ug_per_100g, vitamin_b12_ug_per_100g,
                    caffeine_mg_per_100g, alcohol_g_per_100g
                FROM foods
                WHERE id = ANY($1::uuid[])
                """,
                list({*food_ids}),
            )
            for fr in food_rows:
                foods_by_id[str(fr["id"])] = dict(fr)
        
        # Compute micros for each meal
        for m in meals:
            m["micros"] = compute_meal_micros(m, foods_by_id)
    
    async def _upsert_user_daily_activity(
        self,
        conn: asyncpg.Connection,
        user_id: str,
        activity_date: date,
        *,
        was_active: bool = False,
        logged_food: bool = False,
        active_at: Optional[datetime] = None,
        logged_at: Optional[datetime] = None,
    ) -> None:
        """
        Update user daily activity tracking.
        
        Args:
            conn: Database connection
            user_id: User UUID
            activity_date: Date of activity
            was_active: Whether user was active
            logged_food: Whether user logged food
            active_at: Timestamp of activity
            logged_at: Timestamp of food logging
        """
        await conn.execute(
            """
            INSERT INTO user_daily_activity (
                user_id, activity_date, was_active, logged_food,
                last_active_at, last_logged_food_at, updated_at
            )
            VALUES (
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
    
    async def _auto_approve_pending_foods(
        self,
        conn: asyncpg.Connection,
        food_ids: List[str]
    ) -> None:
        """
        Auto-approve pending foods that have been used in finalized meals.
        
        Args:
            conn: Database connection
            food_ids: List of food IDs to potentially approve
        """
        if not food_ids:
            return
        
        try:
            food_uuids = [to_uuid(fid) for fid in food_ids]
            
            # Update pending foods to approved
            approved_count = await conn.fetchval(
                """
                UPDATE foods
                SET review_status = 'approved'
                WHERE id = ANY($1::uuid[])
                  AND review_status = 'pending_review'
                RETURNING COUNT(*)
                """,
                food_uuids,
            )
            
            # Mark queue items as ready
            ready_count = await conn.fetchval(
                """
                UPDATE foods_ingestion_queue
                SET status = 'ready'
                WHERE food_id = ANY($1::uuid[])
                  AND status = 'pending'
                RETURNING COUNT(*)
                """,
                food_uuids,
            )
            
            if approved_count or ready_count:
                logger.info(f"Auto-approved {approved_count} pending foods, marked {ready_count} queue items as ready")
        
        except Exception as e:
            logger.warning(f"Failed to auto-approve pending foods: {e}")
