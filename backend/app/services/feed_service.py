"""
Feed service — creates and retrieves social_feed_events posts.
"""

import logging
from typing import Any, Dict, List, Optional
import asyncpg

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class FeedService:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    # ── Create ──────────────────────────────────────────────────────

    async def create_post(
        self,
        user_id: str,
        event_type: str,
        title: str,
        body: Optional[str] = None,
        photo_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        import json
        meta_json = json.dumps(metadata or {})
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO social_feed_events
                    (user_id, event_type, title, body, photo_url, metadata)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                RETURNING id, created_at
                """,
                to_uuid(user_id),
                event_type,
                title,
                body,
                photo_url,
                meta_json,
            )
        return {"post_id": str(row["id"]), "created_at": row["created_at"].isoformat()}

    # ── Read ────────────────────────────────────────────────────────

    async def get_feed(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Returns posts from users the caller follows + their own posts,
        newest first.
        """
        uid = to_uuid(user_id)
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    e.id,
                    e.user_id,
                    p.name        AS author_name,
                    p.username    AS author_username,
                    p.avatar_url  AS author_avatar,
                    e.event_type,
                    e.title,
                    e.body,
                    e.photo_url,
                    e.metadata,
                    e.hype_count,
                    e.created_at,
                    EXISTS(
                        SELECT 1 FROM feed_post_hypes h
                        WHERE h.post_id = e.id AND h.user_id = $1
                    ) AS i_hyped
                FROM social_feed_events e
                JOIN profiles p ON p.id = e.user_id
                WHERE
                    e.user_id = $1
                    OR e.user_id IN (
                        SELECT following_id FROM user_follows WHERE follower_id = $1
                    )
                ORDER BY e.created_at DESC
                LIMIT $2 OFFSET $3
                """,
                uid, limit, offset,
            )

        posts = []
        for r in rows:
            import json
            meta = r["metadata"]
            if isinstance(meta, str):
                meta = json.loads(meta)
            posts.append({
                "id": str(r["id"]),
                "user_id": str(r["user_id"]),
                "author_name": r["author_name"],
                "author_username": r["author_username"],
                "author_avatar": r["author_avatar"],
                "event_type": r["event_type"],
                "title": r["title"],
                "body": r["body"],
                "photo_url": r["photo_url"],
                "metadata": meta or {},
                "hype_count": r["hype_count"],
                "created_at": r["created_at"].isoformat(),
                "i_hyped": bool(r["i_hyped"]),
            })

        return {"posts": posts, "count": len(posts)}

    # ── Hype ────────────────────────────────────────────────────────

    async def toggle_hype(self, user_id: str, post_id: str) -> Dict[str, Any]:
        uid = to_uuid(user_id)
        pid = to_uuid(post_id)

        async with self.pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT 1 FROM feed_post_hypes WHERE post_id=$1 AND user_id=$2",
                pid, uid,
            )
            if existing:
                await conn.execute(
                    "DELETE FROM feed_post_hypes WHERE post_id=$1 AND user_id=$2",
                    pid, uid,
                )
                new_count = await conn.fetchval(
                    "UPDATE social_feed_events SET hype_count = GREATEST(0, hype_count-1) WHERE id=$1 RETURNING hype_count",
                    pid,
                )
                return {"hyped": False, "hype_count": new_count or 0}
            else:
                await conn.execute(
                    "INSERT INTO feed_post_hypes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
                    pid, uid,
                )
                new_count = await conn.fetchval(
                    "UPDATE social_feed_events SET hype_count = hype_count+1 WHERE id=$1 RETURNING hype_count",
                    pid,
                )
                return {"hyped": True, "hype_count": new_count or 1}

    # ── Auto-create from badge check ────────────────────────────────

    async def create_badge_post(self, user_id: str, badge: Dict[str, Any]) -> None:
        """Called after badge check to auto-publish an achievement post."""
        tier = badge.get("tier", 1)
        tier_label = {1: "Bronze", 2: "Silver", 3: "Gold"}.get(tier, "")
        title = f"Earned the {badge.get('name') or badge.get('title', 'badge')} badge"
        body = badge.get("description", "")
        await self.create_post(
            user_id=user_id,
            event_type="badge",
            title=title,
            body=body,
            metadata={
                "badge_id": badge.get("id"),
                "badge_icon": badge.get("icon"),
                "badge_name": badge.get("name") or badge.get("title"),
                "badge_tier": tier,
                "tier_label": tier_label,
                "xp": badge.get("xp", 0),
            },
        )
