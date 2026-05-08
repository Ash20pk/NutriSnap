"""
Text and image parsing utilities.
Handles base64 image normalization and JSON extraction from text.
"""

import json
import re
import uuid
import difflib
import logging
from typing import Any, Dict, List

import asyncpg
from fastapi import HTTPException, UploadFile
from openai import AsyncOpenAI

from app.core.config import settings


logger = logging.getLogger(__name__)


def normalize_base64_image(image_base64: str) -> str:
    """
    Normalize base64 image string by removing data URI prefix if present.
    
    Args:
        image_base64: Base64 encoded image, optionally with data URI prefix
    
    Returns:
        Clean base64 string without prefix
    """
    if not image_base64:
        return image_base64
    if "," in image_base64 and image_base64.strip().lower().startswith("data:"):
        return image_base64.split(",", 1)[1]
    return image_base64


def extract_json_from_text(text: str) -> str:
    """
    Extract JSON content from text that may contain markdown code blocks.
    
    Handles both ```json and ``` code blocks.
    
    Args:
        text: Text potentially containing JSON in code blocks
    
    Returns:
        Extracted JSON string or original text if no code blocks found
    """
    content = text or ""
    if "```json" in content:
        return content.split("```json", 1)[1].split("```", 1)[0].strip()
    if "```" in content:
        return content.split("```", 1)[1].split("```", 1)[0].strip()
    return content.strip()


_openai_client: AsyncOpenAI | None = None


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set")
        _openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


def _clamp_float(value: Any, low: float, high: float) -> float:
    try:
        v = float(value)
    except Exception:
        v = 0.0
    if v < low:
        return low
    if v > high:
        return high
    return v


def _valid_usda_macro_estimate(cal: float, p: float, c: float, f: float) -> bool:
    if cal <= 0:
        return False
    if any(x < 0 for x in (p, c, f)):
        return False
    if cal > 902:
        return False
    if p > 100 or c > 100 or f > 100:
        return False
    if (p + c + f) <= 0:
        return False
    return True


def _safe_nonneg_float(value: Any) -> float:
    try:
        v = float(value)
    except Exception:
        v = 0.0
    if v < 0:
        return 0.0
    return v


_MICRO_KEYS = [
    "fiber_g_per_100g",
    "sugar_g_per_100g",
    "saturated_fat_g_per_100g",
    "trans_fat_g_per_100g",
    "cholesterol_mg_per_100g",
    "sodium_mg_per_100g",
    "potassium_mg_per_100g",
    "vitamin_a_ug_per_100g",
    "calcium_mg_per_100g",
    "iron_mg_per_100g",
    "magnesium_mg_per_100g",
    "phosphorus_mg_per_100g",
    "zinc_mg_per_100g",
    "copper_mg_per_100g",
    "manganese_mg_per_100g",
    "selenium_ug_per_100g",
    "vitamin_c_mg_per_100g",
    "vitamin_d_ug_per_100g",
    "vitamin_e_mg_per_100g",
    "vitamin_k_ug_per_100g",
    "thiamin_b1_mg_per_100g",
    "riboflavin_b2_mg_per_100g",
    "niacin_b3_mg_per_100g",
    "vitamin_b6_mg_per_100g",
    "folate_ug_per_100g",
    "vitamin_b12_ug_per_100g",
    "caffeine_mg_per_100g",
    "alcohol_g_per_100g",
]


