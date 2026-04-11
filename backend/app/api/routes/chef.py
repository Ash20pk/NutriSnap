"""
Chef routes for AI-powered recipe generation.
"""

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid, require_user_match
from app.db.queries import to_uuid
from app.utils.parsers import extract_json_from_text

router = APIRouter(prefix="/chef", tags=["chef"])
logger = logging.getLogger(__name__)


# ── Lazy OpenAI client ────────────────────────────────────────────────────────
_openai_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set")
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


# ── Pydantic models ───────────────────────────────────────────────────────────

class ChefGenerateRequest(BaseModel):
    user_id: str
    ingredients: List[str] = Field(default_factory=list)
    goals: List[str] = Field(default_factory=list)
    cuisine: Optional[str] = None
    dietary_preference: Optional[str] = None
    target_meal: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_nutritional_gaps(pool, user_id: str) -> str:
    """Calculate nutritional gaps from today's meals for the given user."""
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT total_calories, total_protein, total_carbs, total_fat
                FROM meals
                WHERE user_id = $1
                  AND timestamp >= now() - INTERVAL '1 day'
                """,
                to_uuid(user_id),
            )
        totals = {"protein": 0.0, "carbs": 0.0, "fat": 0.0, "calories": 0.0}
        for r in rows:
            totals["protein"] += float(r["total_protein"] or 0)
            totals["carbs"] += float(r["total_carbs"] or 0)
            totals["fat"] += float(r["total_fat"] or 0)
            totals["calories"] += float(r["total_calories"] or 0)

        gaps = []
        if totals["protein"] < 50:
            gaps.append("protein")
        if totals["carbs"] < 100:
            gaps.append("carbs")
        if totals["fat"] < 20:
            gaps.append("healthy fats")
        if totals["calories"] < 1200:
            gaps.append("calories")

        return ", ".join(gaps) if gaps else "None identified"
    except Exception as e:
        logger.warning(f"Error calculating nutritional gaps: {e}")
        return "None identified"


def _build_chef_prompt(request: ChefGenerateRequest, user_profile: Optional[dict], nutritional_gaps: str) -> str:
    """Build the AI prompt for recipe generation."""
    profile_context = ""
    if user_profile:
        goal = user_profile.get("goal", "")
        dietary = user_profile.get("dietary_preference", "")
        if goal:
            profile_context += f"\nUser's Health Goal: {goal}"
        if dietary:
            profile_context += f"\nUser's Dietary Preference: {dietary}"

    return f"""As a professional chef and nutritionist, create a personalized recipe based on:

Available Ingredients: {', '.join(request.ingredients) if request.ingredients else 'Any common ingredients'}
Health Goals: {', '.join(request.goals) if request.goals else 'General health'}
Preferred Cuisine: {request.cuisine or 'Any'}
Dietary Preference: {request.dietary_preference or 'No restriction'}
Target Meal Type: {request.target_meal or 'Any meal'}
Nutritional Gaps to Address: {nutritional_gaps}
{profile_context}

Requirements:
- Use only the listed ingredients or suggest minimal additions
- Focus on Indian cuisine when possible
- Provide clear, step-by-step instructions
- Include prep time and servings
- Calculate approximate nutritional values per serving
- Add cooking tips for beginners

Format response as JSON with these exact keys:
{{
  "name": "Recipe Name",
  "description": "Brief description",
  "prepTime": 30,
  "servings": 2,
  "calories": 350,
  "protein": 25,
  "carbs": 40,
  "fat": 12,
  "fiber": 5,
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["Step 1", "Step 2"],
  "tips": "Cooking tips"
}}"""


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_recipe(
    request: ChefGenerateRequest,
    uid: str = Depends(get_current_uid),
):
    """Generate a personalised recipe using AI with structured input."""
    require_user_match(uid, request.user_id)

    client = _get_openai_client()
    pool = get_pool()

    # Fetch user profile for extra context
    try:
        async with pool.acquire() as conn:
            profile_row = await conn.fetchrow(
                "SELECT goal, dietary_preference FROM profiles WHERE id = $1",
                to_uuid(request.user_id),
            )
            user_profile = dict(profile_row) if profile_row else None
    except Exception as e:
        logger.warning(f"Could not fetch user profile: {e}")
        user_profile = None

    nutritional_gaps = await _get_nutritional_gaps(pool, request.user_id)
    prompt = _build_chef_prompt(request, user_profile, nutritional_gaps)

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional chef and nutritionist. Always respond with valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content if response.choices else ""
        extracted = extract_json_from_text(content)
        recipe = json.loads(extracted)

        return {
            "recipe": recipe,
            "nutritional_gaps_addressed": nutritional_gaps,
        }
    except Exception as e:
        logger.error(f"Error generating recipe: {e}")
        raise HTTPException(status_code=500, detail=str(e))
