"""Water intake tracking service."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class WaterService:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def log_water(self, user_id: str, amount_ml: int) -> Dict[str, Any]:
        if amount_ml <= 0:
            raise HTTPException(status_code=400, detail="amount_ml must be positive")

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO water_logs (user_id, amount_ml)
                VALUES ($1, $2)
                RETURNING id, amount_ml, logged_at
                """,
                to_uuid(user_id),
                amount_ml,
            )
        return {"id": str(row["id"]), "amount_ml": row["amount_ml"], "logged_at": row["logged_at"]}

    async def get_today(self, user_id: str, tz_offset: int = 0) -> Dict[str, Any]:
        async with self.pool.acquire() as conn:
            goal_row = await conn.fetchrow(
                "SELECT water_goal_ml FROM profiles WHERE id = $1",
                to_uuid(user_id),
            )
            if not goal_row:
                raise HTTPException(status_code=404, detail="User not found")

            rows = await conn.fetch(
                """
                SELECT id, amount_ml, logged_at
                FROM water_logs
                WHERE user_id = $1
                  AND (logged_at AT TIME ZONE 'UTC' - make_interval(mins := $2))::date = 
                      (now() AT TIME ZONE 'UTC' - make_interval(mins := $2))::date
                ORDER BY logged_at DESC
                """,
                to_uuid(user_id),
                tz_offset
            )

        logs = [{"id": str(r["id"]), "amount_ml": r["amount_ml"], "logged_at": r["logged_at"]} for r in rows]
        total = sum(r["amount_ml"] for r in rows)
        goal = goal_row["water_goal_ml"]

        return {
            "total_ml": total,
            "goal_ml": goal,
            "percentage": round(min(total / goal * 100, 100), 1) if goal else 0,
            "logs": logs,
        }

    async def delete_log(self, user_id: str, log_id: str) -> Dict[str, str]:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM water_logs WHERE id = $1 AND user_id = $2",
                to_uuid(log_id),
                to_uuid(user_id),
            )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Log not found")
        return {"detail": "Deleted"}

    async def update_goal(self, user_id: str, goal_ml: int) -> Dict[str, int]:
        if goal_ml <= 0:
            raise HTTPException(status_code=400, detail="goal_ml must be positive")
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "UPDATE profiles SET water_goal_ml = $2 WHERE id = $1 RETURNING water_goal_ml",
                to_uuid(user_id),
                goal_ml,
            )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {"water_goal_ml": row["water_goal_ml"]}
