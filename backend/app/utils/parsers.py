"""
Text and image parsing utilities.
Handles base64 image normalization and JSON extraction from text.
"""

import json
import re
import uuid
import difflib
import logging
from typing import Any, Dict, List, Optional

import asyncpg
from fastapi import HTTPException, UploadFile
from openai import AsyncOpenAI

from app.core.config import settings


logger = logging.getLogger(__name__)


def normalize_base64_image(image_base64: str) -> str:
    if not image_base64:
        return image_base64
    if "," in image_base64 and image_base64.strip().lower().startswith("data:"):
        return image_base64.split(",", 1)[1]
    return image_base64


def extract_json_from_text(text: str) -> str:
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

# Generic unit → grams (used when no food-specific entry is available)
# These are last-resort fallbacks; always prefer _FOOD_SERVING_FALLBACK entries.
_SERVING_SIZE_FALLBACK: Dict[str, float] = {
    "g":       1.0,
    "oz":      28.35,
    "ml":      1.0,
    "tbsp":    15.0,
    "tsp":     5.0,
    "cup":     240.0,   # correct for liquids (milk, tea, water); solids use food-specific overrides
    "katori":  150.0,
    "serving": 150.0,   # bumped from 100g — typical Indian meal serving is closer to 150g
    "scoop":   30.0,    # standard protein/supplement scoop
    "plate":   300.0,
    "slice":   30.0,
    "piece":   100.0,
    "medium":  150.0,
    "large":   200.0,
    "small":   80.0,
}

