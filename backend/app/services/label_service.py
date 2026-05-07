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
                "food": {
                    "id": str(food_id),
                    "name": extracted.get("name"),
                    "brand": extracted.get("brand"),
                    "barcode": barcode,
                    "category": "packaged",
                    "calories_per_100g": extracted.get("calories_per_100g"),
                    "protein_per_100g": extracted.get("protein_per_100g"),
                    "carbs_per_100g": extracted.get("carbs_per_100g"),
                    "fat_per_100g": extracted.get("fat_per_100g"),
                    "saturated_fat_g_per_100g": extracted.get("saturated_fat_g_per_100g"),
                    "trans_fat_g_per_100g": extracted.get("trans_fat_g_per_100g"),
                    "fiber_g_per_100g": extracted.get("fiber_g_per_100g"),
                    "sugar_g_per_100g": extracted.get("sugar_g_per_100g"),
                    "sodium_mg_per_100g": extracted.get("sodium_mg_per_100g"),
                    "cholesterol_mg_per_100g": extracted.get("cholesterol_mg_per_100g"),
                    "ingredients": extracted.get("ingredients"),
                },
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
        
        extraction_prompt = """You are a precise nutrition data extraction specialist. Analyze the provided nutrition label image(s) and extract accurate data.

You may receive 1-3 images. Use ALL images together:
- Nutrition facts panel (values per serving or per 100g)
- Ingredients list
- Front-of-pack (product name, brand)

STEP 1 — Identify serving size:
Check whether the label shows values PER SERVING or PER 100g.
If PER SERVING: multiply all nutrient values by (100 / serving_size_g) to convert to per-100g.
If PER 100g: use values directly.

STEP 2 — Extract and convert all values to PER 100g.

Return ONLY this JSON object, no extra text:
{
  "name": "Exact product name from label",
  "brand": "Brand name or null if not visible",
  "serving_size_g": <number — the serving size in grams, or 100 if label is already per-100g>,
  "calories_per_100g": <number>,
  "protein_per_100g": <number in grams>,
  "carbs_per_100g": <number in grams — total carbohydrates>,
  "fat_per_100g": <number in grams — total fat>,
  "saturated_fat_g_per_100g": <number or null — saturated fat>,
  "trans_fat_g_per_100g": <number or null — trans fat>,
  "fiber_g_per_100g": <number or null — dietary fiber>,
  "sugar_g_per_100g": <number or null — total sugars>,
  "sodium_mg_per_100g": <number in milligrams or null>,
  "cholesterol_mg_per_100g": <number in milligrams or null>,
  "ingredients": "Full ingredients list exactly as printed, or null if not visible"
}

FIELD RULES:
- calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g: REQUIRED. Use 0 only if genuinely zero (e.g., water). Do NOT use 0 as a placeholder for missing data — use null for optional fields.
- Sodium: if label shows in grams, multiply by 1000 to convert to mg.
- If a value is blurry or partially obscured but estimable, provide your best estimate.
- If truly unreadable, use null for optional fields.
- Do NOT invent or estimate values that are completely absent from the label.
- Ingredients: copy verbatim, preserving E-numbers, additives, and parenthetical info."""
        
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

        health_prompt = f"""You are a registered dietitian and food safety expert. Analyze this packaged food for health implications.

PRODUCT:
  Name: {food_data.get('name', 'Unknown')}
  Brand: {food_data.get('brand', 'Unknown')}

NUTRITION (per 100g):
  Calories:      {food_data.get('calories_per_100g', 0)} kcal
  Protein:       {food_data.get('protein_per_100g', 0)}g
  Total Carbs:   {food_data.get('carbs_per_100g', 0)}g
  Total Fat:     {food_data.get('fat_per_100g', 0)}g
  Saturated Fat: {food_data.get('saturated_fat_g_per_100g') or food_data.get('saturated_fat_g_per_100g', 'unknown')}g
  Trans Fat:     {food_data.get('trans_fat_g_per_100g', 'unknown')}g
  Sugar:         {food_data.get('sugar_g_per_100g', 0)}g
  Fiber:         {food_data.get('fiber_g_per_100g', 0)}g
  Sodium:        {food_data.get('sodium_mg_per_100g', 0)}mg
  Cholesterol:   {food_data.get('cholesterol_mg_per_100g', 'unknown')}mg

INGREDIENTS:
{food_data.get('ingredients', 'Not available')}

INSTRUCTIONS:
Analyze the product using BOTH the nutrition numbers AND the ingredients list.
Base your verdict on the ACTUAL values provided — do NOT assume data not given above.

INGREDIENT HAZARDS TO DETECT (flag only if present in the ingredients list):
- High-fructose corn syrup (HFCS), glucose-fructose syrup → high glycemic burden
- Hydrogenated or partially hydrogenated oils → trans fat source
- Palm oil, palm kernel oil → high saturated fat, sustainability concern
- Artificial colors (E102, E104, E110, E122, E124, E129, Red 40, Yellow 5/6) → hyperactivity risk
- Artificial preservatives: sodium benzoate (E211), BHA (E320), BHT (E321), TBHQ → oxidative stress
- Nitrates/nitrites (E249–E252) → processed meat carcinogens
- Aspartame, acesulfame-K, sucralose → artificial sweeteners
- Carrageenan (E407) → gut inflammation
- MSG (E621) → flavor enhancer, sensitivity trigger for some
- Excessive emulsifiers: polysorbate 80 (E433), carboxymethylcellulose (E466) → gut microbiome disruption

NUTRITION THRESHOLDS (per 100g, for verdict calibration):
- Sugar: >22.5g = HIGH | 5–22.5g = MEDIUM | <5g = LOW
- Fat: >17.5g = HIGH | 3–17.5g = MEDIUM | <3g = LOW
- Saturated Fat: >5g = HIGH | 1.5–5g = MEDIUM | <1.5g = LOW
- Sodium: >600mg = HIGH | 120–600mg = MEDIUM | <120mg = LOW
- Calories: >400kcal = HIGH | 100–400kcal = MEDIUM | <100kcal = LOW
- Trans Fat: >0.5g = flag immediately

VERDICT LOGIC:
- "avoid": ANY of → trans fat >0.5g, sugar >30g, sodium >800mg, 2+ HIGH ratings on above thresholds, OR 2+ serious ingredient hazards
- "caution": ANY of → sugar 15–30g, sodium 400–800mg, 1 HIGH threshold, OR 1 ingredient hazard
- "good": all values LOW or MEDIUM, no serious ingredient hazards

Return ONLY this JSON:
{{
  "verdict": "good" | "caution" | "avoid",
  "verdict_reason": "One specific sentence citing the most critical finding with actual numbers",
  "summary": "2-3 sentences covering: (1) what the product is and its overall profile, (2) main concern if any, (3) who it is suitable for",
  "red_flags": [
    {{
      "title": "Max 5 words",
      "severity": "low" | "medium" | "high",
      "reason": "Specific concern with actual value or ingredient name (max 20 words)"
    }}
  ],
  "nutrient_highlights": [
    {{
      "nutrient": "Sugar",
      "value": "12g per 100g",
      "rating": "low" | "medium" | "high",
      "note": "One brief note"
    }}
  ],
  "positives": ["Specific positive backed by data, e.g. 'High protein at 24g/100g'"],
  "suitable_for": "Who this product is suitable for (e.g., occasional treat, not for diabetics, etc.)"
}}

SEVERITY RULES:
- "high" severity: only for trans fat, extremely high sugar/sodium (>30g/>800mg), known carcinogens
- "medium" severity: for elevated thresholds or moderate hazard ingredients
- "low" severity: minor concerns (e.g., artificial sweeteners, MSG)
- NO red_flags for things that are fine (e.g., don't flag 3g sugar as a concern)
- If no genuine concerns exist, return: "red_flags": []
- nutrient_highlights: include 3–5 key nutrients relevant to the verdict
- positives: back every item with a number ("Good fiber at 4g/100g"), not vague statements"""

        try:
            response = await client.responses.create(
                model="gpt-5.5",
                input=[{
                    "role": "user",
                    "content": health_prompt,
                }],
                text={"format": {"type": "json_object"}},
            )

            raw_text = response.output_text
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
        """Save user-contributed label data to the barcodes table."""
        await conn.execute(
            """
            INSERT INTO barcodes (
                barcode, product_name, brand,
                calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                fiber_g_per_100g, sugar_g_per_100g, sodium_mg_per_100g,
                ingredients, source, verified
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (barcode) DO UPDATE SET
                product_name       = EXCLUDED.product_name,
                brand              = EXCLUDED.brand,
                calories_per_100g  = EXCLUDED.calories_per_100g,
                protein_per_100g   = EXCLUDED.protein_per_100g,
                carbs_per_100g     = EXCLUDED.carbs_per_100g,
                fat_per_100g       = EXCLUDED.fat_per_100g,
                fiber_g_per_100g   = EXCLUDED.fiber_g_per_100g,
                sugar_g_per_100g   = EXCLUDED.sugar_g_per_100g,
                sodium_mg_per_100g = EXCLUDED.sodium_mg_per_100g,
                ingredients        = EXCLUDED.ingredients,
                source             = EXCLUDED.source,
                updated_at         = now()
            """,
            barcode,
            extracted.get("name", "Unknown Product"),
            extracted.get("brand"),
            float(extracted.get("calories_per_100g", 0)),
            float(extracted.get("protein_per_100g", 0)),
            float(extracted.get("carbs_per_100g", 0)),
            float(extracted.get("fat_per_100g", 0)),
            float(extracted.get("fiber_g_per_100g") or 0),
            float(extracted.get("sugar_g_per_100g") or 0),
            float(extracted.get("sodium_mg_per_100g") or 0),
            extracted.get("ingredients"),
            "user_contribution",
            False,
        )
        return barcode
    
    @staticmethod
    def _normalize_barcode(barcode: str) -> str:
        """Normalize barcode string."""
        return (barcode or "").strip()
