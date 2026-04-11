"""
Admin routes for managing label submissions and reviews.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.admin_service import AdminService
from app.db.pool import get_pool
from app.core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_service() -> AdminService:
    """Dependency to get admin service instance."""
    pool = get_pool()
    return AdminService(pool)


def verify_admin_key(admin_key: str = Header(None, alias="X-Admin-Key")) -> str:
    """Verify admin API key."""
    if not admin_key or admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return admin_key


# Pydantic models
class ApproveLabelReviewRequest(BaseModel):
    submission_id: str
    action: str  # 'approve' or 'reject'
    admin_id: str
    notes: Optional[str] = None


@router.get("/label-reviews")
async def list_label_reviews(
    status: str = "pending",
    limit: int = 50,
    admin_key: str = Depends(verify_admin_key),
    service: AdminService = Depends(get_admin_service)
):
    """
    List food label submissions for review.
    
    Args:
        status: Filter by status (pending, approved, rejected)
        limit: Maximum number of results
        admin_key: Admin API key (from header)
        service: Admin service instance
    
    Returns:
        Dictionary with submissions list and count
    """
    return await service.list_label_reviews(status, limit)


@router.post("/label-reviews/action")
async def approve_label_review(
    payload: ApproveLabelReviewRequest,
    admin_key: str = Depends(verify_admin_key),
    service: AdminService = Depends(get_admin_service)
):
    """
    Approve or reject a label submission.
    
    Args:
        payload: Review action request
        admin_key: Admin API key (from header)
        service: Admin service instance
    
    Returns:
        Dictionary with updated submission status
    """
    return await service.approve_label_review(
        submission_id=payload.submission_id,
        admin_id=payload.admin_id,
        action=payload.action,
        admin_notes=payload.notes
    )


@router.get("/stats")
async def get_admin_stats(
    admin_key: str = Depends(verify_admin_key),
    service: AdminService = Depends(get_admin_service)
):
    """
    Get admin dashboard statistics.
    
    Args:
        admin_key: Admin API key (from header)
        service: Admin service instance
    
    Returns:
        Dictionary with various admin stats
    """
    return await service.get_admin_stats()
