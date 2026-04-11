"""
AI meal routes for photo, voice, and text-based meal logging.
"""

from fastapi import APIRouter, Depends, Form, File, UploadFile
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.ai_meal_service import AIMealService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match

router = APIRouter(prefix="/meals", tags=["ai_meals"])


def get_ai_meal_service() -> AIMealService:
    """Dependency to get AI meal service instance."""
    pool = get_pool()
    return AIMealService(pool)


# Pydantic models
class PhotoAnalysisRequest(BaseModel):
    user_id: str
    image_base64: str


class TextToMealRequest(BaseModel):
    user_id: str
    text: str


class TranscribeResponse(BaseModel):
    transcript: str


class PortionInferResponse(BaseModel):
    transcript: str
    quantity: float | None = None
    unit: str | None = None


class VoiceToMealResponse(BaseModel):
    transcript: str
    foods: List[Dict[str, Any]]
    needs_clarification: Optional[bool] = None
    follow_up_question: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None
    requested_food_name: Optional[str] = None
    requested_quantity_grams: Optional[float] = None


@router.post("/log-photo")
async def log_meal_photo(
    request: PhotoAnalysisRequest,
    uid: str = Depends(get_current_uid),
    service: AIMealService = Depends(get_ai_meal_service)
):
    """
    Log meal from photo using AI analysis.
    
    Args:
        request: Photo analysis request with user_id and image
        uid: Current user ID (from auth)
        service: AI meal service instance
    
    Returns:
        Dictionary with detected foods and metadata
    """
    require_user_match(uid, request.user_id)
    return await service.analyze_photo(request.user_id, request.image_base64)


@router.post("/voice-to-meal", response_model=VoiceToMealResponse)
async def voice_to_meal(
    user_id: str = Form(...),
    audio: UploadFile = File(...),
    uid: str = Depends(get_current_uid),
    service: AIMealService = Depends(get_ai_meal_service)
):
    """
    Transcribe uploaded audio and parse into structured foods.
    
    Args:
        user_id: User UUID
        audio: Uploaded audio file
        uid: Current user ID (from auth)
        service: AI meal service instance
    
    Returns:
        Dictionary with transcript and matched foods
    """
    require_user_match(uid, user_id)
    return await service.voice_to_meal(user_id, audio)


@router.post("/text-to-meal", response_model=VoiceToMealResponse)
async def text_to_meal(
    payload: TextToMealRequest,
    uid: str = Depends(get_current_uid),
    service: AIMealService = Depends(get_ai_meal_service)
):
    """
    Parse typed meal description into structured foods.
    
    Args:
        payload: Text to meal request
        uid: Current user ID (from auth)
        service: AI meal service instance
    
    Returns:
        Dictionary with transcript and matched foods
    """
    require_user_match(uid, payload.user_id)
    return await service.text_to_meal(payload.user_id, payload.text)


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    user_id: str = Form(...),
    audio: UploadFile = File(...),
    uid: str = Depends(get_current_uid),
    service: AIMealService = Depends(get_ai_meal_service)
):
    """
    Transcribe audio file to text.
    
    Args:
        user_id: User UUID
        audio: Uploaded audio file
        uid: Current user ID (from auth)
        service: AI meal service instance
    
    Returns:
        Dictionary with transcript
    """
    require_user_match(uid, user_id)
    transcript = await service.transcribe_audio(audio)
    return {"transcript": transcript}


@router.post("/infer-portion", response_model=PortionInferResponse)
async def infer_portion(
    user_id: str = Form(...),
    audio: UploadFile = File(...),
    uid: str = Depends(get_current_uid),
    service: AIMealService = Depends(get_ai_meal_service)
):
    """
    Infer portion size from audio description.
    
    Args:
        user_id: User UUID
        audio: Uploaded audio file
        uid: Current user ID (from auth)
        service: AI meal service instance
    
    Returns:
        Dictionary with transcript, quantity, and unit
    """
    require_user_match(uid, user_id)
    return await service.infer_portion(audio)


@router.post("/has-food")
async def detect_food_presence(
    request: PhotoAnalysisRequest,
    uid: str = Depends(get_current_uid),
    service: AIMealService = Depends(get_ai_meal_service)
):
    """
    Quickly check whether an image contains food before running full analysis.

    Uses a cheap, fast AI model so the camera screen can give instant feedback
    without spending expensive tokens on non-food images.

    Returns:
        has_food (bool), confidence (0-1), reason (str)
    """
    require_user_match(uid, request.user_id)
    return await service.has_food(request.image_base64)

