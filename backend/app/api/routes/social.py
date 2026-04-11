"""
Social routes for user interactions.
"""

from fastapi import APIRouter, Depends, Query

from app.services.social_service import SocialService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/users", tags=["social"])


def get_social_service() -> SocialService:
    """Dependency to get social service instance."""
    pool = get_pool()
    return SocialService(pool)


@router.get("/search")
async def search_users(
    query: str = Query("", min_length=1, max_length=32),
    uid: str = Depends(get_current_uid),
    service: SocialService = Depends(get_social_service)
):
    """
    Search for users by name or username.
    
    Args:
        query: Search query string
        uid: Current user ID (from auth)
        service: Social service instance
    
    Returns:
        Dictionary with search results
    """
    return await service.search_users(query, uid)


@router.post("/{target_user_id}/follow")
async def follow_user(
    target_user_id: str,
    uid: str = Depends(get_current_uid),
    service: SocialService = Depends(get_social_service)
):
    """
    Follow a user.
    
    Args:
        target_user_id: ID of user to follow
        uid: Current user ID (from auth)
        service: Social service instance
    
    Returns:
        Success dictionary
    """
    return await service.follow_user(uid, target_user_id)


@router.delete("/{target_user_id}/follow")
async def unfollow_user(
    target_user_id: str,
    uid: str = Depends(get_current_uid),
    service: SocialService = Depends(get_social_service)
):
    """
    Unfollow a user.
    
    Args:
        target_user_id: ID of user to unfollow
        uid: Current user ID (from auth)
        service: Social service instance
    
    Returns:
        Success dictionary
    """
    return await service.unfollow_user(uid, target_user_id)


@router.get("/me/following")
async def list_following(
    uid: str = Depends(get_current_uid),
    service: SocialService = Depends(get_social_service)
):
    """
    Get list of users that the current user is following.
    
    Args:
        uid: Current user ID (from auth)
        service: Social service instance
    
    Returns:
        Dictionary with following list
    """
    return await service.list_following(uid)


@router.get("/me/followers")
async def list_followers(
    uid: str = Depends(get_current_uid),
    service: SocialService = Depends(get_social_service)
):
    """
    Get list of users following the current user.
    
    Args:
        uid: Current user ID (from auth)
        service: Social service instance
    
    Returns:
        Dictionary with followers list
    """
    return await service.list_followers(uid)


@router.get("/{user_id}/public-stats")
async def get_public_user_stats(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: SocialService = Depends(get_social_service)
):
    """
    Get public-facing stats for profile/leaderboard.
    
    Args:
        user_id: User UUID to get stats for
        uid: Current user ID (from auth)
        service: Social service instance
    
    Returns:
        Dictionary with public user stats
    """
    return await service.get_public_user_stats(user_id, uid)
