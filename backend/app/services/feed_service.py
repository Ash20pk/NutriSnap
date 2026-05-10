"""
Feed service — scalable social graph: posts, reactions, comments, notifications.

Feed strategy: pull-on-read (fan-out on read).
Swap to fan-out on write at ~50k DAU by precomputing a timeline table.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class FeedService:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    # ── Feed ────────────────────────────────────────────────────────────────

    async def get_feed(
        self,
        user_id: str,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Pull-on-read: posts from self + following, newest first.
        cursor = created_at ISO string of the oldest post on the last page.
        """
        uid = to_uuid(user_id)
        cursor_ts = datetime.fromisoformat(cursor) if cursor else datetime.now(timezone.utc)

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    p.id,
                    p.user_id,
                    p.post_type,
                    p.caption,
                    p.metadata,
                    p.reaction_count,
                    p.comment_count,
                    p.created_at,
                    pr.name          AS author_name,
                    pr.username      AS author_username,
                    COALESCE(
                        JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id',         pm.id::text,
                                'media_url',  pm.media_url,
                                'media_type', pm.media_type,
                                'width',      pm.width,
                                'height',     pm.height,
                                'sort_order', pm.sort_order
                            ) ORDER BY pm.sort_order
                        ) FILTER (WHERE pm.id IS NOT NULL),
                        '[]'::json
                    )                AS media,
                    EXISTS(
                        SELECT 1 FROM post_reactions r2
                        WHERE r2.post_id = p.id AND r2.user_id = $1
                    )                AS i_reacted,
                    (
                        SELECT JSON_BUILD_OBJECT(
                            'id',          c.id::text,
                            'author_name', cp.name,
                            'body',        c.body
                        )
                        FROM post_comments c
                        JOIN profiles cp ON cp.id = c.user_id
                        WHERE c.post_id = p.id AND c.deleted_at IS NULL
                        ORDER BY c.created_at ASC
                        LIMIT 1
                    )                AS first_comment
                FROM posts p
                JOIN profiles pr ON pr.id = p.user_id
                LEFT JOIN post_media pm ON pm.post_id = p.id
                WHERE p.deleted_at IS NULL
                  AND p.created_at < $2
                  AND (
                      p.user_id = $1
                      OR p.user_id IN (
                          SELECT following_id FROM user_follows WHERE follower_id = $1
                      )
                  )
                GROUP BY p.id, pr.name, pr.username
                ORDER BY p.created_at DESC
                LIMIT $3
                """,
                uid, cursor_ts, limit,
            )

        posts = [self._row_to_post(r) for r in rows]
        next_cursor = posts[-1]["created_at"] if len(posts) == limit else None
        return {"posts": posts, "next_cursor": next_cursor}

    async def get_user_posts(
        self,
        user_id: str,
        requester_id: str,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        uid = to_uuid(user_id)
        rid = to_uuid(requester_id)
        cursor_ts = datetime.fromisoformat(cursor) if cursor else datetime.now(timezone.utc)

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    p.id, p.user_id, p.post_type, p.caption, p.metadata,
                    p.reaction_count, p.comment_count, p.created_at,
                    pr.name AS author_name, pr.username AS author_username,
                    COALESCE(
                        JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id', pm.id::text, 'media_url', pm.media_url,
                                'media_type', pm.media_type, 'width', pm.width,
                                'height', pm.height, 'sort_order', pm.sort_order
                            ) ORDER BY pm.sort_order
                        ) FILTER (WHERE pm.id IS NOT NULL), '[]'::json
                    ) AS media,
                    EXISTS(
                        SELECT 1 FROM post_reactions r2
                        WHERE r2.post_id = p.id AND r2.user_id = $2
                    ) AS i_reacted,
                    NULL::json AS first_comment
                FROM posts p
                JOIN profiles pr ON pr.id = p.user_id
                LEFT JOIN post_media pm ON pm.post_id = p.id
                WHERE p.deleted_at IS NULL
                  AND p.user_id = $1
                  AND p.created_at < $3
                GROUP BY p.id, pr.name, pr.username
                ORDER BY p.created_at DESC
                LIMIT $4
                """,
                uid, rid, cursor_ts, limit,
            )

        posts = [self._row_to_post(r) for r in rows]
        next_cursor = posts[-1]["created_at"] if len(posts) == limit else None
        return {"posts": posts, "next_cursor": next_cursor}

    # ── Create / Delete Post ────────────────────────────────────────────────

    async def create_post(
        self,
        user_id: str,
        post_type: str,
        caption: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        media_url: Optional[str] = None,
        media_type: str = "image",
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> Dict[str, Any]:
        meta_json = json.dumps(metadata or {})
        uid = to_uuid(user_id)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    INSERT INTO posts (user_id, post_type, caption, metadata)
                    VALUES ($1, $2, $3, $4::jsonb)
                    RETURNING id, created_at
                    """,
                    uid, post_type, caption, meta_json,
                )
                post_id = row["id"]
                if media_url:
                    await conn.execute(
                        """
                        INSERT INTO post_media (post_id, media_url, media_type, width, height)
                        VALUES ($1, $2, $3, $4, $5)
                        """,
                        post_id, media_url, media_type, width, height,
                    )

        return {"post_id": str(post_id), "created_at": row["created_at"].isoformat()}

    async def delete_post(self, user_id: str, post_id: str) -> Dict[str, bool]:
        uid = to_uuid(user_id)
        pid = to_uuid(post_id)
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE posts SET deleted_at=NOW() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
                pid, uid,
            )
        return {"deleted": result == "UPDATE 1"}

    # ── Reactions ───────────────────────────────────────────────────────────

    async def toggle_reaction(
        self,
        user_id: str,
        post_id: str,
        reaction_type: str = "hype",
    ) -> Dict[str, Any]:
        uid = to_uuid(user_id)
        pid = to_uuid(post_id)

        async with self.pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT 1 FROM post_reactions WHERE post_id=$1 AND user_id=$2 AND reaction_type=$3",
                pid, uid, reaction_type,
            )
            if existing:
                await conn.execute(
                    "DELETE FROM post_reactions WHERE post_id=$1 AND user_id=$2 AND reaction_type=$3",
                    pid, uid, reaction_type,
                )
                new_count = await conn.fetchval(
                    "UPDATE posts SET reaction_count=GREATEST(0,reaction_count-1) WHERE id=$1 RETURNING reaction_count",
                    pid,
                )
                return {"reacted": False, "reaction_count": new_count or 0}
            else:
                await conn.execute(
                    "INSERT INTO post_reactions (post_id,user_id,reaction_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                    pid, uid, reaction_type,
                )
                new_count = await conn.fetchval(
                    "UPDATE posts SET reaction_count=reaction_count+1 WHERE id=$1 RETURNING reaction_count",
                    pid,
                )
                try:
                    post_owner = await conn.fetchval("SELECT user_id FROM posts WHERE id=$1", pid)
                    if post_owner and post_owner != uid:
                        await conn.execute(
                            """
                            INSERT INTO notifications (recipient_id,actor_id,notif_type,post_id)
                            VALUES ($1,$2,'reaction',$3)
                            """,
                            post_owner, uid, pid,
                        )
                except Exception:
                    pass
                return {"reacted": True, "reaction_count": new_count or 1}

    # ── Comments ────────────────────────────────────────────────────────────

    async def get_comments(
        self,
        post_id: str,
        requester_id: str,
        limit: int = 30,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Top-level comments only (parent_id IS NULL). Each row includes reply_count and like state."""
        pid = to_uuid(post_id)
        uid = to_uuid(requester_id)
        cursor_ts = (
            datetime.fromisoformat(cursor) if cursor
            else datetime(1970, 1, 1, tzinfo=timezone.utc)
        )

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    c.id, c.post_id, c.user_id, c.body, c.created_at,
                    c.reply_count,
                    pr.name AS author_name, pr.username AS author_username,
                    COUNT(cr.user_id)      AS like_count,
                    EXISTS(
                        SELECT 1 FROM comment_reactions cr2
                        WHERE cr2.comment_id = c.id AND cr2.user_id = $2
                    )                      AS i_liked
                FROM post_comments c
                JOIN profiles pr ON pr.id = c.user_id
                LEFT JOIN comment_reactions cr ON cr.comment_id = c.id
                WHERE c.post_id = $1
                  AND c.parent_id IS NULL
                  AND c.deleted_at IS NULL
                  AND c.created_at > $3
                GROUP BY c.id, pr.name, pr.username
                ORDER BY c.created_at ASC
                LIMIT $4
                """,
                pid, uid, cursor_ts, limit,
            )

        comments = [self._row_to_comment(r) for r in rows]
        next_cursor = comments[-1]["created_at"] if len(comments) == limit else None
        return {"comments": comments, "next_cursor": next_cursor}

    async def get_replies(
        self,
        comment_id: str,
        requester_id: str,
    ) -> Dict[str, Any]:
        """All replies for a parent comment, oldest first."""
        cid = to_uuid(comment_id)
        uid = to_uuid(requester_id)

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    c.id, c.post_id, c.user_id, c.body, c.created_at,
                    c.reply_count,
                    pr.name AS author_name, pr.username AS author_username,
                    COUNT(cr.user_id)      AS like_count,
                    EXISTS(
                        SELECT 1 FROM comment_reactions cr2
                        WHERE cr2.comment_id = c.id AND cr2.user_id = $2
                    )                      AS i_liked
                FROM post_comments c
                JOIN profiles pr ON pr.id = c.user_id
                LEFT JOIN comment_reactions cr ON cr.comment_id = c.id
                WHERE c.parent_id = $1 AND c.deleted_at IS NULL
                GROUP BY c.id, pr.name, pr.username
                ORDER BY c.created_at ASC
                """,
                cid, uid,
            )

        return {"replies": [self._row_to_comment(r) for r in rows]}

    async def create_comment(
        self,
        user_id: str,
        post_id: str,
        body: str,
        parent_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        uid = to_uuid(user_id)
        pid = to_uuid(post_id)
        par = to_uuid(parent_id) if parent_id else None

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "INSERT INTO post_comments (user_id,post_id,body,parent_id) VALUES ($1,$2,$3,$4) RETURNING id,created_at",
                    uid, pid, body, par,
                )
                comment_id = row["id"]

                if par:
                    # Increment parent's reply_count
                    await conn.execute(
                        "UPDATE post_comments SET reply_count=reply_count+1 WHERE id=$1", par,
                    )
                else:
                    await conn.execute(
                        "UPDATE posts SET comment_count=comment_count+1 WHERE id=$1", pid,
                    )

                try:
                    post_owner = await conn.fetchval("SELECT user_id FROM posts WHERE id=$1", pid)
                    if post_owner and post_owner != uid:
                        await conn.execute(
                            """
                            INSERT INTO notifications (recipient_id,actor_id,notif_type,post_id,comment_id)
                            VALUES ($1,$2,'comment',$3,$4)
                            """,
                            post_owner, uid, pid, comment_id,
                        )
                    if par:
                        parent_owner = await conn.fetchval(
                            "SELECT user_id FROM post_comments WHERE id=$1", par,
                        )
                        if parent_owner and parent_owner != uid and parent_owner != post_owner:
                            await conn.execute(
                                """
                                INSERT INTO notifications (recipient_id,actor_id,notif_type,post_id,comment_id)
                                VALUES ($1,$2,'comment',$3,$4)
                                """,
                                parent_owner, uid, pid, comment_id,
                            )
                except Exception:
                    pass

            author = await conn.fetchrow("SELECT name,username FROM profiles WHERE id=$1", uid)

        return {
            "id": str(comment_id),
            "post_id": post_id,
            "user_id": user_id,
            "author_name": author["name"] if author else "",
            "author_username": author["username"] if author else None,
            "body": body,
            "created_at": row["created_at"].isoformat(),
            "parent_id": parent_id,
            "reply_count": 0,
            "like_count": 0,
            "i_liked": False,
        }

    async def delete_comment(self, user_id: str, comment_id: str) -> Dict[str, bool]:
        uid = to_uuid(user_id)
        cid = to_uuid(comment_id)
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT post_id, parent_id FROM post_comments WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
                    cid, uid,
                )
                if not row:
                    return {"deleted": False}
                await conn.execute("UPDATE post_comments SET deleted_at=NOW() WHERE id=$1", cid)
                if row["parent_id"]:
                    await conn.execute(
                        "UPDATE post_comments SET reply_count=GREATEST(0,reply_count-1) WHERE id=$1",
                        row["parent_id"],
                    )
                else:
                    await conn.execute(
                        "UPDATE posts SET comment_count=GREATEST(0,comment_count-1) WHERE id=$1",
                        row["post_id"],
                    )
        return {"deleted": True}

    async def toggle_comment_reaction(self, user_id: str, comment_id: str) -> Dict[str, Any]:
        uid = to_uuid(user_id)
        cid = to_uuid(comment_id)

        async with self.pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT 1 FROM comment_reactions WHERE comment_id=$1 AND user_id=$2",
                cid, uid,
            )
            if existing:
                await conn.execute(
                    "DELETE FROM comment_reactions WHERE comment_id=$1 AND user_id=$2", cid, uid,
                )
                like_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM comment_reactions WHERE comment_id=$1", cid,
                )
                return {"liked": False, "like_count": int(like_count or 0)}
            else:
                await conn.execute(
                    "INSERT INTO comment_reactions (comment_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
                    cid, uid,
                )
                like_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM comment_reactions WHERE comment_id=$1", cid,
                )
                return {"liked": True, "like_count": int(like_count or 0)}

    # ── Auto-publish from badge check ───────────────────────────────────────

    async def create_badge_post(self, user_id: str, badge: Dict[str, Any]) -> None:
        tier = badge.get("tier", 1)
        tier_label = {1: "Bronze", 2: "Silver", 3: "Gold"}.get(tier, "")
        name = badge.get("name") or badge.get("title", "badge")
        caption = f"Just earned the {name} {tier_label} badge! 🏅"
        if badge.get("description"):
            caption += f"\n{badge['description']}"
        await self.create_post(
            user_id=user_id,
            post_type="badge",
            caption=caption,
            metadata={
                "badge_id": badge.get("id"),
                "badge_icon": badge.get("icon"),
                "badge_name": name,
                "badge_tier": tier,
                "tier_label": tier_label,
                "xp": badge.get("xp", 0),
            },
        )

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _row_to_comment(self, r: asyncpg.Record) -> Dict[str, Any]:
        return {
            "id": str(r["id"]),
            "post_id": str(r["post_id"]),
            "user_id": str(r["user_id"]),
            "author_name": r["author_name"],
            "author_username": r["author_username"],
            "body": r["body"],
            "created_at": r["created_at"].isoformat(),
            "parent_id": str(r["parent_id"]) if r.get("parent_id") else None,
            "reply_count": int(r.get("reply_count") or 0),
            "like_count": int(r.get("like_count") or 0),
            "i_liked": bool(r.get("i_liked") or False),
        }

    def _row_to_post(self, r: asyncpg.Record) -> Dict[str, Any]:
        meta = r["metadata"]
        if isinstance(meta, str):
            meta = json.loads(meta)
        media = r["media"]
        if isinstance(media, str):
            media = json.loads(media)
        first_comment = r.get("first_comment")
        if isinstance(first_comment, str):
            first_comment = json.loads(first_comment)
        return {
            "id": str(r["id"]),
            "user_id": str(r["user_id"]),
            "author_name": r["author_name"],
            "author_username": r["author_username"],
            "post_type": r["post_type"],
            "caption": r["caption"],
            "media": media or [],
            "metadata": meta or {},
            "reaction_count": r["reaction_count"],
            "comment_count": r["comment_count"],
            "created_at": r["created_at"].isoformat(),
            "i_reacted": bool(r["i_reacted"]),
            "first_comment": first_comment,
        }
