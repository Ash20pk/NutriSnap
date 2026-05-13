"""
Social service for user interactions.
Handles user search, follow/unfollow, and social stats.
"""

import logging
from typing import Dict, Any, List
import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class SocialService:
    """Service for managing social features."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def search_users(self, query: str, current_uid: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Search for users by name or username.
        
        Args:
            query: Search query string
            current_uid: Current user ID (to exclude from results)
        
        Returns:
            Dictionary with search results
        """
        q = query.strip().lower()
        if not q:
            return {"results": []}
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                  p.id, p.name, p.username, p.bio, p.avatar_url,
                  EXISTS(
                    SELECT 1 FROM user_follows uf
                    WHERE uf.follower_id = $1 AND uf.following_id = p.id
                  ) AS is_following
                FROM profiles p
                WHERE p.id != $1
                  AND (
                    lower(p.name) LIKE '%' || $2 || '%'
                    OR lower(p.username) LIKE '%' || $2 || '%'
                  )
                ORDER BY
                  CASE WHEN lower(p.username) = $2 THEN 0 ELSE 1 END,
                  CASE WHEN lower(p.name) = $2 THEN 0 ELSE 1 END,
                  p.name ASC
                LIMIT 50
                """,
                to_uuid(current_uid),
                q,
            )

        results = []
        for r in rows:
            results.append({
                "id": str(r["id"]),
                "name": r["name"],
                "username": r["username"],
                "bio": r["bio"],
                "avatar_url": r["avatar_url"],
                "is_following": bool(r["is_following"]),
            })
        
        return {"results": results}
    
    async def follow_user(self, follower_id: str, target_user_id: str) -> Dict[str, bool]:
        """
        Follow a user.
        
        Args:
            follower_id: ID of user doing the following
            target_user_id: ID of user being followed
        
        Returns:
            Success dictionary
        """
        if follower_id == target_user_id:
            raise HTTPException(status_code=400, detail="Cannot follow yourself")
        
        async with self.pool.acquire() as conn:
            exists = await conn.fetchval(
                "SELECT 1 FROM profiles WHERE id = $1",
                to_uuid(target_user_id)
            )
            if not exists:
                raise HTTPException(status_code=404, detail="User not found")
            
            await conn.execute(
                "INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                to_uuid(follower_id),
                to_uuid(target_user_id),
            )
        
        return {"ok": True}
    
    async def unfollow_user(self, follower_id: str, target_user_id: str) -> Dict[str, bool]:
        """
        Unfollow a user.
        
        Args:
            follower_id: ID of user doing the unfollowing
            target_user_id: ID of user being unfollowed
        
        Returns:
            Success dictionary
        """
        if follower_id == target_user_id:
            raise HTTPException(status_code=400, detail="Cannot unfollow yourself")
        
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2",
                to_uuid(follower_id),
                to_uuid(target_user_id),
            )
        
        return {"ok": True}
    
    async def list_following(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get list of users that the user is following.
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with following list
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.name, p.username
                FROM user_follows uf
                JOIN profiles p ON p.id = uf.following_id
                WHERE uf.follower_id = $1
                ORDER BY uf.created_at DESC
                LIMIT 200
                """,
                to_uuid(user_id),
            )
        
        return {
            "following": [
                {"id": str(r["id"]), "name": r["name"], "username": r["username"]}
                for r in rows
            ]
        }
    
    async def list_followers(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get list of users following the user.
        
        Args:
            user_id: User UUID
        
        Returns:
            Dictionary with followers list
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.name, p.username
                FROM user_follows uf
                JOIN profiles p ON p.id = uf.follower_id
                WHERE uf.following_id = $1
                ORDER BY uf.created_at DESC
                LIMIT 200
                """,
                to_uuid(user_id),
            )
        
        return {
            "followers": [
                {"id": str(r["id"]), "name": r["name"], "username": r["username"]}
                for r in rows
            ]
        }
    
    async def get_public_user_stats(self, user_id: str, current_uid: str) -> Dict[str, Any]:
        """
        Get public-facing stats for profile/leaderboard.
        
        Args:
            user_id: User UUID to get stats for
            current_uid: Current user ID (to check follow status)
        
        Returns:
            Dictionary with public user stats
        """
        async with self.pool.acquire() as conn:
            # Ensure user XP record exists
            await conn.execute(
                """
                INSERT INTO user_xp (user_id, total_xp, level)
                VALUES ($1, 0, 1)
                ON CONFLICT (user_id) DO NOTHING
                """,
                to_uuid(user_id)
            )
            
            row = await conn.fetchrow(
                """
                SELECT
                  p.id,
                  p.name,
                  p.username,
                  p.bio,
                  p.avatar_url,
                  p.is_special_user,
                  ux.total_xp,
                  ux.level,
                  ux.current_streak,
                  ux.longest_streak,
                  ux.quests_completed,
                  ux.badges_earned,
                  (SELECT COUNT(*)::int FROM user_follows uf WHERE uf.following_id = p.id) AS followers_count,
                  (SELECT COUNT(*)::int FROM user_follows uf WHERE uf.follower_id = p.id) AS following_count,
                  EXISTS(
                    SELECT 1 FROM user_follows uf
                    WHERE uf.follower_id = $2 AND uf.following_id = p.id
                  ) AS is_followed_by_me
                FROM profiles p
                JOIN user_xp ux ON ux.user_id = p.id
                WHERE p.id = $1
                """,
                to_uuid(user_id),
                to_uuid(current_uid),
            )

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "id": str(row["id"]),
            "name": row["name"],
            "username": row["username"],
            "bio": row["bio"],
            "avatar_url": row["avatar_url"],
            "total_xp": int(row["total_xp"] or 0),
            "level": int(row["level"] or 1),
            "current_streak": int(row["current_streak"] or 0),
            "longest_streak": int(row["longest_streak"] or 0),
            "quests_completed": int(row["quests_completed"] or 0),
            "badges_earned": int(row["badges_earned"] or 0),
            "followers_count": int(row["followers_count"] or 0),
            "following_count": int(row["following_count"] or 0),
            "is_followed_by_me": bool(row["is_followed_by_me"]),
            "is_special_user": bool(row["is_special_user"]),
        }
