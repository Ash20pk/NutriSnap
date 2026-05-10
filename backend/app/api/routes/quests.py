"""
Quest routes for gamification features.
"""

from fastapi import APIRouter, Depends, Query

from app.services.quest_service import QuestService
from app.services.feed_service import FeedService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/quests", tags=["quests"])


def get_quest_service() -> QuestService:
    pool = get_pool()
    return QuestService(pool)


def get_feed_service() -> FeedService:
    pool = get_pool()
    return FeedService(pool)


@router.get("/{user_id}/daily")
async def get_daily_quests(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service)
):
    """
    Get user's daily quests with current progress.
    
    Args:
        user_id: User UUID
        uid: Current user ID (from auth)
        service: Quest service instance
    
    Returns:
        Dictionary with quests list and date
    """
    require_user_match(uid, user_id)
    return await service.get_daily_quests(user_id)


@router.post("/{user_id}/claim/{quest_id}")
async def claim_quest_xp(
    user_id: str,
    quest_id: str,
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service)
):
    """
    Claim XP reward for a completed quest.
    
    Args:
        user_id: User UUID
        quest_id: Quest UUID
        uid: Current user ID (from auth)
        service: Quest service instance
    
    Returns:
        Dictionary with XP earned and updated stats
    """
    require_user_match(uid, user_id)
    return await service.claim_quest_xp(user_id, quest_id)


@router.get("/{user_id}/badges")
async def get_user_badges(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service)
):
    """
    Get user's badges (earned and available).
    
    Args:
        user_id: User UUID
        uid: Current user ID (from auth)
        service: Quest service instance
    
    Returns:
        Dictionary with badges list
    """
    return await service.get_user_badges(user_id)


@router.get("/{user_id}/stats")
async def get_quest_stats(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service)
):
    """
    Get user's XP, level, streak, and quest stats.
    
    Args:
        user_id: User UUID
        uid: Current user ID (from auth)
        service: Quest service instance
    
    Returns:
        Dictionary with XP, level, streak, and quest stats
    """
    require_user_match(uid, user_id)
    return await service.get_quest_stats(user_id)


@router.get("/leaderboard")
async def get_leaderboard(
    scope: str = Query("global", pattern="^(global|friends)$"),
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service)
):
    """
    Get the XP leaderboard.

    scope='global' → all users ranked by XP.
    scope='friends' → followed users + self.
    """
    return await service.get_leaderboard(requester_uid=uid, scope=scope)


@router.get("/{user_id}/streak-calendar")
async def get_streak_calendar(
    user_id: str,
    days: int = Query(90, ge=7, le=366),
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service)
):
    """
    Return a day-by-day activity log for the streak calendar UI.
    """
    require_user_match(uid, user_id)
    return await service.get_streak_calendar(user_id, days)


@router.post("/{user_id}/check-badges")
async def check_badges(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: QuestService = Depends(get_quest_service),
    feed_service: FeedService = Depends(get_feed_service),
):
    """
    Check if the user has earned any new badges and award XP.
    Auto-publishes a feed post for each newly earned badge.
    """
    require_user_match(uid, user_id)
    result = await service.check_badges(user_id)
    for badge in result.get("newly_earned", []):
        try:
            await feed_service.create_badge_post(user_id, badge)
        except Exception:
            pass  # never fail the badge check due to feed errors
    return result