# Food-specific fallbacks — (normalised_food_name, unit_name): grams_per_unit
_FOOD_SERVING_FALLBACK: Dict[tuple, float] = {
    # ── Indian breads ──────────────────────────────────────────────────────────
    ("roti", "piece"):           35.0,
    ("roti", "large"):           50.0,
    ("roti", "small"):           25.0,
    ("chapati", "piece"):        35.0,
    ("chapati", "large"):        50.0,
    ("chapati", "small"):        25.0,
    ("paratha", "piece"):        60.0,
    ("paratha", "large"):        80.0,
    ("paratha", "small"):        45.0,
    ("puri", "piece"):           25.0,
    ("puri", "large"):           35.0,
    ("naan", "piece"):           90.0,
    ("naan", "large"):          120.0,
    ("bhatura", "piece"):        80.0,
    ("thepla", "piece"):         40.0,
    ("dosa", "piece"):           80.0,
    ("dosa", "large"):          100.0,
    ("idli", "piece"):           40.0,
    ("vada", "piece"):           50.0,
    ("medu vada", "piece"):      50.0,
    ("uttapam", "piece"):       100.0,
    ("missi roti", "piece"):     40.0,

    # ── Rice (USDA: 1 cup cooked long-grain white rice ≈ 186 g) ───────────────
    ("rice", "cup"):            185.0,
    ("rice", "serving"):        185.0,
    ("white rice", "cup"):      185.0,
    ("white rice", "serving"):  185.0,
    ("brown rice", "cup"):      195.0,
    ("brown rice", "serving"):  195.0,
    ("basmati rice", "cup"):    185.0,
    ("basmati rice", "serving"):185.0,
    ("jeera rice", "cup"):      185.0,
    ("fried rice", "cup"):      195.0,
    ("biryani", "cup"):         200.0,

    # ── Eggs ──────────────────────────────────────────────────────────────────
    ("egg", "piece"):            50.0,
    ("egg", "medium"):           50.0,
    ("egg", "large"):            60.0,
    ("egg", "small"):            40.0,
    ("boiled egg", "piece"):     50.0,
    ("boiled egg", "medium"):    50.0,
    ("boiled egg", "large"):     60.0,
    ("hard boiled egg", "piece"):50.0,
    ("hard boiled egg", "medium"):50.0,
    ("soft boiled egg", "piece"):50.0,
    ("soft boiled egg", "medium"):50.0,
    ("fried egg", "piece"):      50.0,
    ("fried egg", "medium"):     50.0,
    ("poached egg", "piece"):    50.0,
    ("poached egg", "medium"):   50.0,
    ("scrambled egg", "piece"):  50.0,
    ("scrambled egg", "medium"): 50.0,
    ("omelette", "piece"):      100.0,  # 2-egg omelette
    ("egg white", "piece"):      30.0,
    ("egg yolk", "piece"):       18.0,

    # ── Proteins ───────────────────────────────────────────────────────────────
    ("chicken breast", "piece"): 150.0,
    ("chicken leg", "piece"):    120.0,
    ("chicken leg", "medium"):   120.0,
    ("chicken wing", "piece"):    60.0,
    ("chicken thigh", "piece"):  120.0,
    ("fish fillet", "piece"):    150.0,
    ("fish fillet", "medium"):   150.0,
    ("paneer", "piece"):          35.0,  # small cube
    ("paneer", "slice"):          75.0,  # slab

    # ── Western breads & baked goods ──────────────────────────────────────────
    ("bread", "slice"):           30.0,
    ("white bread", "slice"):     30.0,
    ("whole wheat bread", "slice"):30.0,
    ("sourdough", "slice"):       35.0,
    ("bagel", "piece"):          100.0,
    ("croissant", "piece"):       57.0,
    ("burger bun", "piece"):      50.0,
    ("hot dog bun", "piece"):     40.0,
    ("english muffin", "piece"):  57.0,
    ("pancake", "piece"):         38.0,
    ("waffle", "piece"):          75.0,
    ("muffin", "piece"):         130.0,
    ("donut", "piece"):           60.0,
    ("cookie", "piece"):          30.0,
    ("biscuit", "piece"):         55.0,  # American-style; UK biscuit ≈ 12g but "cookie" catches it
    ("cracker", "piece"):          8.0,
    ("tortilla", "piece"):        45.0,  # flour tortilla (medium wrap)
    ("flour tortilla", "piece"):  45.0,
    ("corn tortilla", "piece"):   25.0,

    # ── Middle Eastern / Mediterranean breads ─────────────────────────────────
    ("pita", "piece"):            60.0,
    ("pita bread", "piece"):      60.0,
    ("flatbread", "piece"):       80.0,
    ("lavash", "piece"):          70.0,
    ("naan bread", "piece"):      90.0,

    # ── Latin American breads ─────────────────────────────────────────────────
    ("arepa", "piece"):          100.0,
    ("tostada", "piece"):         26.0,
    ("tamale", "piece"):         100.0,
    ("empanada", "piece"):        90.0,

    # ── Pasta & noodles (cooked) ──────────────────────────────────────────────
    ("pasta", "cup"):            140.0,
    ("pasta", "serving"):        180.0,
    ("spaghetti", "cup"):        140.0,
    ("spaghetti", "serving"):    180.0,
    ("penne", "cup"):            140.0,
    ("fettuccine", "cup"):       140.0,
    ("noodles", "cup"):          140.0,
    ("noodles", "serving"):      180.0,
    ("ramen", "serving"):        250.0,   # bowl with broth
    ("udon", "serving"):         250.0,
    ("soba", "serving"):         200.0,

    # ── Oats ──────────────────────────────────────────────────────────────────
    ("oatmeal", "cup"):          240.0,
    ("oats", "cup"):              80.0,   # dry rolled oats
    ("oats", "serving"):          40.0,   # standard dry serving

    # ── Western proteins ──────────────────────────────────────────────────────
    ("beef steak", "piece"):     200.0,
    ("beef steak", "medium"):    200.0,
    ("steak", "piece"):          200.0,
    ("steak", "medium"):         200.0,
    ("pork chop", "piece"):      150.0,
    ("pork chop", "medium"):     150.0,
    ("burger patty", "piece"):   120.0,
    ("burger", "piece"):         200.0,
    ("burger", "medium"):        200.0,
    ("hot dog", "piece"):         90.0,
    ("sausage", "piece"):         70.0,
    ("sausage link", "piece"):    45.0,
    ("bacon", "slice"):           15.0,
    ("meatball", "piece"):        30.0,
    ("meatball", "medium"):       30.0,

    # ── Seafood ───────────────────────────────────────────────────────────────
    ("salmon fillet", "piece"):  150.0,
    ("salmon", "piece"):         150.0,
    ("tuna steak", "piece"):     150.0,
    ("cod fillet", "piece"):     150.0,
    ("shrimp", "piece"):          15.0,
    ("prawn", "piece"):           15.0,
    ("oyster", "piece"):          50.0,
    ("scallop", "piece"):         30.0,

    # ── Assembled / fast food ─────────────────────────────────────────────────
    ("pizza", "slice"):          100.0,
    ("pizza slice", "slice"):    100.0,
    ("sandwich", "piece"):       200.0,
    ("sub", "piece"):            250.0,
    ("wrap", "piece"):           200.0,
    ("taco", "piece"):            80.0,
    ("burrito", "piece"):        300.0,
    ("shawarma", "piece"):       200.0,
    ("kebab", "piece"):          100.0,

    # ── East Asian ────────────────────────────────────────────────────────────
    ("sushi", "piece"):           25.0,
    ("sushi roll", "piece"):      25.0,
    ("nigiri", "piece"):          30.0,
    ("maki", "piece"):            25.0,
    ("dumpling", "piece"):        30.0,
    ("gyoza", "piece"):           20.0,
    ("dim sum", "piece"):         30.0,
    ("spring roll", "piece"):     80.0,
    ("spring roll", "medium"):    80.0,
    ("wonton", "piece"):          20.0,
    ("baozi", "piece"):           50.0,
    ("bao", "piece"):             50.0,

    # ── Middle Eastern / Mediterranean proteins ───────────────────────────────
    ("falafel", "piece"):         30.0,
    ("falafel", "medium"):        30.0,

    # ── Dairy ────────────────────────────────────────────────────────────────
    ("cheese", "slice"):          20.0,
    ("cheese slice", "slice"):    20.0,

    # ── Protein supplements ────────────────────────────────────────────────────
    ("whey protein", "scoop"):          30.0,
    ("whey protein", "serving"):        30.0,
    ("protein powder", "scoop"):        30.0,
    ("protein powder", "serving"):      30.0,
    ("whey protein powder", "scoop"):   30.0,
    ("whey protein powder", "serving"): 30.0,
    ("casein protein", "scoop"):        35.0,
    ("casein protein", "serving"):      35.0,
    ("mass gainer", "scoop"):          100.0,
    ("mass gainer", "serving"):        100.0,
    ("creatine", "scoop"):               5.0,
    ("creatine", "tsp"):                 5.0,
    ("pre workout", "scoop"):           10.0,
    ("pre-workout", "scoop"):           10.0,
    ("bcaa", "scoop"):                  10.0,

    # ── Snacks / sweets ───────────────────────────────────────────────────────
    ("chocolate bar", "piece"):   45.0,
    ("chocolate", "piece"):       10.0,   # individual square

    # ── Fruits ────────────────────────────────────────────────────────────────
    ("banana", "piece"):         120.0,
    ("banana", "medium"):        120.0,
    ("banana", "large"):         150.0,
    ("banana", "small"):          80.0,
    ("apple", "piece"):          180.0,
    ("apple", "medium"):         180.0,
    ("apple", "large"):          220.0,
    ("apple", "small"):          130.0,
    ("orange", "piece"):         150.0,
    ("orange", "medium"):        150.0,
    ("mango", "piece"):          200.0,
    ("mango", "medium"):         200.0,
    ("mango", "large"):          300.0,
    ("pear", "piece"):           180.0,
    ("pear", "medium"):          180.0,
    ("peach", "piece"):          150.0,
    ("peach", "medium"):         150.0,
    ("plum", "piece"):            65.0,
    ("plum", "medium"):           65.0,
    ("kiwi", "piece"):            70.0,
    ("kiwi", "medium"):           70.0,
    ("avocado", "piece"):        150.0,
    ("avocado", "medium"):       150.0,
    ("strawberry", "piece"):      12.0,
    ("grape", "piece"):            5.0,
    ("watermelon", "slice"):     300.0,
    ("pineapple", "slice"):       80.0,
    ("lemon", "piece"):           60.0,
    ("lime", "piece"):            45.0,
}


