"""
Label processing routes for AI-powered nutrition label extraction.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional

from app.services.label_service import LabelService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/foods", tags=["labels"])


def get_label_service() -> LabelService:
    """Dependency to get label service instance."""
    pool = get_pool()
    return LabelService(pool)


# Pydantic models
class ProcessLabelRequest(BaseModel):
    user_id: str
    barcode: str
    image_base64: Optional[str] = None
    images_base64: Optional[List[str]] = None
    front_image_base64: Optional[str] = None


class FoodHealthCheckRequest(BaseModel):
    user_id: str
    barcode: str


@router.post("/process-label")
async def process_label_image(
    payload: ProcessLabelRequest,
    uid: str = Depends(get_current_uid),
    service: LabelService = Depends(get_label_service)
):
    """
    Process nutrition label images with AI to extract data and perform health check.
    
    Flow:
    1. Extract nutrition data from images using AI
    2. Save extracted food to database (for review)
    3. Run health check analysis on extracted data
    4. Return both food and health check results
    
    Args:
        payload: Label processing request
        uid: Current user ID (from auth)
        service: Label service instance
    
    Returns:
        Dictionary with extracted food data and health analysis
    """
    require_user_match(uid, payload.user_id)
    
    # Normalize images input
    images_b64: List[str] = []
    if payload.images_base64:
        images_b64 = [str(x or "").strip() for x in payload.images_base64 if str(x or "").strip()]
    elif payload.image_base64:
        images_b64 = [str(payload.image_base64 or "").strip()]
    
    return await service.process_label(
        user_id=payload.user_id,
        barcode=payload.barcode,
        images_base64=images_b64,
        front_image_base64=payload.front_image_base64
    )


@router.post("/health-check")
async def food_health_check(
    payload: FoodHealthCheckRequest,
    uid: str = Depends(get_current_uid),
    service: LabelService = Depends(get_label_service)
):
    """
    AI health check for a packaged food by barcode.
    
    Analyzes ingredients and nutrition to identify health concerns like:
    - Ultra-processed ingredients
    - Excessive sugar/sodium
    - Artificial additives
    - Trans fats
    - Other concerning ingredients
    
    Args:
        payload: Health check request
        uid: Current user ID (from auth)
        service: Label service instance
    
    Returns:
        Dictionary with health analysis and flags
    """
    require_user_match(uid, payload.user_id)
    return await service.health_check(payload.user_id, payload.barcode)
