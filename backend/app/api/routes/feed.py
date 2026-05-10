"""
Feed routes — create posts, read feed, toggle hype.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional

from app.services.feed_service import FeedService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid

router = APIRouter(prefix="/feed", tags=["feed"])


def get_feed_service() -> FeedService:
    pool = get_pool()
    return FeedService(pool)


class CreatePostRequest(BaseModel):
    event_type: str          # photo | badge | streak | goal | xp_level
    title: str
    body: Optional[str] = None
    photo_url: Optional[str] = None
    metadata: Optional[dict] = None


@router.get("")
async def get_feed(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    """Get the social feed (self + following), newest first."""
    return await service.get_feed(uid, limit=limit, offset=offset)


@router.post("")
async def create_post(
    body: CreatePostRequest,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    """Create a new feed post (photo, badge share, milestone)."""
    return await service.create_post(
        user_id=uid,
        event_type=body.event_type,
        title=body.title,
        body=body.body,
        photo_url=body.photo_url,
        metadata=body.metadata,
    )


@router.post("/{post_id}/hype")
async def toggle_hype(
    post_id: str,
    uid: str = Depends(get_current_uid),
    service: FeedService = Depends(get_feed_service),
):
    """Toggle hype reaction on a post."""
    return await service.toggle_hype(uid, post_id)
