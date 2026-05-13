"""
Diet Report Service

Generates weekly/monthly/yearly diet reports for users.
Reports are stored in the diet_reports table and can be manually or automatically triggered.
"""

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.db.pool import get_pool
from app.services.analytics_service import AnalyticsService
from app.diet_report_ai import generate_diet_report

logger = logging.getLogger(__name__)


class DietReportService:
    """Service for generating and managing diet reports."""
    
    def __init__(self, pool):
        self.pool = pool
        self.analytics_service = AnalyticsService(pool)
    
    async def generate_report(
        self,
        user_id: str,
        time_range: str = "week",
        report_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """
        Generate a diet report for a user for a specific time range.
        
        Args:
            user_id: User UUID
            time_range: 'week', 'month', or 'year'
            report_date: The date to generate the report for (defaults to today)
        
        Returns:
            Generated report data
        """
        if report_date is None:
            report_date = date.today()
        
        logger.info(
            "[diet_report.generate] user_id=%s time_range=%s report_date=%s",
            user_id,
            time_range,
            report_date,
        )
        
        # Get analytics bundle for the time range
        bundle = await self.analytics_service.get_analytics_bundle(
            user_id=user_id,
            time_range=time_range,
            timezone_offset=0,
        )
        
        meals = bundle.get("meals", [])
        analytics = bundle.get("analytics", {})
        daily_highlights = bundle.get("daily_highlights", {})
        
        if not meals:
            logger.info("[diet_report.generate] no_meals user_id=%s", user_id)
            return {
                "user_id": user_id,
                "time_range": time_range,
                "report_date": report_date.isoformat(),
                "grade": "N/A",
                "justification": "No meals logged for this period",
                "executive_summary": "No meals logged for this period. Start logging your meals to receive personalized diet reports.",
                "strengths": [],
                "areas_for_improvement": [],
                "detailed_analysis": {},
                "specific_recommendations": [],
                "meal_suggestions": [],
                "action_plan": {},
                "highlights": {},
                "health_insights": {},
                "bio_alerts": [],
                "red_flags": [],
                "top_foods": [],
                "meals_count": 0,
            }
        
        # Fetch user profile for personalized targets
        async with self.pool.acquire() as conn:
            profile = await conn.fetchrow(
                """
                SELECT age, gender, daily_calorie_target, protein_target, carbs_target, fat_target
                FROM profiles
                WHERE id = $1
                """,
                user_id,
            )
            user_profile = dict(profile) if profile else None
        
        # Build meals data for AI
        meals_data = {
            "meals": meals,
            "summary": daily_highlights.get("summary", {}),
        }
        
        # Generate comprehensive report using AI
        ai_report = await generate_diet_report(
            meals_data=meals_data,
            analytics_data=analytics,
            time_range=time_range,
            user_profile=user_profile,
        )
        
        # Compute top foods from meals
        top_foods = self._compute_top_foods(meals)
        
        # Build complete report data
        report_data = {
            "user_id": user_id,
            "time_range": time_range,
            "report_date": report_date.isoformat(),
            "grade": ai_report.get("grade", "C"),
            "justification": ai_report.get("grade_justification", ""),
            "executive_summary": ai_report.get("executive_summary", ""),
            "strengths": ai_report.get("strengths", []),
            "areas_for_improvement": ai_report.get("areas_for_improvement", []),
            "detailed_analysis": ai_report.get("detailed_analysis", {}),
            "specific_recommendations": ai_report.get("specific_recommendations", []),
            "meal_suggestions": ai_report.get("meal_suggestions", []),
            "action_plan": ai_report.get("action_plan", {}),
            "highlights": daily_highlights,
            "health_insights": analytics.get("health_insights", {}),
            "bio_alerts": analytics.get("bio_alerts", []),
            "red_flags": analytics.get("red_flags", []),
            "top_foods": top_foods,
            "macro_balance": analytics.get("insights", {}).get("macro_balance", ""),
            "micronutrient_status": analytics.get("insights", {}).get("micronutrient_status", ""),
            "eating_pattern": analytics.get("insights", {}).get("eating_pattern", ""),
            "variety": analytics.get("insights", {}).get("variety", ""),
            "meals_count": len(meals),
        }
        
        # Store report in database
        await self._store_report(report_data)
        
        logger.info(
            "[diet_report.generate] completed user_id=%s time_range=%s grade=%s",
            user_id,
            time_range,
            report_data["grade"],
        )
        
        return report_data
    
    def _parse_grade(self, overall_diet_quality: str) -> str:
        """Extract grade letter from overall_diet_quality string."""
        import re
        match = re.match(r"^([A-F][+-]?)", overall_diet_quality)
        return match.group(1) if match else "C"
    
    def _parse_justification(self, overall_diet_quality: str) -> str:
        """Extract justification text from overall_diet_quality string."""
        import re
        justification = re.sub(r"^[A-F][+-]?\s*[-–:]?\s*", "", overall_diet_quality)
        return justification.strip() or "No justification provided"
    
    def _compute_top_foods(self, meals: List[Dict]) -> List[Dict]:
        """Compute top foods from meals based on frequency."""
        food_counts: Dict[str, int] = {}
        
        for meal in meals:
            foods = meal.get("foods", [])
            if isinstance(foods, str):
                try:
                    foods = json.loads(foods)
                except Exception:
                    foods = []
            
            for food in foods:
                if isinstance(food, dict):
                    name = food.get("name", "")
                elif isinstance(food, str):
                    name = food
                else:
                    continue
                
                if name:
                    food_counts[name] = food_counts.get(name, 0) + 1
        
        # Sort by count and return top 10
        sorted_foods = sorted(food_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        return [{"name": name, "count": count} for name, count in sorted_foods]
    
    async def _store_report(self, report_data: Dict[str, Any]) -> None:
        """Store report data in diet_reports table."""
        # Convert report_date string to date object
        report_date_str = report_data["report_date"]
        if isinstance(report_date_str, str):
            from datetime import datetime
            report_date = datetime.strptime(report_date_str, "%Y-%m-%d").date()
        else:
            report_date = report_date_str
        
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO diet_reports (
                    user_id, time_range, report_date, grade, justification,
                    executive_summary, strengths, areas_for_improvement,
                    detailed_analysis, specific_recommendations, meal_suggestions, action_plan,
                    highlights, health_insights, bio_alerts, red_flags,
                    top_foods, macro_balance, micronutrient_status,
                    eating_pattern, variety
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                ON CONFLICT (user_id, time_range, report_date)
                DO UPDATE SET
                    grade = EXCLUDED.grade,
                    justification = EXCLUDED.justification,
                    executive_summary = EXCLUDED.executive_summary,
                    strengths = EXCLUDED.strengths,
                    areas_for_improvement = EXCLUDED.areas_for_improvement,
                    detailed_analysis = EXCLUDED.detailed_analysis,
                    specific_recommendations = EXCLUDED.specific_recommendations,
                    meal_suggestions = EXCLUDED.meal_suggestions,
                    action_plan = EXCLUDED.action_plan,
                    highlights = EXCLUDED.highlights,
                    health_insights = EXCLUDED.health_insights,
                    bio_alerts = EXCLUDED.bio_alerts,
                    red_flags = EXCLUDED.red_flags,
                    top_foods = EXCLUDED.top_foods,
                    macro_balance = EXCLUDED.macro_balance,
                    micronutrient_status = EXCLUDED.micronutrient_status,
                    eating_pattern = EXCLUDED.eating_pattern,
                    variety = EXCLUDED.variety,
                    updated_at = now()
                """,
                report_data["user_id"],
                report_data["time_range"],
                report_date,
                report_data["grade"],
                report_data["justification"],
                report_data.get("executive_summary", ""),
                json.dumps(report_data.get("strengths", [])),
                json.dumps(report_data.get("areas_for_improvement", [])),
                json.dumps(report_data.get("detailed_analysis", {})),
                json.dumps(report_data.get("specific_recommendations", [])),
                json.dumps(report_data.get("meal_suggestions", [])),
                json.dumps(report_data.get("action_plan", {})),
                json.dumps(report_data["highlights"]),
                json.dumps(report_data["health_insights"]),
                json.dumps(report_data["bio_alerts"]),
                json.dumps(report_data["red_flags"]),
                json.dumps(report_data["top_foods"]),
                report_data.get("macro_balance", ""),
                report_data.get("micronutrient_status", ""),
                report_data.get("eating_pattern", ""),
                report_data.get("variety", ""),
            )
    
    async def get_latest_report(
        self,
        user_id: str,
        time_range: str = "week",
    ) -> Optional[Dict[str, Any]]:
        """
        Get the latest diet report for a user for a specific time range.
        
        Args:
            user_id: User UUID
            time_range: 'week', 'month', or 'year'
        
        Returns:
            Report data or None if no report exists
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, user_id, time_range, report_date, grade, justification,
                       executive_summary, strengths, areas_for_improvement,
                       detailed_analysis, specific_recommendations, meal_suggestions, action_plan,
                       highlights, health_insights, bio_alerts, red_flags,
                       top_foods, macro_balance, micronutrient_status,
                       eating_pattern, variety, created_at, updated_at
                FROM diet_reports
                WHERE user_id = $1 AND time_range = $2
                ORDER BY report_date DESC
                LIMIT 1
                """,
                user_id,
                time_range,
            )
            
            if not row:
                return None
            
            return {
                "id": str(row["id"]),
                "user_id": str(row["user_id"]),
                "time_range": row["time_range"],
                "report_date": row["report_date"].isoformat(),
                "grade": row["grade"],
                "justification": row["justification"],
                "executive_summary": row["executive_summary"] or "",
                "strengths": row["strengths"] or [],
                "areas_for_improvement": row["areas_for_improvement"] or [],
                "detailed_analysis": row["detailed_analysis"] or {},
                "specific_recommendations": row["specific_recommendations"] or [],
                "meal_suggestions": row["meal_suggestions"] or [],
                "action_plan": row["action_plan"] or {},
                "highlights": row["highlights"],
                "health_insights": row["health_insights"],
                "bio_alerts": row["bio_alerts"],
                "red_flags": row["red_flags"],
                "top_foods": row["top_foods"],
                "macro_balance": row["macro_balance"],
                "micronutrient_status": row["micronutrient_status"],
                "eating_pattern": row["eating_pattern"],
                "variety": row["variety"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
            }
    
    async def generate_for_active_users(
        self,
        time_range: str = "week",
        days_threshold: int = 7,
    ) -> Dict[str, int]:
        """
        Generate diet reports for all active users.
        
        Args:
            time_range: 'week', 'month', or 'year'
            days_threshold: Days of activity to consider user active
        
        Returns:
            Dict with success, failed, skipped counts
        """
        logger.info("[diet_report.batch] Starting time_range=%s", time_range)
        
        async with self.pool.acquire() as conn:
            # Get active users (logged meals in last X days)
            rows = await conn.fetch(
                """
                SELECT DISTINCT user_id
                FROM meals
                WHERE timestamp >= now() - make_interval(days => $1::int)
                """,
                days_threshold,
            )
        
        user_ids = [str(r["user_id"]) for r in rows]
        logger.info("[diet_report.batch] %d active users", len(user_ids))
        
        success = failed = skipped = 0
        for uid in user_ids:
            try:
                report_date = date.today()
                
                # Check if report already exists for today
                existing = await self.get_latest_report(uid, time_range)
                if existing and existing["report_date"] == report_date.isoformat():
                    skipped += 1
                    logger.info("[diet_report.batch] skipped user=%s (already exists)", uid)
                    continue
                
                await self.generate_report(uid, time_range, report_date)
                success += 1
            except Exception as exc:
                logger.warning("[diet_report.batch] failed user=%s error=%s", uid, exc)
                failed += 1
            
            # Pace requests
            await asyncio.sleep(0.5)
        
        logger.info(
            "[diet_report.batch] done success=%d skipped=%d failed=%d",
            success,
            skipped,
            failed,
        )
        
        return {"success": success, "skipped": skipped, "failed": failed}
