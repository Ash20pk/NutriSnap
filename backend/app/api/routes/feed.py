"""
Feed routes — posts, reactions, comments.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional

from app.services.feed_service import FeedService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid

router = APIRouter(prefix="/feed", tags=["feed"])


def get_feed_service() -> FeedService:
    return FeedService(get_pool())


# ── Request models ──────────────────────────────────────────────────────────

class CreatePostRequest(BaseModel):
    post_type: str = Field(..., pattern="^(photo|badge|streak|goal|xp_level)$")
    caption: Optional[str] = Field(None, max_length=2200)
    media_url: Optional[str] = None
    media_type: str = "image"
    width: Optional[int] = None
    height: Optional[int] = None
    metadata: Optional[dict] = None


class CreateCommentRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=2200)
    parent_id: Optional[str] = None


# ── Feed ────────────────────────────────────────────────────────────────────

@router.get("")
async def get_feed(
    limit: int = Query(20, ge=1, le=50),
    cursor: Optional[str] = Query(None, description="ISO timestamp — fetch posts older than this"),
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.get_feed(uid, limit=limit, cursor=cursor)


@router.post("")
async def create_post(
    body: CreatePostRequest,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.create_post(
        user_id=uid,
        post_type=body.post_type,
        caption=body.caption,
        metadata=body.metadata,
        media_url=body.media_url,
        media_type=body.media_type,
        width=body.width,
        height=body.height,
    )


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.delete_post(uid, post_id)


# ── Reactions ───────────────────────────────────────────────────────────────

@router.post("/{post_id}/react")
async def toggle_reaction(
    post_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.toggle_reaction(uid, post_id)


# Legacy compat — old clients calling /hype still work
@router.post("/{post_id}/hype")
async def toggle_hype_compat(
    post_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    result = await service.toggle_reaction(uid, post_id)
    return {"hyped": result["reacted"], "hype_count": result["reaction_count"]}


# ── Comments ────────────────────────────────────────────────────────────────

@router.get("/{post_id}/comments")
async def get_comments(
    post_id: str,
    limit: int = Query(30, ge=1, le=100),
    cursor: Optional[str] = Query(None),
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.get_comments(post_id, requester_id=uid, limit=limit, cursor=cursor)


@router.post("/{post_id}/comments")
async def create_comment(
    post_id: str,
    body: CreateCommentRequest,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.create_comment(uid, post_id, body.body, parent_id=body.parent_id)


@router.delete("/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.delete_comment(uid, comment_id)


@router.get("/{post_id}/comments/{comment_id}/replies")
async def get_replies(
    post_id: str,
    comment_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.get_replies(comment_id, requester_id=uid)


@router.post("/{post_id}/comments/{comment_id}/react")
async def toggle_comment_reaction(
    post_id: str,
    comment_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    return await service.toggle_comment_reaction(uid, comment_id)
