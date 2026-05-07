"""
Label processing service for AI-powered nutrition label extraction.
Handles label image analysis, data extraction, and health checks.
"""

import json
import logging
from typing import Dict, Any, List, Optional
import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid
from app.utils.parsers import _get_openai_client

logger = logging.getLogger(__name__)


class LabelService:
    """Service for processing nutrition labels with AI."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def process_label(
        self,
        user_id: str,
        barcode: str,
        images_base64: List[str],
        front_image_base64: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process nutrition label images with AI to extract data and perform health check.
        
        Flow:
        1. Extract nutrition data from images using AI
        2. Save extracted food to database (for review)
        3. Run health check analysis on extracted data
        4. Return both food and health check results
        
        Args:
            user_id: User UUID
            barcode: Product barcode
            images_base64: List of base64 encoded label images (max 3)
            front_image_base64: Optional front package image
        
        Returns:
            Dictionary with extracted food data and health analysis
        """
        from app.core.config import settings
        
        if not settings.OPENAI_API_KEY:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")
        
        barcode = self._normalize_barcode(barcode)
        if not barcode:
            raise HTTPException(status_code=400, detail="Missing barcode")
        
        if not images_base64:
            raise HTTPException(status_code=400, detail="Missing images")
        
        if len(images_base64) > 3:
            raise HTTPException(status_code=400, detail="Too many images (max 3)")
        
        # Step 1: Extract nutrition data from images
        extracted = await self._extract_nutrition_data(images_base64)
        
        # Step 2: Check if barcode exists and merge data
        async with self.pool.acquire() as conn:
            existing = await self._get_existing_barcode(conn, barcode)
            
            if existing:
                # Merge with existing data
                extracted["name"] = existing.get("product_name") or extracted.get("name")
                extracted["brand"] = existing.get("brand") or extracted.get("brand")
            
            # Step 3: Save to database
            food_id = await self._save_extracted_food(
                conn, user_id, barcode, extracted, front_image_base64
            )
            
            # Step 4: Run health check
            health_check = await self._perform_health_check(extracted)
            
            return {
                "food_id": str(food_id),
                "barcode": barcode,
                "name": extracted.get("name"),
                "brand": extracted.get("brand"),
                "nutrition": {
                    "calories_per_100g": extracted.get("calories_per_100g"),
                    "protein_per_100g": extracted.get("protein_per_100g"),
                    "carbs_per_100g": extracted.get("carbs_per_100g"),
                    "fat_per_100g": extracted.get("fat_per_100g"),
                    "fiber_g_per_100g": extracted.get("fiber_g_per_100g"),
                    "sugar_g_per_100g": extracted.get("sugar_g_per_100g"),
                    "sodium_mg_per_100g": extracted.get("sodium_mg_per_100g"),
                },
                "ingredients": extracted.get("ingredients"),
                "health_check": health_check,
            }
    
    async def health_check(
        self,
        user_id: str,
        barcode: str
    ) -> Dict[str, Any]:
        """
        Perform AI health check on a packaged food by barcode.

        Args:
            user_id: User UUID
            barcode: Product barcode

        Returns:
            Dictionary with health analysis and flags
        """
        barcode = self._normalize_barcode(barcode)

        async with self.pool.acquire() as conn:
            # Check foods table first (covers label-scanned products)
            food_row = await conn.fetchrow(
                """
                SELECT name, brand, ingredients,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g
                FROM foods
                WHERE barcode = $1
                LIMIT 1
                """,
                barcode,
            )

            if food_row:
                food_data = dict(food_row)
            else:
                # Fall back to barcodes table (cached external data)
                barcode_row = await conn.fetchrow(
                    """
                    SELECT product_name, brand, ingredients,
                           calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                           fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g
                    FROM barcodes
                    WHERE barcode = $1
                    LIMIT 1
                    """,
                    barcode,
                )

                if not barcode_row:
                    raise HTTPException(status_code=404, detail="Product not found")

                food_data = dict(barcode_row)
                food_data["name"] = food_data.pop("product_name")

        return await self._perform_health_check(food_data)
    
    async def _extract_nutrition_data(
        self,
        images_base64: List[str]
    ) -> Dict[str, Any]:
        """Extract nutrition data from label images using AI."""
        from app.core.config import settings

        client = _get_openai_client()
        
        extraction_prompt = """Analyze this nutrition label image and extract the following information.
Return a JSON object with these fields:

{
  "name": "Product name if visible, otherwise describe the product",
  "brand": "Brand name if visible, otherwise null",
  "serving_size_g": 100,
  "calories_per_100g": number,
  "protein_per_100g": number (in grams),
  "carbs_per_100g": number (in grams),
  "fat_per_100g": number (in grams),
  "fiber_g_per_100g": number or null,
  "sugar_g_per_100g": number or null,
  "sodium_mg_per_100g": number or null,
  "ingredients": "Full ingredients list text if visible, otherwise null"
}

IMPORTANT:
- If the label shows values per serving, convert to per 100g
- If any value is not visible or unclear, use 0 for required fields or null for optional
- Extract the full ingredients list exactly as written
- Return ONLY valid JSON, no other text"""
        
        try:
            content_parts: List[Dict[str, Any]] = [
                {"type": "text", "text": extraction_prompt}
            ]
            
            for b64 in images_base64:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{b64}",
                        "detail": "high",
                    },
                })
            
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL or "gpt-4o",
                messages=[{
                    "role": "user",
                    "content": content_parts,
                }],
                response_format={"type": "json_object"},
                max_tokens=1500,
                temperature=0.1,
            )
            
            raw_text = (response.choices[0].message.content or "").strip()
            
            # Clean up markdown code blocks if present
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]
                raw_text = raw_text.strip()
            
            try:
                extracted = json.loads(raw_text)
            except json.JSONDecodeError:
                # Attempt to repair JSON
                extracted = await self._repair_json(client, raw_text, settings)
            
            return extracted
            
        except Exception as e:
            logger.error(f"AI extraction failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")
    
    async def _repair_json(
        self,
        client,
        raw_text: str,
        settings,
    ) -> Dict[str, Any]:
        """Attempt to repair malformed JSON using AI."""
        repair_prompt = (
            "You are a strict JSON repair tool. "
            "Convert the following text into a single valid JSON object. "
            "Return ONLY JSON, no markdown or extra text."
        )
        
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL or "gpt-4o",
            messages=[{
                "role": "user",
                "content": repair_prompt + "\n\n" + raw_text
            }],
            response_format={"type": "json_object"},
            max_tokens=1500,
            temperature=0.0,
        )
        
        repair_text = (response.choices[0].message.content or "").strip()
        return json.loads(repair_text)
    
    async def _perform_health_check(
        self,
        food_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Perform AI health check on food data."""
        from app.core.config import settings

        if not settings.OPENAI_API_KEY:
            return {
                "verdict": "caution",
                "verdict_reason": "Health check unavailable",
                "summary": "Health check unavailable",
                "red_flags": [],
                "positives": [],
            }

        client = _get_openai_client()

        health_prompt = f"""Analyze this packaged food product for health concerns.

Product: {food_data.get('name', 'Unknown')}
Brand: {food_data.get('brand', 'Unknown')}
Ingredients: {food_data.get('ingredients', 'Not available')}

Nutrition per 100g:
- Calories: {food_data.get('calories_per_100g', 0)}
- Protein: {food_data.get('protein_per_100g', 0)}g
- Carbs: {food_data.get('carbs_per_100g', 0)}g
- Fat: {food_data.get('fat_per_100g', 0)}g
- Fiber: {food_data.get('fiber_g_per_100g', 0)}g
- Sugar: {food_data.get('sugar_g_per_100g', 0)}g
- Sodium: {food_data.get('sodium_mg_per_100g', 0)}mg

Return a JSON object:
{{
  "verdict": "good" | "caution" | "avoid",
  "verdict_reason": "One sentence explaining the verdict",
  "summary": "2-3 sentence overall assessment",
  "red_flags": [
    {{
      "title": "Concern title (max 5 words)",
      "severity": "low|medium|high",
      "reason": "Why this is a concern (max 18 words)"
    }}
  ],
  "positives": ["Short positive aspect", "Another positive"]
}}

verdict rules:
- "good": generally healthy, minimal concerns
- "caution": moderate concerns, okay occasionally
- "avoid": significant health concerns (high sugar/sodium, trans fats, harmful additives)

Focus on: ultra-processed ingredients, excessive sugar/sodium, artificial additives, trans fats.
Return ONLY valid JSON."""

        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL or "gpt-4o",
                messages=[{
                    "role": "user",
                    "content": health_prompt
                }],
                response_format={"type": "json_object"},
                max_tokens=1000,
                temperature=0.3,
            )

            raw_text = (response.choices[0].message.content or "").strip()
            return json.loads(raw_text)

        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return {
                "verdict": "caution",
                "verdict_reason": "Health check unavailable",
                "summary": "Health check unavailable",
                "red_flags": [],
                "positives": [],
            }
    
    async def _get_existing_barcode(
        self,
        conn: asyncpg.Connection,
        barcode: str
    ) -> Optional[Dict[str, Any]]:
        """Get existing barcode data from database."""
        row = await conn.fetchrow(
            """
            SELECT barcode, product_name, brand,
                   calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                   fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                   ingredients
            FROM barcodes
            WHERE barcode = $1
            """,
            barcode
        )
        
        return dict(row) if row else None
    
    async def _save_extracted_food(
        self,
        conn: asyncpg.Connection,
        user_id: str,
        barcode: str,
        extracted: Dict[str, Any],
        front_image_base64: Optional[str]
    ) -> str:
        """Save extracted food data to database."""
        import uuid
        
        food_id = await conn.fetchval(
            """
            INSERT INTO foods (
                id, name, brand, barcode, category,
                calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                ingredients, source, created_by_user_id, verified, review_status
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15, $16, $17
            )
            ON CONFLICT (barcode) DO UPDATE SET
                name = EXCLUDED.name,
                brand = EXCLUDED.brand,
                calories_per_100g = EXCLUDED.calories_per_100g,
                protein_per_100g = EXCLUDED.protein_per_100g,
                carbs_per_100g = EXCLUDED.carbs_per_100g,
                fat_per_100g = EXCLUDED.fat_per_100g,
                fiber_g_per_100g = EXCLUDED.fiber_g_per_100g,
                sugar_g_per_100g = EXCLUDED.sugar_g_per_100g,
                sodium_mg_per_100g = EXCLUDED.sodium_mg_per_100g,
                ingredients = EXCLUDED.ingredients,
                updated_at = now()
            RETURNING id
            """,
            uuid.uuid4(),
            extracted.get("name", "Unknown Product"),
            extracted.get("brand"),
            barcode,
            "packaged",
            float(extracted.get("calories_per_100g", 0)),
            float(extracted.get("protein_per_100g", 0)),
            float(extracted.get("carbs_per_100g", 0)),
            float(extracted.get("fat_per_100g", 0)),
            float(extracted.get("fiber_g_per_100g") or 0),
            float(extracted.get("sugar_g_per_100g") or 0),
            float(extracted.get("sodium_mg_per_100g") or 0),
            extracted.get("ingredients"),
            "label_scan",
            to_uuid(user_id),
            False,
            "pending"
        )
        
        return food_id
    
    @staticmethod
    def _normalize_barcode(barcode: str) -> str:
        """Normalize barcode string."""
        return (barcode or "").strip()