def _grams_from_serving_size_list(
    serving_sizes: List[Dict],
    unit: str,
    quantity_value: float,
) -> Optional[float]:
    """Resolve grams from an in-memory serving_sizes list (used before DB insert).

    Returns qty_grams if a matching unit is found, else None.
    """
    unit_norm = (unit or "").strip().lower()
    for s in serving_sizes:
        if str(s.get("unit_name") or "").strip().lower() == unit_norm:
            g = float(s.get("grams") or 0)
            if g > 0:
                return quantity_value * g
    return None


async def _resolve_quantity_grams(
    conn: asyncpg.Connection,
    food_id: Optional[Any],
    food_name: str,
    quantity_value: float,
    quantity_unit: str,
    ai_serving_sizes: Optional[List[Dict]] = None,
) -> float:
    """Resolve a named serving unit to grams.

    Resolution order:
      1. Direct weight units (g, oz, ml)
      2. In-memory AI serving sizes (used for first-time food before DB insert)
      3. food_serving_sizes DB table (food-specific)
      4. _FOOD_SERVING_FALLBACK dict (food-specific hardcoded)
      5. _SERVING_SIZE_FALLBACK dict (generic unit weights)
      6. 100 g per unit as last resort
    """
    unit = (quantity_unit or "g").strip().lower()

    if unit == "g":
        return quantity_value
    if unit == "oz":
        return quantity_value * 28.35
    if unit == "ml":
        return quantity_value

    # AI serving sizes list (in-memory, used before DB insert for first-time foods)
    if ai_serving_sizes:
        result = _grams_from_serving_size_list(ai_serving_sizes, unit, quantity_value)
        if result is not None:
            return result

    # DB lookup (only if we have a food_id)
    if food_id is not None:
        try:
            row = await conn.fetchrow(
                "SELECT grams FROM food_serving_sizes WHERE food_id = $1 AND unit_name = $2",
                food_id,
                unit,
            )
            if row and row["grams"] and float(row["grams"]) > 0:
                return quantity_value * float(row["grams"])
        except Exception:
            pass

    # Food-specific hardcoded fallback
    food_norm = (food_name or "").strip().lower()
    key = (food_norm, unit)
    if key in _FOOD_SERVING_FALLBACK:
        return quantity_value * _FOOD_SERVING_FALLBACK[key]

    # Generic unit fallback
    if unit in _SERVING_SIZE_FALLBACK:
        return quantity_value * _SERVING_SIZE_FALLBACK[unit]

    # Unknown unit: assume 100 g per unit
    return quantity_value * 100.0


