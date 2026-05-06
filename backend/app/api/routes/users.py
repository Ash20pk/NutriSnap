"""
User profile routes for profile management, goals, and weight tracking.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import date

from app.services.profile_service import ProfileService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/user", tags=["users"])


def get_profile_service() -> ProfileService:
    """Dependency to get profile service instance."""
    pool = get_pool()
    return ProfileService(pool)


# Pydantic models for request/response
class OnboardingRequest(BaseModel):
    name: str
    date_of_birth: str
    gender: str
    height: float
    weight: float
    goal: str
    activity_level: str
    dietary_preference: str


class GoalsUpdateRequest(BaseModel):
    goal: str
    activity_level: str


class ProfileUpdateRequest(BaseModel):
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    name: Optional[str] = None


class WeightCheckRequest(BaseModel):
    weight: float
    notes: Optional[str] = None


class UsernameUpdateRequest(BaseModel):
    username: str


@router.post("/onboard")
async def onboard_user(
    user_data: OnboardingRequest,
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Create or update user profile during onboarding.
    
    Args:
        user_data: Onboarding data including name, DOB, goals, etc.
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        Created/updated user profile
    """
    return await service.onboard_user(
        uid=uid,
        name=user_data.name,
        date_of_birth=user_data.date_of_birth,
        gender=user_data.gender,
        height=user_data.height,
        weight=user_data.weight,
        goal=user_data.goal,
        activity_level=user_data.activity_level,
        dietary_preference=user_data.dietary_preference
    )


@router.get("/me")
async def get_me(
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Get current user's profile.
    
    Args:
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        User profile
    """
    return await service.get_profile(uid)


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Get user profile by ID.
    
    Args:
        user_id: User UUID
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        User profile
    """
    require_user_match(uid, user_id)
    return await service.get_profile(user_id)


@router.put("/me/profile")
async def update_my_profile(
    payload: ProfileUpdateRequest,
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Update current user's profile (bio, avatar).
    
    Args:
        payload: Profile update data
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        Updated user profile
    """
    return await service.update_profile(
        uid=uid,
        bio=payload.bio,
        avatar_url=payload.avatar_url,
        name=payload.name,
    )


@router.put("/{user_id}/goals")
async def update_goals(
    user_id: str,
    payload: GoalsUpdateRequest,
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Update user goals and recalculate nutrition targets.
    
    Args:
        user_id: User UUID
        payload: Goals update data
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        Updated user profile with new targets
    """
    require_user_match(uid, user_id)
    return await service.update_goals(
        user_id=user_id,
        goal=payload.goal,
        activity_level=payload.activity_level
    )


@router.post("/me/weight-check")
async def record_weight_check(
    payload: WeightCheckRequest,
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Record monthly weight check and update profile.
    
    Args:
        payload: Weight check data
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        Updated user profile
    """
    return await service.record_weight_check(
        uid=uid,
        weight=payload.weight,
        notes=payload.notes
    )


@router.get("/me/weight-history")
async def get_weight_history(
    limit: int = Query(12, ge=1, le=100),
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Get user's weight history.
    
    Args:
        limit: Maximum number of entries to return
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        List of weight history entries
    """
    return await service.get_weight_history(uid, limit)


@router.delete("/me")
async def delete_my_account(
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Permanently delete the current user's account and all associated data.

    Args:
        uid: Current user ID (from auth)
        service: Profile service instance

    Returns:
        Confirmation message
    """
    return await service.delete_account(uid)


@router.post("/me/username")
async def set_my_username(
    payload: UsernameUpdateRequest,
    uid: str = Depends(get_current_uid),
    service: ProfileService = Depends(get_profile_service)
):
    """
    Set or update user's username.
    
    Args:
        payload: Username update data
        uid: Current user ID (from auth)
        service: Profile service instance
    
    Returns:
        Dictionary with user_id and username
    """
    return await service.set_username(
        uid=uid,
        username=payload.username
    )