async def _estimate_usda_like_nutrition_per_100g(
    food_name: str,
) -> tuple[float, float, float, float, Dict[str, float]]:
    """Single API call returning macros + micros per 100 g for an unknown food."""
    client = _get_openai_client()
    name = (food_name or "").strip()
    if not name:
        raise ValueError("food_name is required")

    macro_keys = "calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g"
    system_prompt = (
        "You are estimating USDA-style nutrition per 100 grams for a food item. "
        "Return ONLY valid JSON with ALL of these exact keys: "
        + macro_keys + ", " + ", ".join(_MICRO_KEYS) + ". "
        "Rules: calories_per_100g > 0 and <= 900; protein/carbs/fat >= 0 and <= 100; "
        "all micronutrient values >= 0; use 0 if unknown, never null or negative. "
        "Units are encoded in each key name (g, mg, ug per 100g)."
    )

    def _parse(content: str) -> tuple[float, float, float, float, Dict[str, float]] | None:
        extracted = extract_json_from_text(content)
        parsed = json.loads(extracted) if extracted else {}
        if not isinstance(parsed, dict):
            return None
        cal = _clamp_float(parsed.get("calories_per_100g"), 0.0, 900.0)
        p   = _clamp_float(parsed.get("protein_per_100g"), 0.0, 100.0)
        c   = _clamp_float(parsed.get("carbs_per_100g"),   0.0, 100.0)
        f   = _clamp_float(parsed.get("fat_per_100g"),     0.0, 100.0)
        if not _valid_usda_macro_estimate(cal, p, c, f):
            return None
        micros = {k: _safe_nonneg_float(parsed.get(k)) for k in _MICRO_KEYS}
        return cal, p, c, f, micros

    model = settings.OPENAI_CHEAP_MODEL or settings.OPENAI_MODEL or "gpt-4o-mini"

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": name},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content if response.choices else ""
    result = _parse(content)
    if result:
        return result

    # Repair pass
    repair_prompt = (
        "Your previous output did not meet constraints (non-zero calories, numeric values, plausible ranges). "
        "Return corrected JSON ONLY with all the same keys and valid numbers within bounds."
    )
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": name},
            {"role": "user", "content": repair_prompt + "\n\nBad output:\n" + (content or "")},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content if response.choices else ""
    result = _parse(content)
    if result:
        return result

    raise RuntimeError("Failed to produce valid USDA-like nutrition estimate")


async def transcribe_audio_file(audio: UploadFile) -> str:
    client = _get_openai_client()
    audio_bytes = await audio.read()
    if not audio_bytes:
        return ""

    transcription = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(audio.filename or "audio.m4a", audio_bytes, audio.content_type or "application/octet-stream"),
    )
    return str(getattr(transcription, "text", "") or "")


async def infer_portion_from_text(transcript: str) -> Dict[str, Any]:
    client = _get_openai_client()
    cleaned = (transcript or "").strip()
    if not cleaned:
        return {"quantity": None, "unit": None}

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHEAP_MODEL or settings.OPENAI_MODEL or "gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You infer a portion amount from a user's spoken message. "
                    "Return JSON only with schema: {\"quantity\": number|null, \"unit\": \"g\"|\"oz\"|null}. "
                    "Rules: "
                    "- If the user gives grams, use unit 'g'. "
                    "- If the user gives ounces/oz, use unit 'oz'. "
                    "- If the user mentions a number without a unit, assume grams. "
                    "- If the user says something ambiguous (e.g. 'a scoop', 'one serving') and you cannot infer a numeric quantity, return nulls. "
                    "- Do not include any extra keys."
                ),
            },
            {"role": "user", "content": cleaned},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content if response.choices else ""
    extracted = extract_json_from_text(content)
    parsed = json.loads(extracted) if extracted else {}
    if not isinstance(parsed, dict):
        return {"quantity": None, "unit": None}

    qty = parsed.get("quantity")
    unit = parsed.get("unit")
    try:
        qty_num = float(qty) if qty is not None else None
    except Exception:
        qty_num = None

    if unit is not None:
        unit = str(unit).strip().lower()
        if unit not in {"g", "oz"}:
            unit = None

    return {"quantity": qty_num, "unit": unit}