async def _estimate_usda_like_nutrition_per_100g(
    food_name: str,
) -> tuple[float, float, float, float, Dict[str, float], List[Dict]]:
    """Single API call returning macros + micros per 100 g plus common serving sizes."""
    client = _get_openai_client()
    name = (food_name or "").strip()
    if not name:
        raise ValueError("food_name is required")

    macro_keys = "calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g"
    system_prompt = (
        "You are estimating USDA-style nutrition per 100 grams for a food item. "
        "Return ONLY valid JSON with ALL of these exact keys: "
        + macro_keys + ", " + ", ".join(_MICRO_KEYS) + ", serving_sizes. "
        "Rules: calories_per_100g > 0 and <= 900; protein/carbs/fat >= 0 and <= 100; "
        "all micronutrient values >= 0; use 0 if unknown, never null or negative. "
        "Units are encoded in each key name (g, mg, ug per 100g). "
        "serving_sizes: array of 1-3 most common serving sizes for this food, each with keys "
        "unit_name (one of: piece, katori, cup, tbsp, tsp, g, oz, ml, serving, slice, medium, large, small, plate), "
        "unit_label (human-readable e.g. '1 katori (small bowl)'), "
        "grams (weight of ONE unit as a number), "
        "is_default (true for the most typical serving, false for others)."
    )

    def _parse(content: str) -> tuple[float, float, float, float, Dict[str, float], List[Dict]] | None:
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
        # Parse serving sizes (best-effort, never fail)
        sizes: List[Dict] = []
        raw_sizes = parsed.get("serving_sizes", [])
        if isinstance(raw_sizes, list):
            for s in raw_sizes:
                if not isinstance(s, dict):
                    continue
                un = str(s.get("unit_name") or "").strip().lower()
                ul = str(s.get("unit_label") or "").strip()
                g = _safe_nonneg_float(s.get("grams"))
                if not un or g <= 0:
                    continue
                sizes.append({
                    "unit_name": un,
                    "unit_label": ul or f"1 {un}",
                    "grams": g,
                    "is_default": bool(s.get("is_default", False)),
                })
        return cal, p, c, f, micros, sizes

    model = settings.OPENAI_MODEL or "gpt-4o"

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


