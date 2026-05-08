"""
Quest service for gamification features.
Handles daily quests, XP, levels, streaks, and badges.
"""

import logging
from datetime import datetime, timezone, timedelta, date
from typing import Dict, Any, List, Tuple
import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class QuestService:
    """Service for managing quests, XP, levels, and badges."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_daily_quests(self, user_id: str) -> Dict[str, Any]:
        """
        Get user's daily quests with current progress.
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with quests list and date
        """
        today = datetime.now(timezone.utc).date()
        
        async with self.pool.acquire() as conn:
            await self._ensure_user_xp(conn, user_id)
            
            # Check if quests exist for today, if not create them
            existing = await conn.fetchval(
                "SELECT COUNT(*) FROM user_quests WHERE user_id = $1 AND quest_date = $2::date",
                to_uuid(user_id), today
            )
            
            if existing == 0:
                # Get active quest definitions and create user quests
                definitions = await conn.fetch(
                    "SELECT id, quest_type, target_value FROM quest_definitions WHERE is_daily = true AND is_active = true LIMIT 3"
                )
                for defn in definitions:
                    await conn.execute(
                        """
                        INSERT INTO user_quests (user_id, quest_definition_id, quest_date, target_value)
                        VALUES ($1, $2, $3::date, $4)
                        ON CONFLICT (user_id, quest_definition_id, quest_date) DO NOTHING
                        """,
                        to_uuid(user_id), defn["id"], today, float(defn["target_value"])
                    )
            
            # Get meal stats for progress calculation
            stats = await self._get_user_meal_stats_for_quests(conn, user_id, today)
            
            # Fetch quests with definitions
            quests = await conn.fetch(
                """
                SELECT 
                    uq.id, uq.current_value, uq.target_value, uq.is_completed, uq.xp_claimed,
                    qd.quest_type, qd.title, qd.description, qd.icon, qd.icon_color, 
                    qd.xp_reward, qd.target_unit
                FROM user_quests uq
                JOIN quest_definitions qd ON uq.quest_definition_id = qd.id
                WHERE uq.user_id = $1 AND uq.quest_date = $2::date
                ORDER BY qd.xp_reward DESC
                """,
                to_uuid(user_id), today
            )
            
            result = []
            for q in quests:
                # Calculate real-time progress
                current, is_completed = self._calculate_quest_progress(
                    q["quest_type"], q["target_value"], stats
                )
                
                # Update if changed
                if current != q["current_value"] or is_completed != q["is_completed"]:
                    await conn.execute(
                        """
                        UPDATE user_quests 
                        SET current_value = $1, is_completed = $2, 
                            completed_at = CASE WHEN $2 AND completed_at IS NULL THEN now() ELSE completed_at END,
                            updated_at = now()
                        WHERE id = $3
                        """,
                        current, is_completed, q["id"]
                    )
                
                result.append({
                    "id": str(q["id"]),
                    "title": q["title"],
                    "description": q["description"],
                    "icon": q["icon"],
                    "icon_color": q["icon_color"],
                    "xp": q["xp_reward"],
                    "current": round(current, 1),
                    "target": q["target_value"],
                    "unit": q["target_unit"],
                    "is_completed": is_completed,
                    "xp_claimed": q["xp_claimed"],
                })
            
            return {"quests": result, "date": today.isoformat()}
    
    async def claim_quest_xp(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Claim XP reward for a completed quest.
        
        Args:
            user_id: User UUID
            quest_id: Quest UUID
        
        Returns:
            Dictionary with XP earned and updated stats
        """
        async with self.pool.acquire() as conn:
            # Get quest and verify it's completed and not yet claimed
            quest = await conn.fetchrow(
                """
                SELECT uq.id, uq.is_completed, uq.xp_claimed, qd.xp_reward
                FROM user_quests uq
                JOIN quest_definitions qd ON uq.quest_definition_id = qd.id
                WHERE uq.id = $1 AND uq.user_id = $2
                """,
                to_uuid(quest_id), to_uuid(user_id)
            )
            
            if not quest:
                raise HTTPException(status_code=404, detail="Quest not found")
            if not quest["is_completed"]:
                raise HTTPException(status_code=400, detail="Quest not yet completed")
            if quest["xp_claimed"]:
                raise HTTPException(status_code=400, detail="XP already claimed")
            
            xp_reward = quest["xp_reward"]
            
            # Mark as claimed
            await conn.execute(
                "UPDATE user_quests SET xp_claimed = true, updated_at = now() WHERE id = $1",
                to_uuid(quest_id)
            )
            
            # Update user XP
            await self._ensure_user_xp(conn, user_id)
            new_xp = await conn.fetchrow(
                """
                UPDATE user_xp 
                SET total_xp = total_xp + $1, 
                    quests_completed = quests_completed + 1,
                    level = GREATEST(1, (total_xp + $1) / 100 + 1),
                    updated_at = now()
                WHERE user_id = $2
                RETURNING total_xp, level, quests_completed
                """,
                xp_reward, to_uuid(user_id)
            )
            
            return {
                "xp_earned": xp_reward,
                "total_xp": new_xp["total_xp"],
                "level": new_xp["level"],
                "quests_completed": new_xp["quests_completed"],
            }
    
    async def get_user_badges(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get user's badges (earned and available).
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with badges list
        """
        async with self.pool.acquire() as conn:
            # Get all badge definitions with earned status
            badges = await conn.fetch(
                """
                SELECT 
                    bd.id, bd.badge_type, bd.title, bd.description, bd.icon, 
                    bd.xp_reward, bd.tier,
                    ub.earned_at IS NOT NULL as earned,
                    ub.earned_at
                FROM badge_definitions bd
                LEFT JOIN user_badges ub ON bd.id = ub.badge_definition_id AND ub.user_id = $1
                WHERE bd.is_active = true
                ORDER BY ub.earned_at DESC NULLS LAST, bd.tier, bd.xp_reward DESC
                """,
                to_uuid(user_id)
            )
            
            return {
                "badges": [
                    {
                        "id": str(b["id"]),
                        "type": b["badge_type"],
                        "title": b["title"],
                        "description": b["description"],
                        "icon": b["icon"],
                        "xp": b["xp_reward"],
                        "tier": b["tier"],
                        "earned": b["earned"],
                        "earned_at": b["earned_at"].isoformat() if b["earned_at"] else None,
                    }
                    for b in badges
                ]
            }
    
    async def get_quest_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get user's XP, level, streak, and quest stats.
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with XP, level, streak, and quest stats
        """
        async with self.pool.acquire() as conn:
            await self._ensure_user_xp(conn, user_id)

            now_utc = datetime.now(timezone.utc)
            today = now_utc.date()
            yesterday = today - timedelta(days=1)

            # Mark user as active today
            try:
                await self._upsert_user_daily_activity(
                    conn, user_id, today, was_active=True, active_at=now_utc
                )
            except Exception:
                logger.warning("[QUEST_STATS] Failed to mark user as active", exc_info=True)

            # Backfill recent history
            try:
                await self._backfill_user_daily_activity_from_meals(
                    conn, user_id, today - timedelta(days=120)
                )
            except Exception:
                logger.warning("[QUEST_STATS] Failed to backfill user_daily_activity", exc_info=True)

            activity_rows = await conn.fetch(
                """
                SELECT activity_date, logged_food
                FROM user_daily_activity
                WHERE user_id = $1 AND activity_date >= $2
                """,
                to_uuid(user_id), yesterday
            )

            logged_today = False
            logged_yesterday = False
            for r in activity_rows:
                if r["activity_date"] == today:
                    logged_today = bool(r["logged_food"])
                if r["activity_date"] == yesterday:
                    logged_yesterday = bool(r["logged_food"])
            
            # Get current stats
            stats = await conn.fetchrow(
                "SELECT total_xp, level, current_streak, longest_streak, quests_completed, badges_earned, last_active_date FROM user_xp WHERE user_id = $1",
                to_uuid(user_id)
            )
            
            current_streak = stats["current_streak"] if stats else 0
            longest_streak = stats["longest_streak"] if stats else 0
            last_active = stats["last_active_date"] if stats else None
            
            # Update streak logic
            if logged_today:
                if last_active == yesterday or (last_active == today):
                    # Continue or maintain streak
                    if last_active != today:
                        current_streak += 1
                elif last_active is None or (today - last_active).days > 1:
                    # Start new streak
                    current_streak = 1
                
                longest_streak = max(longest_streak, current_streak)
                
                await conn.execute(
                    """
                    UPDATE user_xp 
                    SET current_streak = $1, longest_streak = $2, last_active_date = $3, updated_at = now()
                    WHERE user_id = $4
                    """,
                    current_streak, longest_streak, today, to_uuid(user_id)
                )
            elif last_active and (today - last_active).days > 1:
                # Streak broken
                current_streak = 0
                await conn.execute(
                    "UPDATE user_xp SET current_streak = 0, updated_at = now() WHERE user_id = $1",
                    to_uuid(user_id)
                )
            
            # Calculate XP needed for next level
            total_xp = stats["total_xp"] if stats else 0
            level = stats["level"] if stats else 1
            xp_for_next = (level * 100) - (total_xp % 100)
            
            return {
                "total_xp": total_xp,
                "level": level,
                "xp_for_next_level": xp_for_next,
                "current_streak": current_streak,
                "longest_streak": longest_streak,
                "quests_completed": stats["quests_completed"] if stats else 0,
                "badges_earned": stats["badges_earned"] if stats else 0,
            }
    
    async def _ensure_user_xp(self, conn: asyncpg.Connection, user_id: str) -> None:
        """Ensure user_xp record exists."""
        await conn.execute(
            """
            INSERT INTO user_xp (user_id, total_xp, level)
            VALUES ($1, 0, 1)
            ON CONFLICT (user_id) DO NOTHING
            """,
            to_uuid(user_id)
        )
    
    async def _get_user_meal_stats_for_quests(
        self, conn: asyncpg.Connection, user_id: str, target_date: date
    ) -> Dict[str, Any]:
        """Get meal statistics for quest progress calculation."""
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*)::int AS meals_logged,
                COALESCE(SUM(total_calories), 0)::double precision AS total_calories,
                COALESCE(SUM(total_protein), 0)::double precision AS total_protein
            FROM meals
            WHERE user_id = $1
              AND DATE(timestamp AT TIME ZONE 'UTC') = $2::date
            """,
            to_uuid(user_id), target_date
        )
        
        return {
            "meals_logged": stats["meals_logged"] if stats else 0,
            "total_calories": stats["total_calories"] if stats else 0,
            "total_protein": stats["total_protein"] if stats else 0,
        }
    
    @staticmethod
    def _calculate_quest_progress(
        quest_type: str, target_value: float, stats: Dict[str, Any]
    ) -> Tuple[float, bool]:
        """Calculate quest progress based on type and stats."""
        current = 0.0
        
        if quest_type == "log_meals":
            current = float(stats.get("meals_logged", 0))
        elif quest_type == "hit_calorie_target":
            current = float(stats.get("total_calories", 0))
        elif quest_type == "hit_protein_target":
            current = float(stats.get("total_protein", 0))
        else:
            current = 0.0
        
        is_completed = current >= target_value
        return current, is_completed
    
    async def _upsert_user_daily_activity(
        self,
        conn: asyncpg.Connection,
        user_id: str,
        activity_date: date,
        *,
        was_active: bool = False,
        logged_food: bool = False,
        active_at: datetime = None,
        logged_at: datetime = None,
    ) -> None:
        """Update user daily activity tracking."""
        await conn.execute(
            """
            INSERT INTO user_daily_activity (
                user_id, activity_date, was_active, logged_food,
                last_active_at, last_logged_food_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now())
            ON CONFLICT (user_id, activity_date) DO UPDATE
            SET
                was_active = user_daily_activity.was_active OR EXCLUDED.was_active,
                logged_food = user_daily_activity.logged_food OR EXCLUDED.logged_food,
                last_active_at = COALESCE(EXCLUDED.last_active_at, user_daily_activity.last_active_at),
                last_logged_food_at = COALESCE(EXCLUDED.last_logged_food_at, user_daily_activity.last_logged_food_at),
                updated_at = now()
            """,
            to_uuid(user_id), activity_date, bool(was_active), bool(logged_food),
            active_at, logged_at
        )
    
    async def _backfill_user_daily_activity_from_meals(
        self, conn: asyncpg.Connection, user_id: str, since_date: date
    ) -> None:
        """Backfill user_daily_activity from meals table."""
        await conn.execute(
            """
            INSERT INTO user_daily_activity (user_id, activity_date, logged_food, last_logged_food_at)
            SELECT 
                user_id,
                DATE(timestamp AT TIME ZONE 'UTC') as activity_date,
                true as logged_food,
                MAX(timestamp) as last_logged_food_at
            FROM meals
            WHERE user_id = $1 AND DATE(timestamp AT TIME ZONE 'UTC') >= $2::date
            GROUP BY user_id, DATE(timestamp AT TIME ZONE 'UTC')
            ON CONFLICT (user_id, activity_date) DO UPDATE
            SET
                logged_food = true,
                last_logged_food_at = GREATEST(
                    user_daily_activity.last_logged_food_at,
                    EXCLUDED.last_logged_food_at
                )
            """,
            to_uuid(user_id), since_date
        )

    # ── New endpoints ───────────────────────────────────────────────────────

    async def get_streak_calendar(self, user_id: str, days: int = 90) -> Dict[str, Any]:
        """
        Return a day-by-day activity log for the streak calendar.

        Args:
            user_id: User UUID
            days: Number of days to return (default 90)

        Returns:
            Dictionary with start_date, end_date, and days list
        """
        now_utc = datetime.now(timezone.utc)
        end_date = now_utc.date()
        start_date = end_date - timedelta(days=int(days) - 1)

        async with self.pool.acquire() as conn:
            # Backfill from meals table so the calendar is accurate
            try:
                await self._backfill_user_daily_activity_from_meals(conn, user_id, start_date)
            except Exception:
                logger.warning("[STREAK_CALENDAR] Failed to backfill user_daily_activity", exc_info=True)

            rows = await conn.fetch(
                """
                SELECT
                    activity_date,
                    was_active,
                    logged_food,
                    last_active_at,
                    last_logged_food_at
                FROM user_daily_activity
                WHERE user_id = $1
                  AND activity_date >= $2
                  AND activity_date <= $3
                ORDER BY activity_date ASC
                """,
                to_uuid(user_id),
                start_date,
                end_date,
            )

        by_date = {r["activity_date"]: r for r in rows}
        out_days: List[Dict[str, Any]] = []
        cur = start_date
        while cur <= end_date:
            r = by_date.get(cur)
            out_days.append(
                {
                    "date": cur.isoformat(),
                    "was_active": bool(r["was_active"]) if r else False,
                    "logged_food": bool(r["logged_food"]) if r else False,
                    "last_active_at": r["last_active_at"].isoformat() if r and r["last_active_at"] else None,
                    "last_logged_food_at": r["last_logged_food_at"].isoformat() if r and r["last_logged_food_at"] else None,
                }
            )
            cur = cur + timedelta(days=1)

        return {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": out_days,
        }

    async def check_badges(self, user_id: str) -> Dict[str, Any]:
        """
        Check if the user has earned any new badges and award them.

        Args:
            user_id: User UUID

        Returns:
            Dictionary with newly_earned badges and xp_earned
        """
        async with self.pool.acquire() as conn:
            await self._ensure_user_xp(conn, user_id)

            # ── Gather stats needed for all requirement types ──────────────
            meal_count = await conn.fetchval(
                "SELECT COUNT(*) FROM meals WHERE user_id = $1", to_uuid(user_id)
            )

            user_stats = await conn.fetchrow(
                "SELECT current_streak, quests_completed FROM user_xp WHERE user_id = $1",
                to_uuid(user_id),
            )
            streak = user_stats["current_streak"] if user_stats else 0
            quests = user_stats["quests_completed"] if user_stats else 0

            # Days user hit their protein target (>= profile protein_target)
            protein_days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT DATE(m.timestamp AT TIME ZONE 'UTC'))
                FROM meals m
                JOIN profiles p ON p.id = m.user_id
                WHERE m.user_id = $1
                  AND p.protein_target IS NOT NULL
                  AND m.total_protein >= p.protein_target
                """,
                to_uuid(user_id),
            ) or 0

            # Days user hit ALL macro targets within ±10 %
            macro_days = await conn.fetchval(
                """
                WITH daily AS (
                    SELECT
                        DATE(m.timestamp AT TIME ZONE 'UTC') AS meal_date,
                        SUM(m.total_protein) AS protein,
                        SUM(m.total_carbs)   AS carbs,
                        SUM(m.total_fat)     AS fat
                    FROM meals m
                    WHERE m.user_id = $1
                    GROUP BY DATE(m.timestamp AT TIME ZONE 'UTC')
                )
                SELECT COUNT(*)
                FROM daily d
                JOIN profiles p ON p.id = $1
                WHERE p.protein_target IS NOT NULL
                  AND p.carbs_target   IS NOT NULL
                  AND p.fat_target     IS NOT NULL
                  AND d.protein BETWEEN p.protein_target * 0.9 AND p.protein_target * 1.1
                  AND d.carbs   BETWEEN p.carbs_target   * 0.9 AND p.carbs_target   * 1.1
                  AND d.fat     BETWEEN p.fat_target     * 0.9 AND p.fat_target     * 1.1
                """,
                to_uuid(user_id),
            ) or 0

            # Days user logged a meal with meal_type = 'breakfast'
            breakfast_days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT DATE(timestamp AT TIME ZONE 'UTC'))
                FROM meals
                WHERE user_id = $1
                  AND meal_type = 'breakfast'
                """,
                to_uuid(user_id),
            ) or 0

            # Count of unique food names ever logged
            unique_foods = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT f->>'name')
                FROM meals m,
                     jsonb_array_elements(
                         CASE jsonb_typeof(m.foods::jsonb)
                             WHEN 'array' THEN m.foods::jsonb
                             ELSE '[]'::jsonb
                         END
                     ) AS f
                WHERE m.user_id = $1
                  AND (f->>'name') IS NOT NULL
                  AND (f->>'name') <> ''
                """,
                to_uuid(user_id),
            ) or 0

            stat_map = {
                "meal_count":     int(meal_count),
                "streak":         int(streak),
                "quest_count":    int(quests),
                "protein_days":   int(protein_days),
                "macro_days":     int(macro_days),
                "breakfast_days": int(breakfast_days),
                "unique_foods":   int(unique_foods),
            }

            available = await conn.fetch(
                """
                SELECT bd.id, bd.badge_type, bd.requirement_type, bd.requirement_value, bd.xp_reward, bd.title
                FROM badge_definitions bd
                WHERE bd.is_active = true
                  AND NOT EXISTS (
                      SELECT 1 FROM user_badges ub
                      WHERE ub.badge_definition_id = bd.id AND ub.user_id = $1
                  )
                """,
                to_uuid(user_id),
            )

            newly_earned = []
            total_xp_earned = 0

            for badge in available:
                req_type = badge["requirement_type"]
                req_val = badge["requirement_value"]
                current = stat_map.get(req_type, 0)

                if current >= req_val:
                    await conn.execute(
                        "INSERT INTO user_badges (user_id, badge_definition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        to_uuid(user_id),
                        badge["id"],
                    )
                    total_xp_earned += badge["xp_reward"]
                    newly_earned.append(
                        {
                            "id": str(badge["id"]),
                            "title": badge["title"],
                            "xp": badge["xp_reward"],
                        }
                    )

            if newly_earned:
                await conn.execute(
                    """
                    UPDATE user_xp
                    SET total_xp = total_xp + $1,
                        badges_earned = badges_earned + $2,
                        level = GREATEST(1, (total_xp + $1) / 100 + 1),
                        updated_at = now()
                    WHERE user_id = $3
                    """,
                    total_xp_earned,
                    len(newly_earned),
                    to_uuid(user_id),
                )

            return {
                "newly_earned": newly_earned,
                "xp_earned": total_xp_earned,
            }

    async def get_leaderboard(
        self, requester_uid: str, scope: str = "global"
    ) -> Dict[str, Any]:
        """
        Get XP leaderboard.

        Args:
            requester_uid: UID of the requesting user (for friends scope + is_current_user flag)
            scope: 'global' for all users, 'friends' for followed users + self

        Returns:
            Dictionary with leaderboard list and scope
        """
        async with self.pool.acquire() as conn:
            if scope == "friends":
                rows = await conn.fetch(
                    """
                    SELECT
                        ux.user_id,
                        ux.total_xp,
                        ux.level,
                        ux.badges_earned,
                        COALESCE(p.username, p.name) AS name,
                        ux.user_id = $1 AS is_current_user
                    FROM user_xp ux
                    JOIN profiles p ON ux.user_id = p.id
                    WHERE ux.user_id = $1
                       OR ux.user_id IN (
                            SELECT following_id
                            FROM user_follows
                            WHERE follower_id = $1
                       )
                    ORDER BY ux.total_xp DESC
                    LIMIT 50
                    """,
                    to_uuid(requester_uid),
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT
                        ux.user_id,
                        ux.total_xp,
                        ux.level,
                        ux.badges_earned,
                        COALESCE(p.username, p.name) AS name,
                        ux.user_id = $1 AS is_current_user
                    FROM user_xp ux
                    JOIN profiles p ON ux.user_id = p.id
                    ORDER BY ux.total_xp DESC
                    LIMIT 50
                    """,
                    to_uuid(requester_uid),
                )

        leaderboard = [
            {
                "rank": i + 1,
                "user_id": str(row["user_id"]),
                "name": row["name"] or "Anonymous Chef",
                "total_xp": row["total_xp"],
                "level": row["level"],
                "badges_earned": row["badges_earned"],
                "is_current_user": row["is_current_user"],
            }
            for i, row in enumerate(rows)
        ]

        return {"leaderboard": leaderboard, "scope": scope}

