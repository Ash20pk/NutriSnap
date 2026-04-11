"""
Analytics routes for nutrition insights and AI-powered analytics.
"""

from fastapi import APIRouter, Depends, Query

from app.services.analytics_service import AnalyticsService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/analytics", tags=["analytics"])


def get_analytics_service() -> AnalyticsService:
    """Dependency to get analytics service instance."""
    pool = get_pool()
    return AnalyticsService(pool)


@router.get("/{user_id}")
async def get_analytics(
    user_id: str,
    time_range: str = Query("week", pattern="^(daily|week|month|year)$"),
    force_refresh: bool = False,
    uid: str = Depends(get_current_uid),
    service: AnalyticsService = Depends(get_analytics_service)
):
    """
    Get cached analytics for a user.
    
    Args:
        user_id: User UUID
        time_range: Time range for analytics (week, month, year)
        force_refresh: Force refresh even if cache is valid
        uid: Current user ID (from auth)
        service: Analytics service instance
    
    Returns:
        Analytics data with insights, bio_impact, health_insights, etc.
    """
    require_user_match(uid, user_id)
    return await service.get_analytics(user_id, time_range, force_refresh)


@router.get("/{user_id}/bundle")
async def get_analytics_bundle(
    user_id: str,
    time_range: str = Query("week", pattern="^(daily|week|month|year)$"),
    timezone_offset: int = Query(0),
    include_daily_ai: bool = Query(False),
    uid: str = Depends(get_current_uid),
    service: AnalyticsService = Depends(get_analytics_service)
):
    """
    Get meals and analytics together in one call.
    
    Args:
        user_id: User UUID
        time_range: Time range for analytics (week, month, year)
        timezone_offset: Timezone offset in minutes
        uid: Current user ID (from auth)
        service: Analytics service instance
    
    Returns:
        Dictionary with meals, analytics, and micronutrient targets
    """
    require_user_match(uid, user_id)
    # get_analytics_bundle already includes daily_ai when time_range=week and cache is valid
    # No need to call get_analytics separately - it would overwrite with potentially stale data
    return await service.get_analytics_bundle(user_id, time_range, timezone_offset)


@router.post("/{user_id}/refresh")
async def refresh_analytics(
    user_id: str,
    time_range: str = Query("week", pattern="^(daily|week|month|year)$"),
    timezone_offset: int = Query(0),
    uid: str = Depends(get_current_uid),
    service: AnalyticsService = Depends(get_analytics_service)
):
    """
    Force refresh analytics by generating new AI insights.
    
    Args:
        user_id: User UUID
        time_range: Time range for analytics (week, month, year)
        timezone_offset: Timezone offset in minutes
        uid: Current user ID (from auth)
        service: Analytics service instance
    
    Returns:
        Newly generated analytics data
    """
    require_user_match(uid, user_id)
    return await service.refresh_analytics(user_id, time_range, timezone_offset)
