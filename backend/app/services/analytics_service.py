"""
Analytics service for computing and caching nutrition analytics.
Handles AI-powered insights, micronutrient tracking, and analytics caching.
"""

import json
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import asyncpg

from analytics_ai import _generate_analytics_ai
from app.utils.nutrition_targets import compute_micronutrient_targets
from app.utils.micronutrients import compute_meal_micros
from app.db.queries import to_uuid, meal_from_record

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service for managing nutrition analytics and AI insights."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_analytics(
        self,
        user_id: str,
        time_range: str = "week",
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Get cached analytics for a user, or return empty if no meals.
        
        Args:
            user_id: User UUID
            time_range: "week", "month", or "year"
            force_refresh: Force refresh even if cache is valid
        
        Returns:
            Analytics dictionary with insights, bio_impact, health_insights, etc.
        """
        async with self.pool.acquire() as conn:
            # Check if user has meals in the requested range
            days = self._days_for_time_range(time_range)
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
                    "health_insights": {},
                    "bio_alerts": [],
                    "red_flags": [],
                    "cached": False,
                    "meals_analyzed": 0,
                }
            
            # Check for cached analytics
            cache = await conn.fetchrow(
                """
                SELECT insights, health_insights, bio_alerts, red_flags, meals_analyzed,
                       date_range_start, date_range_end, expires_at, last_refreshed_at,
                       tokens_used, refresh_count
                FROM analytics_cache
                WHERE user_id = $1 AND time_range = $2
                """,
                to_uuid(user_id),
                time_range,
            )

            # For daily time_range: only refresh if force_refresh=True
            # Otherwise return cached (even if expired) or empty, and let bundle provide non-AI highlights
            if time_range == "daily" and force_refresh:
                return await self.refresh_analytics(user_id=user_id, time_range=time_range, timezone_offset=0)
            
            # Return cached data if valid and not force refresh
            if cache and not force_refresh:
                expires_at = cache["expires_at"]
                if expires_at and expires_at > datetime.now(timezone.utc):
                    logger.info(f"Returning cached analytics for user {user_id}, time_range={time_range}")
                    parsed = self._parse_analytics_cache_fields(cache)
                    return {
                        **parsed,
                        "cached": True,
                        "meals_analyzed": cache["meals_analyzed"],
                        "date_range_start": cache["date_range_start"],
                        "date_range_end": cache["date_range_end"],
                        "expires_at": expires_at,
                        "last_refreshed_at": cache["last_refreshed_at"],
                        "tokens_used": cache["tokens_used"],
                        "refresh_count": cache["refresh_count"],
                    }
            
            # Return stale cache with trigger to refresh
            if cache:
                logger.info(f"Cache expired for user {user_id}, returning stale data")
                parsed = self._parse_analytics_cache_fields(cache)
                return {
                    **parsed,
                    "cached": True,
                    "stale": True,
                    "meals_analyzed": cache["meals_analyzed"],
                }
            
            # No cache exists
            return {
                "insights": {},
                "health_insights": {},
                "bio_alerts": [],
                "red_flags": [],
                "cached": False,
                "meals_analyzed": 0,
            }
    
    async def get_analytics_bundle(
        self,
        user_id: str,
        time_range: str = "week",
        timezone_offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get meals and analytics together in one call.
        
        Args:
            user_id: User UUID
            time_range: "week", "month", or "year"
            timezone_offset: Timezone offset in minutes
        
        Returns:
            Dictionary with meals and analytics
        """
        days = self._days_for_time_range(time_range)
        
        async with self.pool.acquire() as conn:
            logger.info(
                "[analytics.bundle] start user_id=%s time_range=%s days=%s tz_offset=%s",
                user_id,
                time_range,
                days,
                timezone_offset,
            )
            # Fetch user profile for personalized targets
            profile = await conn.fetchrow(
                """
                SELECT age, gender,
                       daily_calorie_target, protein_target, carbs_target, fat_target
                FROM profiles
                WHERE id = $1
                """,
                to_uuid(user_id),
            )
            
            # Compute personalized micronutrient targets
            micro_targets = {}
            macro_targets: Dict[str, Any] = {}
            if profile:
                age = profile.get("age", 25)
                gender = profile.get("gender", "male")
                calorie_target = profile.get("daily_calorie_target")
                micro_targets = compute_micronutrient_targets(
                    age, gender, calorie_target=calorie_target
                )
                macro_targets = {
                    "daily_calorie_target": calorie_target,
                    "protein_target": profile.get("protein_target"),
                    "carbs_target": profile.get("carbs_target"),
                    "fat_target": profile.get("fat_target"),
                }
            
            # Fetch meals
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
            
            # Get cached analytics
            cache = await conn.fetchrow(
                """
                SELECT insights, health_insights, bio_alerts, red_flags, meals_analyzed,
                       date_range_start, date_range_end, expires_at, last_refreshed_at,
                       tokens_used, refresh_count
                FROM analytics_cache
                WHERE user_id = $1 AND time_range = $2
                """,
                to_uuid(user_id),
                time_range,
            )
            
            is_inactive = len(meals) == 0
            
            # Always compute fresh daily highlights from nutrients (non-AI)
            daily_highlights = self._compute_daily_highlights(meals, micro_targets, macro_targets, timezone_offset)
            
            # Get cached analytics for the requested time_range (week/month/year)
            # Cache is valid only if: not expired AND no new meals since cache was created
            ai: Dict[str, Any] = {
                "insights": {},
                "health_insights": {},
                "bio_alerts": [],
                "red_flags": [],
            }
            
            cache_valid = False
            if cache and not is_inactive:
                expires_at = cache.get("expires_at")
                meals_analyzed = cache.get("meals_analyzed") or 0
                
                # Check if cache has expired by TTL
                cache_not_expired = expires_at and expires_at > datetime.now(timezone.utc)
                
                # Check if meal count changed (simple and reliable)
                # If more meals exist than were analyzed, cache is stale
                current_meal_count = len(meals)
                meals_unchanged = current_meal_count <= meals_analyzed

                cached_parsed = self._parse_analytics_cache_fields(cache)

                logger.info(
                    "[analytics.bundle] cache_check user_id=%s time_range=%s expires_at=%s cache_not_expired=%s meals_analyzed=%s current_meals=%s meals_unchanged=%s",
                    user_id,
                    time_range,
                    expires_at,
                    bool(cache_not_expired),
                    meals_analyzed,
                    current_meal_count,
                    meals_unchanged,
                )

                if cache_not_expired and meals_unchanged:
                    # Cache is valid - not expired and no new meals
                    cache_valid = True
                    ai = {
                        "insights": cached_parsed.get("insights", {}),
                        "health_insights": cached_parsed.get("health_insights", {}),
                        "bio_alerts": cached_parsed.get("bio_alerts", []),
                        "red_flags": cached_parsed.get("red_flags", []),
                    }
            
            # For daily AI: only include if cache exists and is not expired
            daily_ai = None
            if time_range == "week":  # Bundle is typically called with week, but we want daily AI
                daily_cache = await conn.fetchrow(
                    """
                    SELECT insights, health_insights, bio_alerts, red_flags, 
                           expires_at, meals_analyzed
                    FROM analytics_cache
                    WHERE user_id = $1 AND time_range = 'daily'
                    """,
                    to_uuid(user_id),
                )
                
                if daily_cache and not is_inactive:
                    expires_at = daily_cache.get("expires_at")
                    if expires_at and expires_at > datetime.now(timezone.utc):
                        # Daily AI cache is valid
                        parsed_daily = self._parse_analytics_cache_fields(daily_cache)
                        daily_ai = {
                            "insights": parsed_daily.get("insights", {}),
                            "health_insights": parsed_daily.get("health_insights", {}),
                            "bio_alerts": parsed_daily.get("bio_alerts", []),
                            "red_flags": parsed_daily.get("red_flags", []),
                            "cached": True,
                            "meals_analyzed": daily_cache.get("meals_analyzed", 0),
                        }

            result = {
                "meals": meals,
                "analytics": ai,
                "daily_highlights": daily_highlights,
                "micronutrient_targets": micro_targets,
                "cached": cache_valid,
                "stale": not is_inactive and not cache_valid,
            }

            logger.info(
                "[analytics.bundle] result user_id=%s time_range=%s meals=%s cached=%s stale=%s has_daily_ai=%s",
                user_id,
                time_range,
                len(meals),
                result.get("cached"),
                result.get("stale"),
                bool(daily_ai),
            )
            
            if daily_ai:
                result["daily_ai"] = daily_ai
            
            return result
    
    async def refresh_analytics(
        self,
        user_id: str,
        time_range: str = "week",
        timezone_offset: int = 0
    ) -> Dict[str, Any]:
        """
        Force refresh analytics by generating new AI insights.
        
        Args:
            user_id: User UUID
            time_range: "week", "month", or "year"
            timezone_offset: Timezone offset in minutes
        
        Returns:
            Newly generated analytics
        """
        async with self.pool.acquire() as conn:
            # Fetch user profile for personalized targets
            profile = await conn.fetchrow(
                """
                SELECT age, gender, daily_calorie_target
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
                calorie_target = profile.get("daily_calorie_target")
                micro_targets = compute_micronutrient_targets(
                    age, gender, calorie_target=calorie_target
                )
            
            # Check rate limiting - max 1 refresh per 5 minutes (unless cache is stale)
            cache = await conn.fetchrow(
                """
                SELECT last_refreshed_at, refresh_count, expires_at, meals_analyzed, insights
                FROM analytics_cache
                WHERE user_id = $1 AND time_range = $2
                """,
                to_uuid(user_id),
                time_range,
            )
            
            # Fetch meals
            days = self._days_for_time_range(time_range)
            logger.info(
                "[analytics.refresh] fetching_meals user_id=%s time_range=%s days=%s",
                user_id,
                time_range,
                days,
            )
            meals = await conn.fetch(
                """
                SELECT id, user_id, meal_type, timestamp, foods, micros,
                       total_calories, total_protein, total_carbs, total_fat
                FROM meals
                WHERE user_id = $1
                  AND timestamp >= (now() AT TIME ZONE 'UTC' + make_interval(mins => $3::int) - make_interval(days => $2::int))
                ORDER BY timestamp DESC
                """,
                to_uuid(user_id),
                days,
                int(timezone_offset),
            )
            
            if len(meals) == 0:
                logger.info(
                    "[analytics.refresh] no_meals user_id=%s time_range=%s",
                    user_id,
                    time_range,
                )
                return {
                    "insights": {},
                    "health_insights": {},
                    "bio_alerts": [],
                    "red_flags": [],
                    "cached": False,
                    "meals_analyzed": 0,
                }
            
            # Convert to list of dicts
            meals_list = [dict(m) for m in meals]

            # Decide whether we should enforce the 5-minute manual refresh limit.
            # If the cache is stale (expired OR input hash mismatch), allow refresh immediately.
            if cache:
                last_refresh = cache.get("last_refreshed_at")
                expires_at = cache.get("expires_at")
                cached_meals_analyzed = cache.get("meals_analyzed") or 0

                current_input_hash = self._analytics_input_hash(meals_list)
                cached_input_hash = None
                try:
                    cached_insights = cache.get("insights")
                    if isinstance(cached_insights, str):
                        cached_insights = json.loads(cached_insights)
                    if isinstance(cached_insights, dict):
                        cached_input_hash = cached_insights.get("__input_hash")
                except Exception:
                    cached_input_hash = None

                cache_not_expired = bool(expires_at and expires_at > datetime.now(timezone.utc))
                input_hash_match = bool(cached_input_hash) and cached_input_hash == current_input_hash
                meals_count_match = len(meals_list) <= int(cached_meals_analyzed or 0)
                cache_stale = (not cache_not_expired) or (not input_hash_match) or (not meals_count_match)

                if last_refresh and (datetime.now(timezone.utc) - last_refresh).total_seconds() < 300 and not cache_stale:
                    logger.info(
                        "[analytics.refresh] rate_limited user_id=%s time_range=%s last_refreshed_at=%s cache_not_expired=%s input_hash_match=%s meals_count_match=%s",
                        user_id,
                        time_range,
                        last_refresh,
                        cache_not_expired,
                        input_hash_match,
                        meals_count_match,
                    )
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=429,
                        detail="Please wait 5 minutes between manual refreshes"
                    )

                if cache_stale:
                    logger.info(
                        "[analytics.refresh] bypass_rate_limit user_id=%s time_range=%s cache_not_expired=%s input_hash_match=%s meals_count_match=%s",
                        user_id,
                        time_range,
                        cache_not_expired,
                        input_hash_match,
                        meals_count_match,
                    )

            if time_range == "daily" and cache:
                try:
                    latest_meal_ts = meals_list[0].get("timestamp") if meals_list else None
                    cached_range_end = cache.get("date_range_end")
                    if latest_meal_ts and cached_range_end and latest_meal_ts == cached_range_end:
                        parsed = await conn.fetchrow(
                            """
                            SELECT insights, health_insights, bio_alerts, red_flags, meals_analyzed,
                                   date_range_start, date_range_end, expires_at, last_refreshed_at,
                                   tokens_used, refresh_count
                            FROM analytics_cache
                            WHERE user_id = $1 AND time_range = $2
                            """,
                            to_uuid(user_id),
                            time_range,
                        )
                        if parsed and parsed.get("expires_at") and parsed["expires_at"] > datetime.now(timezone.utc):
                            out = self._parse_analytics_cache_fields(parsed)
                            return {
                                **out,
                                "cached": True,
                                "meals_analyzed": parsed["meals_analyzed"],
                                "date_range_start": parsed["date_range_start"],
                                "date_range_end": parsed["date_range_end"],
                                "expires_at": parsed["expires_at"],
                                "last_refreshed_at": parsed["last_refreshed_at"],
                                "tokens_used": parsed["tokens_used"],
                                "refresh_count": parsed["refresh_count"],
                                "skipped": True,
                            }
                except Exception:
                    pass
            
            # Compute micronutrients
            await self._compute_meal_micronutrients(conn, meals_list)

            input_hash = self._analytics_input_hash(meals_list)
            
            # Generate AI analytics
            start_time = datetime.now(timezone.utc)
            analysis = await _generate_analytics_ai(
                meals_list,
                time_range,
                micronutrient_targets=micro_targets,
                timezone_offset=timezone_offset,
            )
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

            # Persist a deterministic signature of the input used to generate analytics.
            # This lets us detect meal edits where count/timestamps may not change.
            try:
                insights_obj = analysis.get("insights") if isinstance(analysis, dict) else None
                if isinstance(insights_obj, dict):
                    insights_obj["__input_hash"] = input_hash
            except Exception:
                pass
            logger.info(
                "[analytics.refresh] ai_done user_id=%s time_range=%s meals=%s duration_ms=%s tokens_used=%s",
                user_id,
                time_range,
                len(meals),
                duration_ms,
                analysis.get("tokens_used", 0),
            )
            
            # Cache TTL based on time range
            ttl_delta = self._ttl_for_time_range(time_range)
            expires_at = datetime.now(timezone.utc) + ttl_delta
            
            # Upsert cache
            await conn.execute(
                """
                INSERT INTO analytics_cache (
                    user_id, time_range, insights, health_insights, bio_alerts, red_flags,
                    meals_analyzed, date_range_start, date_range_end, expires_at,
                    tokens_used, analysis_duration_ms
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (user_id, time_range) DO UPDATE
                SET
                    insights = EXCLUDED.insights,
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
                json.dumps(analysis.get("health_insights", {})),
                json.dumps(analysis.get("bio_alerts", [])),
                json.dumps(analysis.get("red_flags", [])),
                len(meals),
                meals[-1]["timestamp"] if meals else datetime.now(timezone.utc),
                meals[0]["timestamp"] if meals else datetime.now(timezone.utc),
                expires_at,
                analysis.get("tokens_used", 0),
                duration_ms,
            )

            logger.info(
                "[analytics.refresh] cache_upserted user_id=%s time_range=%s meals_analyzed=%s expires_at=%s",
                user_id,
                time_range,
                len(meals),
                expires_at,
            )
            
            return {
                "insights": analysis["insights"],
                "health_insights": analysis.get("health_insights", {}),
                "bio_alerts": analysis.get("bio_alerts", []),
                "red_flags": analysis.get("red_flags", []),
                "cached": True,
                "meals_analyzed": len(meals),
                "tokens_used": analysis.get("tokens_used", 0),
                "analysis_duration_ms": duration_ms,
            }

    @staticmethod
    def _analytics_input_hash(meals: List[Dict[str, Any]]) -> str:
        try:
            compact = []
            for m in meals:
                compact.append(
                    {
                        "id": str(m.get("id")),
                        "timestamp": str(m.get("timestamp")),
                        "total_calories": float(m.get("total_calories") or 0),
                        "total_protein": float(m.get("total_protein") or 0),
                        "total_carbs": float(m.get("total_carbs") or 0),
                        "total_fat": float(m.get("total_fat") or 0),
                        "foods": m.get("foods"),
                        "micros": m.get("micros"),
                    }
                )
            payload = json.dumps(compact, sort_keys=True, default=str).encode("utf-8")
            return hashlib.sha256(payload).hexdigest()
        except Exception:
            return ""

    @staticmethod
    def _days_for_time_range(time_range: str) -> int:
        if time_range == "daily":
            return 1
        if time_range == "week":
            return 7
        if time_range == "month":
            return 30
        return 365

    @staticmethod
    def _ttl_for_time_range(time_range: str) -> timedelta:
        if time_range == "daily":
            # Expire at next UTC midnight so cache never bleeds into the following day
            now = datetime.now(timezone.utc)
            next_midnight = (now + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            return next_midnight - now
        if time_range == "week":
            return timedelta(days=7)
        if time_range == "month":
            return timedelta(days=30)
        return timedelta(days=365)

    @staticmethod
    def _compute_daily_highlights(
        meals: List[Dict[str, Any]],
        micro_targets: Dict[str, Any],
        macro_targets: Dict[str, Any],
        timezone_offset: int,
    ) -> Dict[str, Any]:
        now_utc = datetime.now(timezone.utc)
        local_now = now_utc + timedelta(minutes=int(timezone_offset or 0))
        local_day = local_now.date()

        today_meals: List[Dict[str, Any]] = []
        for m in meals:
            ts = m.get("timestamp")
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts)
                except Exception:
                    ts = None
            if isinstance(ts, datetime):
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                local_ts = ts + timedelta(minutes=int(timezone_offset or 0))
                if local_ts.date() == local_day:
                    today_meals.append(m)

        totals = {
            "calories": 0.0,
            "protein": 0.0,
            "carbs": 0.0,
            "fat": 0.0,
        }

        micros_total: Dict[str, float] = {}
        for m in today_meals:
            totals["calories"] += float(m.get("total_calories") or 0)
            totals["protein"] += float(m.get("total_protein") or 0)
            totals["carbs"] += float(m.get("total_carbs") or 0)
            totals["fat"] += float(m.get("total_fat") or 0)
            mm = m.get("micros") or {}
            if isinstance(mm, dict):
                for k, v in mm.items():
                    try:
                        micros_total[k] = float(micros_total.get(k, 0.0)) + float(v or 0)
                    except Exception:
                        continue

        def pct(v: float, target: Any) -> float | None:
            try:
                t = float(target)
                if t <= 0:
                    return None
                return round((float(v) / t) * 100.0, 1)
            except Exception:
                return None

        macro_progress = {
            "calories_pct": pct(totals["calories"], macro_targets.get("daily_calorie_target")),
            "protein_pct": pct(totals["protein"], macro_targets.get("protein_target")),
            "carbs_pct": pct(totals["carbs"], macro_targets.get("carbs_target")),
            "fat_pct": pct(totals["fat"], macro_targets.get("fat_target")),
        }

        highlights: List[Dict[str, Any]] = []

        sugar = float(micros_total.get("sugar_g", 0.0) or 0.0)
        sodium = float(micros_total.get("sodium_mg", 0.0) or 0.0)
        fiber = float(micros_total.get("fiber_g", 0.0) or 0.0)

        if sugar > 0:
            highlights.append({"type": "sugar", "value": round(sugar, 1)})
        if sodium > 0:
            highlights.append({"type": "sodium", "value": round(sodium, 0)})
        if fiber > 0:
            highlights.append({"type": "fiber", "value": round(fiber, 1)})

        return {
            "date": str(local_day),
            "meals_count": len(today_meals),
            "totals": {k: round(v, 2) for k, v in totals.items()},
            "macro_progress": macro_progress,
            "highlights": highlights,
            "updated_at": now_utc.isoformat(),
        }
    
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
        import uuid
        
        # Collect all food IDs
        food_ids: List[uuid.UUID] = []
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
        
        # Fetch food data
        foods_by_id: Dict[str, Dict] = {}
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
        
        # Compute micros for each meal, merging with stored values.
        # Recomputed values (from latest foods table data) take priority.
        # When a nutrient is 0 in the recomputed result (food not enriched yet),
        # fall back to the value stored on the meal at log time.
        for m in meals:
            stored_micros = m.get("micros") or {}
            if isinstance(stored_micros, str):
                try:
                    import json as _json
                    stored_micros = _json.loads(stored_micros)
                except Exception:
                    stored_micros = {}
            recomputed = compute_meal_micros(m, foods_by_id)
            merged = {
                k: recomputed[k] if recomputed.get(k, 0.0) > 0 else float(stored_micros.get(k) or 0)
                for k in recomputed
            }
            m["micros"] = merged
    
    @staticmethod
    def _parse_analytics_cache_fields(cache: asyncpg.Record) -> Dict[str, Any]:
        """
        Parse JSON fields from analytics cache record.
        
        Args:
            cache: Database record from analytics_cache table
        
        Returns:
            Dictionary with parsed JSON fields
        """
        def safe_parse(field_value):
            if isinstance(field_value, str):
                try:
                    return json.loads(field_value)
                except Exception:
                    return {}
            return field_value or {}
        
        return {
            "insights": safe_parse(cache.get("insights")),
            "health_insights": safe_parse(cache.get("health_insights")),
            "bio_alerts": safe_parse(cache.get("bio_alerts")) if cache.get("bio_alerts") else [],
            "red_flags": safe_parse(cache.get("red_flags")) if cache.get("red_flags") else [],
        }
