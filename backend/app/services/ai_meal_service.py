"""
AI meal analysis service for photo, voice, and text-based meal logging.
Handles AI-powered meal detection, transcription, and food matching.
"""

import logging
from typing import Dict, Any, List, Optional
import asyncpg
from fastapi import HTTPException, UploadFile
import json

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class AIMealService:
    """Service for AI-powered meal analysis and logging."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def analyze_photo(
        self,
        user_id: str,
        image_base64: str
    ) -> Dict[str, Any]:
        """
        Analyze a meal photo using AI to detect foods.
        
        Args:
            user_id: User UUID
            image_base64: Base64 encoded image
        
        Returns:
            Dictionary with detected foods and metadata
        """
        from app.utils.parsers import analyze_food_image
        
        # Call AI analysis
        analysis = await analyze_food_image(image_base64)
        
        if "error" in analysis:
            raise HTTPException(status_code=500, detail=analysis["error"])
        
        # Match detected foods to database
        matched_foods: List[Dict[str, Any]] = []
        async with self.pool.acquire() as conn:
            for food in analysis.get("foods", []):
                matched = await self._match_food_to_database(
                    conn,
                    food.get("name", ""),
                    float(food.get("estimated_quantity_grams", 0) or 0),
                    "g",
                )
                matched["confidence"] = food.get("confidence", "medium")
                matched_foods.append(matched)
        
        return {
            "foods": matched_foods,
            "notes": analysis.get("notes", ""),
        }
    
    async def voice_to_meal(
        self,
        user_id: str,
        audio_file: UploadFile
    ) -> Dict[str, Any]:
        """
        Convert voice audio to structured meal data.
        
        Args:
            user_id: User UUID
            audio_file: Uploaded audio file
        
        Returns:
            Dictionary with transcript and matched foods
        """
        logger.info(f"[VOICE_TO_MEAL] Starting voice-to-meal for user={user_id}")
        
        # Transcribe audio
        logger.info(f"[VOICE_TO_MEAL] Transcribing audio file")
        transcript = await self._transcribe_audio(audio_file)
        logger.info(f"[VOICE_TO_MEAL] Transcript: {transcript}")
        
        # Parse transcript into foods
        logger.info(f"[VOICE_TO_MEAL] Parsing transcript into foods")
        parsed_foods = await self._parse_meal_text(transcript)
        logger.info(f"[VOICE_TO_MEAL] Parsed {len(parsed_foods)} foods")
        
        # Match foods to database
        matched_foods: List[Dict[str, Any]] = []
        async with self.pool.acquire() as conn:
            for idx, item in enumerate(parsed_foods):
                try:
                    qty_val = float(item.get("quantity_value") or item.get("quantity_grams") or 0)
                    qty_unit = str(item.get("quantity_unit") or "g")
                    logger.info(f"[VOICE_TO_MEAL] Matching food {idx+1}/{len(parsed_foods)}: {item['name']} ({qty_val} {qty_unit})")
                    matched = await self._match_food_to_database(
                        conn,
                        item["name"],
                        qty_val,
                        qty_unit,
                    )

                    # If backend needs clarification, stop and ask the user instead of guessing.
                    if isinstance(matched, dict) and matched.get("needs_clarification"):
                        return {
                            "transcript": transcript,
                            "foods": [],
                            "needs_clarification": True,
                            "follow_up_question": matched.get("follow_up_question"),
                            "options": matched.get("options") or [],
                            "requested_food_name": matched.get("name") or item.get("name"),
                            "requested_quantity_grams": float(matched.get("quantity") or qty_val),
                        }

                    matched["displayQuantity"] = round(qty_val, 1)
                    matched["displayUnit"] = qty_unit
                    matched_foods.append(matched)
                    logger.info(f"[VOICE_TO_MEAL] Successfully matched: {item['name']}")
                except Exception as e:
                    logger.error(f"[VOICE_TO_MEAL] Failed to match food '{item['name']}': {str(e)}")
                    raise HTTPException(status_code=500, detail=f"Failed to match food '{item['name']}': {str(e)}")
        
        logger.info(f"[VOICE_TO_MEAL] Successfully matched all {len(matched_foods)} foods")
        response_payload = {
            "transcript": transcript,
            "foods": matched_foods
        }

        try:
            foods_preview = [
                {
                    "name": f.get("name"),
                    "food_id": f.get("food_id"),
                    "quantity": f.get("quantity"),
                    "displayQuantity": f.get("displayQuantity"),
                    "displayUnit": f.get("displayUnit"),
                    "calories": f.get("calories"),
                    "calories_per_100g": f.get("calories_per_100g"),
                }
                for f in matched_foods[:5]
            ]
            logger.info(
                "[VOICE_TO_MEAL] Response payload preview: %s",
                json.dumps(
                    {
                        "transcript_len": len(transcript or ""),
                        "foods_count": len(matched_foods),
                        "foods_preview": foods_preview,
                    },
                    default=str,
                ),
            )
        except Exception as e:
            logger.warning(f"[VOICE_TO_MEAL] Failed to log response payload preview: {type(e).__name__}: {str(e)}")

        return response_payload
    
    async def text_to_meal(
        self,
        user_id: str,
        text: str
    ) -> Dict[str, Any]:
        """
        Parse typed meal description into structured foods.
        
        Args:
            user_id: User UUID
            text: Meal description text
        
        Returns:
            Dictionary with transcript and matched foods
        """
        transcript = (text or "").strip()
        
        # Parse text into foods
        parsed_foods = await self._parse_meal_text(transcript)
        
        if not parsed_foods:
            return {
                "transcript": transcript,
                "foods": []
            }
        
        # Match foods to database
        matched_foods: List[Dict[str, Any]] = []
        async with self.pool.acquire() as conn:
            for item in parsed_foods:
                qty_val = float(item.get("quantity_value") or item.get("quantity_grams") or 0)
                qty_unit = str(item.get("quantity_unit") or "g")
                matched = await self._match_food_to_database(
                    conn,
                    item["name"],
                    qty_val,
                    qty_unit,
                )
                matched["displayQuantity"] = round(qty_val, 1)
                matched["displayUnit"] = qty_unit
                matched_foods.append(matched)
        
        return {
            "transcript": transcript,
            "foods": matched_foods
        }
    
    async def transcribe_audio(
        self,
        audio_file: UploadFile
    ) -> str:
        """
        Transcribe audio file to text.
        
        Args:
            audio_file: Uploaded audio file
        
        Returns:
            Transcribed text
        """
        return await self._transcribe_audio(audio_file)
    
    async def infer_portion(
        self,
        audio_file: UploadFile
    ) -> Dict[str, Any]:
        """
        Infer portion size from audio description.
        
        Args:
            audio_file: Uploaded audio file
        
        Returns:
            Dictionary with transcript, quantity, and unit
        """
        from app.utils.parsers import infer_portion_from_text
        
        # Transcribe audio
        transcript = await self._transcribe_audio(audio_file)
        
        # Infer portion
        result = await infer_portion_from_text(transcript)
        
        return {
            "transcript": transcript,
            "quantity": result.get("quantity"),
            "unit": result.get("unit")
        }
    
    async def _transcribe_audio(self, audio_file: UploadFile) -> str:
        """Transcribe audio file using AI."""
        from app.utils.parsers import transcribe_audio_file
        
        try:
            transcript = await transcribe_audio_file(audio_file)
            return transcript
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    async def _parse_meal_text(self, text: str) -> List[Dict[str, Any]]:
        """Parse meal text into structured food items."""
        from app.utils.parsers import parse_voice_meal_text
        
        try:
            parsed = await parse_voice_meal_text(text)
            # Convert Pydantic models to dicts if needed
            if parsed and hasattr(parsed[0], 'model_dump'):
                return [item.model_dump() for item in parsed]
            elif parsed and hasattr(parsed[0], 'dict'):
                return [item.dict() for item in parsed]
            return parsed
        except Exception as e:
            logger.error(f"Parsing failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")
    
    async def _match_food_to_database(
        self,
        conn: asyncpg.Connection,
        food_name: str,
        quantity_value: float,
        quantity_unit: str = "g",
    ) -> Dict[str, Any]:
        from app.utils.parsers import match_food_to_database_db

        try:
            matched = await match_food_to_database_db(conn, food_name, quantity_value, quantity_unit)
            return matched
        except Exception as e:
            logger.error(f"Food matching failed for '{food_name}': {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to match food '{food_name}': {str(e)}"
            )

    async def has_food(self, image_base64: str) -> Dict[str, Any]:
        """
        Quickly detect whether an image contains food using a cheap AI model.
        Used by the camera screen before committing to full photo analysis.

        Args:
            image_base64: Base64-encoded image

        Returns:
            Dictionary with has_food (bool), confidence (0-1), reason (str)
        """
        from app.core.config import settings
        from app.utils.parsers import normalize_base64_image, extract_json_from_text
        import json as _json

        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

            normalized = normalize_base64_image(image_base64)
            image_url = f"data:image/jpeg;base64,{normalized}"

            response = await client.chat.completions.create(
                model=settings.OPENAI_CHEAP_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a binary classifier. Decide if there is clearly any edible food "
                            "in the image. Respond with JSON only."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    'Return ONLY JSON: {"has_food": true/false, "confidence": 0..1, '
                                    '"reason": "short"}. If unsure, set has_food=false with lower confidence.'
                                ),
                            },
                            {"type": "image_url", "image_url": {"url": image_url}},
                        ],
                    },
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content if response.choices else ""
            extracted = extract_json_from_text(content)
            parsed = _json.loads(extracted)

            return {
                "has_food": bool(parsed.get("has_food", False)),
                "confidence": float(parsed.get("confidence", 0.0) or 0.0),
                "reason": str(parsed.get("reason", "") or ""),
            }
        except Exception as e:
            logger.error(f"Error detecting food presence: {e}")
            # Fail open — don't block the main photo flow if the cheap check fails
            return {"has_food": True, "confidence": 0.0, "reason": "presence_check_failed"}