async def _store_serving_sizes(
    conn: asyncpg.Connection,
    food_id: Any,
    sizes: List[Dict],
) -> None:
    """Persist serving sizes to food_serving_sizes table (best-effort)."""
    for s in sizes:
        try:
            await conn.execute(
                """
                INSERT INTO food_serving_sizes (food_id, unit_name, unit_label, grams, is_default)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (food_id, unit_name) DO NOTHING
                """,
                food_id,
                s["unit_name"],
                s["unit_label"],
                float(s["grams"]),
                bool(s["is_default"]),
            )
        except Exception as e:
            logger.warning(
                "Failed to store serving size food_id=%s unit=%s: %s",
                str(food_id), s.get("unit_name"), str(e),
            )


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


_PARSE_SYSTEM_PROMPT = """\
You are a global nutrition expert extracting individual food items from meal descriptions in any language or cuisine.
Return JSON ONLY: {"foods": [{"name": string, "quantity_value": number, "quantity_unit": string}]}

Valid quantity_unit values: "piece", "katori", "cup", "tbsp", "tsp", "g", "oz", "ml", "serving", "scoop", "slice", "medium", "plate"

## Unit guide by food category

### Breads & flatbreads  → "piece" or "slice"
Indian:        roti/chapati (≈35g) | paratha (≈60g) | puri (≈25g) | naan (≈90g)
               bhatura (≈80g) | thepla (≈40g) | dosa (≈80g) | idli (≈40g)
               vada/medu vada (≈50g) | uttapam (≈100g)
Western:       bread/toast → "slice" (≈30g) | bagel (≈100g) | croissant (≈57g)
               burger bun (≈50g) | english muffin (≈57g) | muffin (≈130g)
               pancake (≈38g) | waffle (≈75g) | cookie (≈30g) | donut (≈60g)
Middle Eastern: pita (≈60g) | flatbread (≈80g) | lavash (≈70g)
Latin:         flour tortilla (≈45g) | corn tortilla (≈25g) | arepa (≈100g)

### Rice & grains (cooked unless noted)
  Indian rice (side)       → "cup"     (≈185 g)
  Indian rice (full meal)  → "plate"   (≈300 g)
  pasta / noodles          → "cup"     (≈140 g cooked)
  oatmeal (cooked)         → "cup"     (≈240 g)
  oats (dry)               → "serving" (≈40 g)
  couscous / quinoa        → "cup"     (≈160 g cooked)

### Indian wet dishes  → "katori" (≈150 g)
  dal / lentils | curry | sabzi | paneer dish | raita | curd | korma
  Use "cup" (≈240 ml) for: sambar | soup | any thin liquid dish

### Condiments
  chutney / sauce / dip / gravy   → "tbsp"
  pickle / jam / spread (small)   → "tsp"
  salad dressing / oil / ghee / butter → "tbsp" or "tsp"

### Eggs  → "piece" (≈50 g each)
  boiled / fried / poached / scrambled / hard-boiled
  omelette → "piece" (≈100 g, i.e. 2-egg)
  egg white → "piece" (≈30 g) | egg yolk → "piece" (≈18 g)

### Proteins — whole cuts  → "piece"
  chicken breast (≈150g) | chicken leg/thigh (≈120g) | chicken wing (≈60g)
  beef steak / pork chop (≈150–200g) | fish fillet / salmon (≈150g)
  shrimp / prawn (≈15g each) | sausage (≈70g) | meatball (≈30g)
  paneer cube (≈35g) | kebab skewer (≈100g) | falafel ball (≈30g)

### Proteins in sauce → "katori" (Indian) or "cup" (Western)
  chicken curry | fish curry | paneer masala   → "katori"
  beef stew | chili | clam chowder             → "cup"

### Assembled / fast food  → "piece" or "slice"
  burger (≈200g) | hot dog (≈90g) | pizza → "slice" (≈100g)
  sandwich / sub / wrap (≈200–250g) | taco (≈80g) | burrito (≈300g)
  shawarma / döner (≈200g) | empanada (≈90g) | tamale (≈100g)

### East Asian  → "piece"
  sushi / maki / nigiri (≈25–30g) | dumpling / gyoza / wonton (≈20–30g)
  spring roll (≈80g) | baozi / bao (≈50g)
  ramen / udon → "serving" (includes broth, ≈250 g solid content)

### Dairy
  cheese → "slice" (≈20g) | milk / yoghurt / cream → "cup" or "ml"

### Beverages → "cup" or "ml"
  milk | tea | coffee | juice | smoothie | water | soda | broth

### Fruit → "medium" or "piece"
  Large fruit (banana, apple, orange, mango, pear, peach, avocado) → "medium"
  Small fruit (kiwi, plum, lemon, lime, strawberry, grape)          → "piece"
  Sliced (watermelon, pineapple)                                    → "slice"

### Snacks & sweets
  chocolate bar → "piece" (≈45g) | individual square → "piece" (≈10g)
  chips / crisps / nuts → "g" if weight known, else "serving"

### Protein supplements & powders → "scoop" (≈30 g per scoop)
  whey protein / casein / protein powder / protein shake → "scoop"
  mass gainer → "scoop" (≈100 g)
  creatine → "scoop" or "tsp" (≈5 g)
  pre-workout / BCAA → "scoop" (≈10 g)
  If the user gives grams explicitly (e.g. "30g whey"), use "g".

## Rules: SEPARATE vs COMBINED

COMBINE (the filling/topping defines the dish):
  "pizza with pepperoni"            → "pepperoni pizza"
  "sandwich with turkey and cheese" → "turkey cheese sandwich"
  "burrito with chicken"            → "chicken burrito"
  "pasta with meatballs"            → "meatball pasta"
  "omelette with vegetables"        → "vegetable omelette"
  "biryani with mutton"             → "mutton biryani"
  "fried rice with egg"             → "egg fried rice"
  "ramen with chashu"               → "chashu ramen"
  "noodles with beef"               → "beef noodles"

KEEP SEPARATE (starch/base + side dish = a plate, not one food):
  Indian:    "roti with dal"  → roti + dal
             "paratha with curd" → paratha + curd
             "dosa with sambar and chutney" → dosa + sambar + coconut chutney
             "idli with sambar" → idli + sambar
             "rice with rajma" → rice + rajma
  Western:   "bread with butter" → bread + butter
             "eggs with toast" → eggs + toast
             "steak with fries" → steak + fries
             "soup with bread" → soup + bread
  Asian:     "rice with stir fry" → rice + stir fry

RULE: If item A is a plain starch (rice, roti, naan, bread, pasta, tortilla, noodles, dosa, idli)
AND item B is a separate dish/side (curry, dal, sabzi, stew, sauce, beverage, condiment) — keep SEPARATE.

## Additional rules
- Return food names in English (translate from any language).
- Use authentic dish names: "bhindi masala" not "okra curry"; "rajma" not "kidney bean curry";
  "kimchi" not "Korean fermented cabbage"; "shakshuka" not "eggs in tomato sauce".
- NEVER use "large" or "small" as quantity_unit — always use "piece" for countable items
  and set quantity_value to the count.
- "1.5 roti" → {name: "roti", quantity_value: 1.5, quantity_unit: "piece"}
- "200g chicken" → {name: "chicken", quantity_value: 200, quantity_unit: "g"}
- "a bowl of soup" → {name: "soup", quantity_value: 1, quantity_unit: "cup"}
- If no quantity given, use 1 typical serving for that food type.
- Never return quantity_value = 0.
"""