async def parse_voice_meal_text(transcript: str) -> List[Dict[str, Any]]:
    client = _get_openai_client()
    cleaned = (transcript or "").strip()
    if not cleaned:
        return []

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHEAP_MODEL or settings.OPENAI_MODEL or "gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract structured food items from a meal description. "
                    "Return JSON only with the schema: {\"foods\": [{\"name\": string, \"quantity_grams\": number}]}. "
                    "IMPORTANT: Always return food names in English only (translate to English if the input is not English). "
                    "Food names must be plain ASCII/English, not native script. "
                    "IMPORTANT: Do NOT split a single dish into separate ingredient items. "
                    "Examples: 'cheese burrito with chicken filling' is ONE item (e.g. 'chicken and cheese burrito'), not three items 'cheese', 'burrito', 'chicken'. "
                    "Examples: 'pizza with pepperoni' is ONE item (e.g. 'pepperoni pizza'). "
                    "Examples: 'sandwich with turkey and cheese' is ONE item (e.g. 'turkey and cheese sandwich'). "
                    "If quantity is missing, infer a reasonable default portion size in grams. "
                    "If the user gives household measures (eggs, cups), convert to grams."
                ),
            },
            {"role": "user", "content": cleaned},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content if response.choices else ""
    extracted = extract_json_from_text(content)
    parsed = json.loads(extracted) if extracted else {}
    foods = parsed.get("foods", []) if isinstance(parsed, dict) else []
    if not isinstance(foods, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for f in foods:
        if not isinstance(f, dict):
            continue
        name = str(f.get("name", "")).strip()
        if not name:
            continue
        try:
            qty = float(f.get("quantity_grams", 0) or 0)
        except Exception:
            qty = 0.0
        normalized.append({"name": name, "quantity_grams": max(qty, 0.0)})

    try:
        def _norm_tokens(s: str) -> List[str]:
            s = (s or "").strip().lower()
            s = re.sub(r"[^a-z0-9 ]+", " ", s)
            s = re.sub(r"\s+", " ", s)
            return [t for t in s.split(" ") if t]

        base = {
            "burrito",
            "taco",
            "wrap",
            "sandwich",
            "sub",
            "burger",
            "pizza",
            "pasta",
            "salad",
            "curry",
            "rice",
            "noodles",
            "bowl",
        }
        ignore_fillers = {
            "with",
            "and",
            "a",
            "an",
            "the",
            "filling",
            "stuffed",
            "inside",
        }

        cleaned_tokens = set(_norm_tokens(cleaned))
        has_with_context = ("with" in cleaned_tokens) or ("filling" in cleaned_tokens)

        if has_with_context and len(normalized) >= 2:
            base_idx = None
            base_word = None
            for i, item in enumerate(normalized):
                toks = _norm_tokens(item.get("name") or "")
                for t in toks:
                    if t in base:
                        base_idx = i
                        base_word = t
                        break
                if base_idx is not None:
                    break

            if base_idx is not None and base_word is not None:
                ingredient_parts: List[str] = []
                for i, item in enumerate(normalized):
                    if i == base_idx:
                        continue
                    toks = _norm_tokens(item.get("name") or "")
                    for t in toks:
                        if t in base or t in ignore_fillers:
                            continue
                        if t.isdigit():
                            continue
                        ingredient_parts.append(t)

                ingredient_parts = [p for p in ingredient_parts if p]
                deduped: List[str] = []
                for p in ingredient_parts:
                    if p not in deduped:
                        deduped.append(p)

                if deduped:
                    prefix = " and ".join(deduped[:4])
                    merged_name = f"{prefix} {base_word}".strip()
                    merged_qty = float(normalized[base_idx].get("quantity_grams") or 0)
                    normalized = [{"name": merged_name, "quantity_grams": merged_qty}]
    except Exception:
        pass

    return normalized


async def match_food_to_database_db(conn: asyncpg.Connection, name: str, quantity_grams: float) -> Dict[str, Any]:
    original_name = (name or "").strip()
    if not original_name:
        raise HTTPException(status_code=400, detail="Food name is required")

    qty = float(quantity_grams or 0)
    multiplier = qty / 100.0

    row = await conn.fetchrow(
        """
        SELECT id, name, category,
               calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
               is_vegetarian
        FROM foods
        WHERE lower(name) = lower($1)
        LIMIT 1
        """,
        original_name,
    )

    if not row:
        def norm(s: str) -> str:
            s = (s or "").strip().lower()
            s = re.sub(r"[^a-z0-9 ]+", " ", s)
            s = re.sub(r"\s+", " ", s)
            return s.strip()

        query_norm = norm(original_name)
        query_tokens = [t for t in query_norm.split(" ") if t]
        query_is_short_single_token = len(query_tokens) == 1 and len(query_tokens[0]) <= 5
        
        logger.info(f"[FOOD_MATCH] Searching for '{original_name}' -> tokens: {query_tokens}")

        # SMARTER SEARCH: Search for foods containing ANY of the significant query tokens
        # Use the LAST token (usually the main food type like "burrito", "curry", "rice")
        # This ensures we find "bean and cheese burrito" when user says "cheese burrito"
        candidates = []
        
        # Strategy 1: Search by the main food token (last token, usually the food type)
        if query_tokens:
            main_token = query_tokens[-1]  # "burrito" from "cheese burrito"
            if len(main_token) >= 3:
                candidates = await conn.fetch(
                    """
                    SELECT id, name, category,
                           calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                           is_vegetarian
                    FROM foods
                    WHERE lower(name) LIKE '%' || lower($1) || '%'
                    ORDER BY length(name) ASC
                    LIMIT 100
                    """,
                    main_token,
                )
                logger.info(f"[FOOD_MATCH] Strategy 1 (main token '{main_token}'): found {len(candidates)} candidates")
        
        # Strategy 2: If no results, try the full name
        if not candidates:
            candidates = await conn.fetch(
                """
                SELECT id, name, category,
                       calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                       is_vegetarian
                FROM foods
                WHERE lower(name) LIKE '%' || lower($1) || '%'
                   OR lower($1) LIKE '%' || lower(name) || '%'
                ORDER BY length(name) ASC
                LIMIT 100
                """,
                original_name,
            )
            logger.info(f"[FOOD_MATCH] Strategy 2 (full name): found {len(candidates)} candidates")

        composite_keywords = {
            "burrito",
            "taco",
            "wrap",
            "sandwich",
            "sub",
            "burger",
            "pizza",
            "pasta",
            "salad",
            "curry",
            "rice",
            "noodles",
            "bowl",
        }

        if not candidates:
            has_composite_keyword = any(t in composite_keywords for t in query_tokens)
            filler_tokens = {"with", "and", "a", "an", "the", "filling", "stuffed", "inside"}
            non_filler = [t for t in query_tokens if t not in filler_tokens]
            base_tokens_present = [t for t in non_filler if t in composite_keywords]
            descriptor_tokens = [t for t in non_filler if t not in composite_keywords]
            has_descriptor = len(descriptor_tokens) > 0

            # Only force clarification when the dish is underspecified.
            # Examples that SHOULD clarify: 'burrito', 'cheese burrito'
            # Examples that should NOT clarify: 'chicken and cheese burrito'
            should_force_clarify = has_composite_keyword and (not has_descriptor)

            if should_force_clarify:
                question = (
                    f"Quick question: when you said '{original_name}', what filling/type and size was it? "
                    "Please say it again like: 'small chicken burrito' or 'medium bean burrito' or 'large veggie burrito'."
                )
                return {
                    "name": original_name,
                    "quantity": qty,
                    "matched": False,
                    "needs_review": True,
                    "needs_clarification": True,
                    "follow_up_question": question,
                    "options": [],
                }

        scored: List[Dict[str, Any]] = []
        best_row = None
        best_score = 0.0
        
        # Track candidates where ALL query tokens appear (strong signal for clarification)
        token_contained_candidates: List[Dict[str, Any]] = []
        
        for cand in candidates or []:
            cand_name = str(cand.get("name") or "")
            cand_norm = norm(cand_name)
            if not cand_norm:
                continue
            
            cand_tokens = [t for t in cand_norm.split(" ") if t]
            
            # Check if ALL query tokens appear in candidate
            query_tokens_in_cand = sum(1 for qt in query_tokens if qt in cand_tokens)
            all_query_tokens_in_cand = query_tokens_in_cand == len(query_tokens) and len(query_tokens) > 0
            
            # Calculate fuzzy ratio
            ratio = difflib.SequenceMatcher(None, query_norm, cand_norm).ratio()
            
            # Token overlap score (how many query tokens are in candidate)
            token_overlap = query_tokens_in_cand / float(len(query_tokens)) if query_tokens else 0.0
            
            # Skip single short tokens matching multi-word foods unless very high ratio
            if query_is_short_single_token and len(cand_tokens) >= 2 and ratio < 0.95:
                continue
            
            # NEW SCORING: Weight token containment MORE heavily
            # If all query tokens are in candidate, boost score significantly
            if all_query_tokens_in_cand:
                # Strong boost for full token containment
                score = (ratio * 0.4) + (token_overlap * 0.6)
                # Additional boost if candidate has more tokens (it's a more specific variant)
                if len(cand_tokens) > len(query_tokens):
                    score = max(score, 0.7)  # Ensure it's at least 0.7 for clarification
                token_contained_candidates.append({"row": cand, "score": float(score)})
                logger.info(f"[FOOD_MATCH] Token-contained candidate: '{cand_name}' (score={score:.3f}, all_tokens={all_query_tokens_in_cand})")
            else:
                score = (ratio * 0.75) + (token_overlap * 0.25)
            
            scored.append({"row": cand, "score": float(score)})
            if score > best_score:
                best_score = score
                best_row = cand
        
        logger.info(f"[FOOD_MATCH] Found {len(token_contained_candidates)} token-contained candidates, {len(scored)} total candidates")

        # Sort all scored candidates
        scored_sorted = sorted(scored, key=lambda x: x.get("score", 0.0), reverse=True)
        
        # CRITICAL: If we have candidates where ALL query tokens appear, those are strong clarification signals
        # This handles "cheese burrito" -> ["bean and cheese burrito", "chicken cheese burrito"]
        if token_contained_candidates:
            # Sort by score and use these for clarification
            token_contained_sorted = sorted(token_contained_candidates, key=lambda x: x.get("score", 0.0), reverse=True)
            plausible = token_contained_sorted[:10]
        else:
            # Fallback to general scoring with lower threshold
            plausible = [s for s in scored_sorted if float(s.get("score") or 0) >= 0.55]
        
        # FOOLPROOF LOGIC: If we found foods where ALL query tokens appear, ALWAYS ask for clarification
        # This ensures "cheese burrito" -> ["bean and cheese burrito", "chicken cheese burrito"]
        has_token_contained_variants = len(token_contained_candidates) > 0
        
        if has_token_contained_variants and plausible:
            # We have variants that contain all query tokens - ALWAYS ask for clarification
            top_options = []
            for s in plausible[:5]:
                r = s["row"]
                top_options.append(
                    {
                        "food_id": str(r.get("id")),
                        "name": str(r.get("name")),
                        "category": r.get("category"),
                        "calories_per_100g": float(r.get("calories_per_100g") or 0),
                        "protein_per_100g": float(r.get("protein_per_100g") or 0),
                        "carbs_per_100g": float(r.get("carbs_per_100g") or 0),
                        "fat_per_100g": float(r.get("fat_per_100g") or 0),
                        "score": round(float(s.get("score") or 0), 3),
                    }
                )

            question = (
                f"Quick question: when you said '{original_name}', which one did you mean? "
                "If none match, say it again with size + details like: 'small chicken burrito' / 'medium paneer burrito' / 'large veggie burrito'."
            )
            return {
                "name": original_name,
                "quantity": qty,
                "matched": False,
                "needs_review": True,
                "needs_clarification": True,
                "follow_up_question": question,
                "options": top_options,
            }
        
        if best_row is not None:
            # Check for ambiguity: multiple candidates with similar scores
            ambiguous = False
            if len(scored_sorted) >= 2:
                second_best_score = float(scored_sorted[1].get("score") or 0)
                # If top 2 scores are within 0.15 of each other, it's ambiguous
                if best_score - second_best_score < 0.15 and second_best_score >= 0.55:
                    ambiguous = True
            
            # Lower threshold for auto-match, prefer asking over guessing
            min_score = 0.92
            if query_is_short_single_token:
                min_score = 0.95
            
            # If ambiguous OR score below threshold, ask for clarification
            should_clarify = ambiguous or (best_score < min_score)
            
            if not should_clarify and best_score >= min_score:
                row = best_row
            else:
                # Ask a follow-up question instead of guessing
                if plausible:
                    top_options = []
                    for s in plausible[:5]:
                        r = s["row"]
                        top_options.append(
                            {
                                "food_id": str(r.get("id")),
                                "name": str(r.get("name")),
                                "category": r.get("category"),
                                "calories_per_100g": float(r.get("calories_per_100g") or 0),
                                "protein_per_100g": float(r.get("protein_per_100g") or 0),
                                "carbs_per_100g": float(r.get("carbs_per_100g") or 0),
                                "fat_per_100g": float(r.get("fat_per_100g") or 0),
                                "score": round(float(s.get("score") or 0), 3),
                            }
                        )

                    question = (
                        f"Quick question: when you said '{original_name}', which one did you mean? "
                        "If none match, say it again with size + details like: 'small chicken burrito' / 'medium paneer burrito' / 'large veggie burrito'."
                    )
                    return {
                        "name": original_name,
                        "quantity": qty,
                        "matched": False,
                        "needs_review": True,
                        "needs_clarification": True,
                        "follow_up_question": question,
                        "options": top_options,
                    }
        elif plausible:
            # No high-confidence match, but have plausible variants - ask for clarification
            top_options = []
            for s in plausible[:5]:
                r = s["row"]
                top_options.append(
                    {
                        "food_id": str(r.get("id")),
                        "name": str(r.get("name")),
                        "category": r.get("category"),
                        "calories_per_100g": float(r.get("calories_per_100g") or 0),
                        "protein_per_100g": float(r.get("protein_per_100g") or 0),
                        "carbs_per_100g": float(r.get("carbs_per_100g") or 0),
                        "fat_per_100g": float(r.get("fat_per_100g") or 0),
                        "score": round(float(s.get("score") or 0), 3),
                    }
                )

            question = (
                f"Quick question: when you said '{original_name}', which one did you mean? "
                "If none match, say it again with size + details like: 'small chicken burrito' / 'medium paneer burrito' / 'large veggie burrito'."
            )
            return {
                "name": original_name,
                "quantity": qty,
                "matched": False,
                "needs_review": True,
                "needs_clarification": True,
                "follow_up_question": question,
                "options": top_options,
                }

    if row:
        return {
            "food_id": str(row["id"]),
            "name": row["name"],
            "quantity": qty,
            "calories": round(float(row.get("calories_per_100g", 0) or 0) * multiplier, 2),
            "protein": round(float(row.get("protein_per_100g", 0) or 0) * multiplier, 2),
            "carbs": round(float(row.get("carbs_per_100g", 0) or 0) * multiplier, 2),
            "fat": round(float(row.get("fat_per_100g", 0) or 0) * multiplier, 2),
            "calories_per_100g": float(row.get("calories_per_100g", 0) or 0),
            "protein_per_100g": float(row.get("protein_per_100g", 0) or 0),
            "carbs_per_100g": float(row.get("carbs_per_100g", 0) or 0),
            "fat_per_100g": float(row.get("fat_per_100g", 0) or 0),
            "matched": True,
            "needs_review": False,
        }

    calories_per_100g = 0.0
    protein_per_100g = 0.0
    carbs_per_100g = 0.0
    fat_per_100g = 0.0
    micros_per_100g: Dict[str, float] = {}

    try:
        calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, micros_per_100g = (
            await _estimate_usda_like_nutrition_per_100g(original_name)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to estimate nutrition for '{original_name}': {type(e).__name__}: {str(e)}")

    if calories_per_100g <= 0:
        raise HTTPException(status_code=500, detail=f"Failed to estimate non-zero nutrition for '{original_name}'")

    food_id = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO foods (
            id, name, category,
            calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
            is_vegetarian, source, verified, review_status, last_used_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'user', false, 'pending_review', now())
        ON CONFLICT (id) DO NOTHING
        """,
        food_id,
        original_name,
        "user",
        float(calories_per_100g),
        float(protein_per_100g),
        float(carbs_per_100g),
        float(fat_per_100g),
    )

    if micros_per_100g:
        try:
            await conn.execute(
                """
                UPDATE foods SET
                    fiber_g_per_100g = $2,
                    sugar_g_per_100g = $3,
                    saturated_fat_g_per_100g = $4,
                    trans_fat_g_per_100g = $5,
                    cholesterol_mg_per_100g = $6,
                    sodium_mg_per_100g = $7,
                    potassium_mg_per_100g = $8,
                    vitamin_a_ug_per_100g = $9,
                    calcium_mg_per_100g = $10,
                    iron_mg_per_100g = $11,
                    magnesium_mg_per_100g = $12,
                    phosphorus_mg_per_100g = $13,
                    zinc_mg_per_100g = $14,
                    copper_mg_per_100g = $15,
                    manganese_mg_per_100g = $16,
                    selenium_ug_per_100g = $17,
                    vitamin_c_mg_per_100g = $18,
                    vitamin_d_ug_per_100g = $19,
                    vitamin_e_mg_per_100g = $20,
                    vitamin_k_ug_per_100g = $21,
                    thiamin_b1_mg_per_100g = $22,
                    riboflavin_b2_mg_per_100g = $23,
                    niacin_b3_mg_per_100g = $24,
                    vitamin_b6_mg_per_100g = $25,
                    folate_ug_per_100g = $26,
                    vitamin_b12_ug_per_100g = $27,
                    caffeine_mg_per_100g = $28,
                    alcohol_g_per_100g = $29
                WHERE id = $1
                """,
                food_id,
                float(micros_per_100g.get("fiber_g_per_100g") or 0),
                float(micros_per_100g.get("sugar_g_per_100g") or 0),
                float(micros_per_100g.get("saturated_fat_g_per_100g") or 0),
                float(micros_per_100g.get("trans_fat_g_per_100g") or 0),
                float(micros_per_100g.get("cholesterol_mg_per_100g") or 0),
                float(micros_per_100g.get("sodium_mg_per_100g") or 0),
                float(micros_per_100g.get("potassium_mg_per_100g") or 0),
                float(micros_per_100g.get("vitamin_a_ug_per_100g") or 0),
                float(micros_per_100g.get("calcium_mg_per_100g") or 0),
                float(micros_per_100g.get("iron_mg_per_100g") or 0),
                float(micros_per_100g.get("magnesium_mg_per_100g") or 0),
                float(micros_per_100g.get("phosphorus_mg_per_100g") or 0),
                float(micros_per_100g.get("zinc_mg_per_100g") or 0),
                float(micros_per_100g.get("copper_mg_per_100g") or 0),
                float(micros_per_100g.get("manganese_mg_per_100g") or 0),
                float(micros_per_100g.get("selenium_ug_per_100g") or 0),
                float(micros_per_100g.get("vitamin_c_mg_per_100g") or 0),
                float(micros_per_100g.get("vitamin_d_ug_per_100g") or 0),
                float(micros_per_100g.get("vitamin_e_mg_per_100g") or 0),
                float(micros_per_100g.get("vitamin_k_ug_per_100g") or 0),
                float(micros_per_100g.get("thiamin_b1_mg_per_100g") or 0),
                float(micros_per_100g.get("riboflavin_b2_mg_per_100g") or 0),
                float(micros_per_100g.get("niacin_b3_mg_per_100g") or 0),
                float(micros_per_100g.get("vitamin_b6_mg_per_100g") or 0),
                float(micros_per_100g.get("folate_ug_per_100g") or 0),
                float(micros_per_100g.get("vitamin_b12_ug_per_100g") or 0),
                float(micros_per_100g.get("caffeine_mg_per_100g") or 0),
                float(micros_per_100g.get("alcohol_g_per_100g") or 0),
            )
        except Exception as e:
            logger.warning(
                "Failed to persist micronutrients for food_id=%s: %s: %s",
                str(food_id),
                type(e).__name__,
                str(e),
            )

    return {
        "food_id": str(food_id),
        "name": original_name,
        "quantity": qty,
        "calories": round(calories_per_100g * multiplier, 2),
        "protein": round(protein_per_100g * multiplier, 2),
        "carbs": round(carbs_per_100g * multiplier, 2),
        "fat": round(fat_per_100g * multiplier, 2),
        "calories_per_100g": calories_per_100g,
        "protein_per_100g": protein_per_100g,
        "carbs_per_100g": carbs_per_100g,
        "fat_per_100g": fat_per_100g,
        "matched": False,
        "needs_review": True,
        "is_estimated": True,
    }


async def analyze_food_image(image_base64: str) -> Dict[str, Any]:
    client = _get_openai_client()
    normalized_image_base64 = normalize_base64_image(image_base64)
    image_url = f"data:image/jpeg;base64,{normalized_image_base64}"

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL or "gpt-4o",
        messages=[
            {
                "role": "system",
                "content": "You are a nutrition expert analyzing food images. Always respond with valid JSON only.",
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Analyze this food image and identify all food items. "
                            "Return ONLY a JSON response with format: "
                            "{\"foods\": [{\"name\": string, \"estimated_quantity_grams\": number, \"confidence\": \"high\"|\"medium\"|\"low\"}], "
                            "\"notes\": string}."
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
    parsed = json.loads(extracted) if extracted else {}
    if not isinstance(parsed, dict):
        return {"foods": [], "notes": ""}
    return parsed