async def parse_voice_meal_text(transcript: str) -> List[Dict[str, Any]]:
    client = _get_openai_client()
    cleaned = (transcript or "").strip()
    if not cleaned:
        return []

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL or "gpt-4o",
        messages=[
            {"role": "system", "content": _PARSE_SYSTEM_PROMPT},
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
            qty_val = float(f.get("quantity_value", 0) or 0)
        except Exception:
            qty_val = 0.0
        qty_unit = str(f.get("quantity_unit") or "piece").strip().lower() or "piece"
        normalized.append({"name": name, "quantity_value": max(qty_val, 0.0), "quantity_unit": qty_unit})

    try:
        def _norm_tokens(s: str) -> List[str]:
            s = (s or "").strip().lower()
            s = re.sub(r"[^a-z0-9 ]+", " ", s)
            s = re.sub(r"\s+", " ", s)
            return [t for t in s.split(" ") if t]

        # Only Western stuffed/topped dishes should be merged.
        # Indian staples (curry, rice, roti, dal) are separate plate items.
        base = {
            "burrito",
            "taco",
            "wrap",
            "sandwich",
            "sub",
            "burger",
            "pizza",
            "pasta",
            "noodles",
        }
        # Global plain starches and sides that should never be merged with their accompaniment.
        starch_staples = {
            # Indian breads
            "roti", "chapati", "paratha", "puri", "naan", "bhatura",
            "thepla", "dosa", "idli", "uttapam", "upma", "poha", "khichdi",
            # Indian sides
            "dal", "sabzi", "curry", "rajma", "chana",
            # Global starches
            "rice", "bread", "toast", "pasta", "spaghetti", "noodles",
            "tortilla", "pita", "couscous", "quinoa", "oats", "oatmeal",
            # Beverages (always separate)
            "tea", "coffee", "milk", "juice", "water", "chai",
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

        # Suppress merge if any item is a plain starch or side (never merge starch+side globally)
        has_starch_staple = any(
            t in starch_staples
            for item in normalized
            for t in _norm_tokens(item.get("name") or "")
        )

        if has_with_context and len(normalized) >= 2 and not has_starch_staple:
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
                    merged_qty_val = float(normalized[base_idx].get("quantity_value") or 1)
                    merged_qty_unit = str(normalized[base_idx].get("quantity_unit") or "piece")
                    normalized = [{"name": merged_name, "quantity_value": merged_qty_val, "quantity_unit": merged_qty_unit}]
    except Exception:
        pass

    return normalized


async def match_food_to_database_db(
    conn: asyncpg.Connection,
    name: str,
    quantity_value: float,
    quantity_unit: str = "g",
) -> Dict[str, Any]:
    original_name = (name or "").strip()
    if not original_name:
        raise HTTPException(status_code=400, detail="Food name is required")

    qty_val = float(quantity_value or 0)
    unit = (quantity_unit or "g").strip().lower()

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

        candidates = []

        # Strategy 1: Search by the main food token (last token, usually the food type)
        if query_tokens:
            main_token = query_tokens[-1]
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
            "burrito", "taco", "wrap", "sandwich", "sub", "burger",
            "pizza", "pasta", "salad", "curry", "rice", "noodles", "bowl",
        }

        if not candidates:
            has_composite_keyword = any(t in composite_keywords for t in query_tokens)
            filler_tokens = {"with", "and", "a", "an", "the", "filling", "stuffed", "inside"}
            non_filler = [t for t in query_tokens if t not in filler_tokens]
            descriptor_tokens = [t for t in non_filler if t not in composite_keywords]
            has_descriptor = len(descriptor_tokens) > 0
            should_force_clarify = has_composite_keyword and (not has_descriptor)

            if should_force_clarify:
                question = (
                    f"Quick question: when you said '{original_name}', what filling/type and size was it? "
                    "Please say it again like: 'small chicken burrito' or 'medium bean burrito' or 'large veggie burrito'."
                )
                return {
                    "name": original_name,
                    "quantity": qty_val,
                    "quantity_value": qty_val,
                    "quantity_unit": unit,
                    "matched": False,
                    "needs_review": True,
                    "needs_clarification": True,
                    "follow_up_question": question,
                    "options": [],
                }

        scored: List[Dict[str, Any]] = []
        best_row = None
        best_score = 0.0

        token_contained_candidates: List[Dict[str, Any]] = []

        for cand in candidates or []:
            cand_name = str(cand.get("name") or "")
            cand_norm = norm(cand_name)
            if not cand_norm:
                continue

            cand_tokens = [t for t in cand_norm.split(" ") if t]

            query_tokens_in_cand = sum(1 for qt in query_tokens if qt in cand_tokens)
            all_query_tokens_in_cand = query_tokens_in_cand == len(query_tokens) and len(query_tokens) > 0

            ratio = difflib.SequenceMatcher(None, query_norm, cand_norm).ratio()
            token_overlap = query_tokens_in_cand / float(len(query_tokens)) if query_tokens else 0.0

            if query_is_short_single_token and len(cand_tokens) >= 2 and ratio < 0.95:
                continue

            if all_query_tokens_in_cand:
                score = (ratio * 0.4) + (token_overlap * 0.6)
                if len(cand_tokens) > len(query_tokens):
                    score = max(score, 0.7)
                token_contained_candidates.append({"row": cand, "score": float(score)})
                logger.info(f"[FOOD_MATCH] Token-contained candidate: '{cand_name}' (score={score:.3f})")
            else:
                score = (ratio * 0.75) + (token_overlap * 0.25)

            scored.append({"row": cand, "score": float(score)})
            if score > best_score:
                best_score = score
                best_row = cand

        logger.info(f"[FOOD_MATCH] Found {len(token_contained_candidates)} token-contained candidates, {len(scored)} total")

        scored_sorted = sorted(scored, key=lambda x: x.get("score", 0.0), reverse=True)

        if token_contained_candidates:
            token_contained_sorted = sorted(token_contained_candidates, key=lambda x: x.get("score", 0.0), reverse=True)
            plausible = token_contained_sorted[:10]
        else:
            plausible = [s for s in scored_sorted if float(s.get("score") or 0) >= 0.55]

        has_token_contained_variants = len(token_contained_candidates) > 0

        if has_token_contained_variants and plausible:
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
                "quantity": qty_val,
                "quantity_value": qty_val,
                "quantity_unit": unit,
                "matched": False,
                "needs_review": True,
                "needs_clarification": True,
                "follow_up_question": question,
                "options": top_options,
            }

        if best_row is not None:
            ambiguous = False
            if len(scored_sorted) >= 2:
                second_best_score = float(scored_sorted[1].get("score") or 0)
                if best_score - second_best_score < 0.15 and second_best_score >= 0.55:
                    ambiguous = True

            min_score = 0.92
            if query_is_short_single_token:
                min_score = 0.95

            should_clarify = ambiguous or (best_score < min_score)

            if not should_clarify and best_score >= min_score:
                row = best_row
            else:
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
                        "quantity": qty_val,
                        "quantity_value": qty_val,
                        "quantity_unit": unit,
                        "matched": False,
                        "needs_review": True,
                        "needs_clarification": True,
                        "follow_up_question": question,
                        "options": top_options,
                    }
        elif plausible:
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
                "quantity": qty_val,
                "quantity_value": qty_val,
                "quantity_unit": unit,
                "matched": False,
                "needs_review": True,
                "needs_clarification": True,
                "follow_up_question": question,
                "options": top_options,
            }

    if row:
        qty_grams = await _resolve_quantity_grams(conn, row["id"], original_name, qty_val, unit)
        multiplier = qty_grams / 100.0
        calories = round(float(row.get("calories_per_100g", 0) or 0) * multiplier, 2)
        if calories > 2000:
            logger.warning(
                "[NUTRITION_SANITY] High calories for '%s': %.0f cal (%.0f g @ %.0f cal/100g, unit=%s qty=%.1f)",
                original_name, calories, qty_grams, float(row.get("calories_per_100g", 0) or 0), unit, qty_val,
            )
        return {
            "food_id": str(row["id"]),
            "name": row["name"],
            "quantity": qty_grams,
            "quantity_value": qty_val,
            "quantity_unit": unit,
            "calories": calories,
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

    # Tier 3: food not in DB — estimate nutrition with AI and persist
    calories_per_100g = 0.0
    protein_per_100g = 0.0
    carbs_per_100g = 0.0
    fat_per_100g = 0.0
    micros_per_100g: Dict[str, float] = {}
    serving_sizes: List[Dict] = []

    try:
        (
            calories_per_100g,
            protein_per_100g,
            carbs_per_100g,
            fat_per_100g,
            micros_per_100g,
            serving_sizes,
        ) = await _estimate_usda_like_nutrition_per_100g(original_name)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to estimate nutrition for '{original_name}': {type(e).__name__}: {str(e)}",
        )

    if calories_per_100g <= 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to estimate non-zero nutrition for '{original_name}'",
        )

    # Resolve grams — pass AI serving sizes so the first request also benefits from them
    qty_grams = await _resolve_quantity_grams(conn, None, original_name, qty_val, unit, ai_serving_sizes=serving_sizes)
    multiplier = qty_grams / 100.0

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
                str(food_id), type(e).__name__, str(e),
            )

    # Store AI-generated serving sizes for future lookups
    if serving_sizes:
        await _store_serving_sizes(conn, food_id, serving_sizes)

    estimated_calories = round(calories_per_100g * multiplier, 2)
    if estimated_calories > 2000:
        logger.warning(
            "[NUTRITION_SANITY] High calories for AI-estimated '%s': %.0f cal (%.0f g @ %.0f cal/100g, unit=%s qty=%.1f)",
            original_name, estimated_calories, qty_grams, calories_per_100g, unit, qty_val,
        )

    return {
        "food_id": str(food_id),
        "name": original_name,
        "quantity": qty_grams,
        "quantity_value": qty_val,
        "quantity_unit": unit,
        "calories": estimated_calories,
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
