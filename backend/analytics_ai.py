"""
AI-powered analytics generation with optimized prompts for cost efficiency.
Analyzes meal data to generate insights, bio-impact scores, and recommendations.

Bio impact scores are computed DETERMINISTICALLY from actual nutrient vs target
ratios — never from AI. AI is used only for text insights, alerts, and red flags.
"""

import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Deterministic Bio Impact Scoring
# ---------------------------------------------------------------------------

def _nutrient_adequacy_score(
    actual: float,
    rda: Optional[float],
    ul: Optional[float],
    higher_is_better: bool = True,
) -> float:
    """
    Score a single nutrient 0-100 based on intake vs RDA/UL.

    For nutrients where more is better (vitamins, minerals):
      0-79:  proportional to how close to RDA
      80-100: meeting or exceeding RDA (capped at 2x RDA)

    For nutrients where less is better (sugar, sodium, sat fat):
      70-100: below UL (better when further below)
      0-70:   above UL (penalized proportionally)
    """
    if higher_is_better:
        if rda is None or rda <= 0:
            return 50.0  # No target available, neutral
        ratio = actual / rda
        if ratio >= 1.0:
            return min(100.0, 80.0 + 20.0 * min(ratio, 2.0) / 2.0)
        else:
            return max(0.0, ratio * 80.0)
    else:
        if ul is None or ul <= 0:
            return 50.0
        if actual <= 0:
            return 100.0
        ratio = actual / ul
        if ratio <= 1.0:
            return 70.0 + 30.0 * (1.0 - ratio)
        else:
            over = ratio - 1.0
            return max(0.0, 70.0 - over * 70.0)


def _compute_bio_impact_scores(
    summary: Dict[str, Any],
    micro_targets: Dict[str, Dict],
) -> Dict[str, Any]:
    """
    Compute deterministic bio impact scores (0-100) based on actual nutrient
    values vs RDA/UL targets. No AI involved — pure math.
    """
    def avg(key: str) -> float:
        return float(summary.get(key, 0))

    def rda(nutrient: str) -> Optional[float]:
        return (micro_targets or {}).get(nutrient, {}).get("rda")

    def ul(nutrient: str) -> Optional[float]:
        return (micro_targets or {}).get(nutrient, {}).get("ul")

    def sh(val: float, nut: str) -> float:
        """Score higher-is-better nutrient."""
        return _nutrient_adequacy_score(val, rda(nut), ul(nut), True)

    def sl(val: float, nut: str) -> float:
        """Score lower-is-better nutrient."""
        return _nutrient_adequacy_score(val, None, ul(nut), False)

    def wavg(scores: List[float]) -> int:
        if not scores:
            return 50
        return max(0, min(100, int(round(sum(scores) / len(scores)))))

    # Energy: iron + B12 + calcium + low sugar
    energy = wavg([
        sh(avg("avg_iron"), "iron_mg"),
        sh(avg("avg_vitamin_b12"), "vitamin_b12_ug"),
        sh(avg("avg_calcium"), "calcium_mg"),
        sl(avg("avg_sugar"), "sugar_g"),
    ])

    # Recovery: zinc + vitamin C + magnesium + iron
    recovery = wavg([
        sh(avg("avg_zinc"), "zinc_mg"),
        sh(avg("avg_vitamin_c"), "vitamin_c_mg"),
        sh(avg("avg_magnesium"), "magnesium_mg"),
        sh(avg("avg_iron"), "iron_mg"),
    ])

    # Focus: B12 + folate + iron + low sugar
    focus = wavg([
        sh(avg("avg_vitamin_b12"), "vitamin_b12_ug"),
        sh(avg("avg_folate"), "folate_ug"),
        sh(avg("avg_iron"), "iron_mg"),
        sl(avg("avg_sugar"), "sugar_g"),
    ])

    # Stability: low sugar + fiber + low saturated fat
    stability = wavg([
        sl(avg("avg_sugar"), "sugar_g"),
        sh(avg("avg_fiber"), "fiber_g"),
        sl(avg("avg_saturated_fat"), "saturated_fat_g"),
    ])

    # Antioxidants: vitamin C + A + D + zinc
    antioxidants = wavg([
        sh(avg("avg_vitamin_c"), "vitamin_c_mg"),
        sh(avg("avg_vitamin_a"), "vitamin_a_ug"),
        sh(avg("avg_vitamin_d"), "vitamin_d_ug"),
        sh(avg("avg_zinc"), "zinc_mg"),
    ])

    # Digestion: fiber + low sugar + potassium
    digestion = wavg([
        sh(avg("avg_fiber"), "fiber_g"),
        sl(avg("avg_sugar"), "sugar_g"),
        sh(avg("avg_potassium"), "potassium_mg"),
    ])

    # Heart: low sodium + low sat fat + fiber + potassium + low cholesterol
    heart = wavg([
        sl(avg("avg_sodium"), "sodium_mg"),
        sl(avg("avg_saturated_fat"), "saturated_fat_g"),
        sh(avg("avg_fiber"), "fiber_g"),
        sh(avg("avg_potassium"), "potassium_mg"),
        sl(avg("avg_cholesterol"), "cholesterol_mg"),
    ])

    # Liver: low sugar + low saturated fat
    liver = wavg([
        sl(avg("avg_sugar"), "sugar_g"),
        sl(avg("avg_saturated_fat"), "saturated_fat_g"),
    ])

    # Kidney: low sodium + potassium + calcium
    kidney = wavg([
        sl(avg("avg_sodium"), "sodium_mg"),
        sh(avg("avg_potassium"), "potassium_mg"),
        sh(avg("avg_calcium"), "calcium_mg"),
    ])

    # Brain: B12 + folate + iron + vitamin C
    brain = wavg([
        sh(avg("avg_vitamin_b12"), "vitamin_b12_ug"),
        sh(avg("avg_folate"), "folate_ug"),
        sh(avg("avg_iron"), "iron_mg"),
        sh(avg("avg_vitamin_c"), "vitamin_c_mg"),
    ])

    # Skin: vitamin A + C + zinc + vitamin D
    skin = wavg([
        sh(avg("avg_vitamin_a"), "vitamin_a_ug"),
        sh(avg("avg_vitamin_c"), "vitamin_c_mg"),
        sh(avg("avg_zinc"), "zinc_mg"),
        sh(avg("avg_vitamin_d"), "vitamin_d_ug"),
    ])

    return {
        "energy": energy,
        "recovery": recovery,
        "focus": focus,
        "stability": stability,
        "antioxidants": antioxidants,
        "digestion": digestion,
        "organ_effects": {
            "heart": heart,
            "liver": liver,
            "kidney": kidney,
            "brain": brain,
            "skin": skin,
        },
    }


# ---------------------------------------------------------------------------
# Main Analytics Generation
# ---------------------------------------------------------------------------

async def _generate_analytics_ai(
    meals: List[Dict],
    time_range: str,
    openai_client=None,
    micronutrient_targets: Dict[str, Dict] = None,
    timezone_offset: int = 0,
    enrichment_pct: float = 100.0,
) -> Dict[str, Any]:
    """
    Generate analytics from meal data.

    - Text insights, alerts, red flags: generated by AI with strict anti-hallucination rules

    Args:
        meals: List of meal dictionaries with nutrition data
        time_range: "daily", "week", "month", or "year"
        openai_client: OpenAI client instance
        micronutrient_targets: Personalized targets (RDA/UL) by age/sex
        timezone_offset: User's timezone offset in minutes from UTC
        enrichment_pct: Percentage of foods with micronutrient data (0-100)

    Returns:
        {"insights": {...}, "health_insights": {...}, "bio_alerts": [...], "red_flags": [...], "tokens_used": int}
    """
    # Compute time range total days
    total_days = {"daily": 1, "week": 7, "month": 30, "year": 365}.get(time_range, 7)

    # Aggregate meal data
    summary = _aggregate_meal_data(meals, time_range, timezone_offset=timezone_offset, total_days_in_range=total_days)

    # If no OpenAI client, return empty results
    if not openai_client:
        try:
            from app.core.config import settings
            from openai import AsyncOpenAI
            if not getattr(settings, "OPENAI_API_KEY", None):
                return {
                    "insights": {},
                    "health_insights": {},
                    "bio_alerts": [],
                    "red_flags": [],
                    "tokens_used": 0,
                }
            openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        except Exception:
            return {
                "insights": {},
                "health_insights": {},
                "bio_alerts": [],
                "red_flags": [],
                "tokens_used": 0,
            }

    # Build personalized health targets section
    if micronutrient_targets:
        targets_lines = []
        for nutrient, values in micronutrient_targets.items():
            rda = values.get("rda")
            ul = values.get("ul")
            name_parts = nutrient.replace("_", " ").title().replace("Ug", "µg").replace("Mg", "mg").replace("G", "g")
            if rda and ul:
                targets_lines.append(f"- {name_parts}: RDA {rda}, UL {ul}")
            elif rda:
                targets_lines.append(f"- {name_parts}: RDA {rda}")
            elif ul:
                targets_lines.append(f"- {name_parts}: UL {ul}")
        health_targets = "\n".join(targets_lines) if targets_lines else "- Using general adult guidelines"
    else:
        health_targets = """- Sugar: <50g | Sodium: <2300mg | Fiber: >25g | Sat Fat: <20g
- Calcium: >1000mg | Iron: >8mg | Vit C: >75mg
- Vit A: >700-900µg | Vit D: >15µg | Magnesium: >320-420mg | Zinc: >8-11mg | Folate: >400µg | B12: >2.4µg"""

    # Build enrichment quality caveat
    enrichment_note = ""
    if enrichment_pct < 80:
        enrichment_note = f"""
DATA QUALITY WARNING:
Only {enrichment_pct:.0f}% of foods have full micronutrient data. Micronutrient values below
may be UNDERESTIMATES. Do NOT flag deficiencies unless the values are extremely low AND
the data coverage is above 70%. If coverage is below 70%, explicitly note in your insights
that micronutrient data is incomplete and conclusions are tentative.
"""

    # Pre-compute macro % ratios so AI doesn't need to guess
    total_macro_cals = (
        summary['avg_protein'] * 4 +
        summary['avg_carbs'] * 4 +
        summary['avg_fat'] * 9
    )
    if total_macro_cals > 0:
        protein_pct = round(summary['avg_protein'] * 4 / total_macro_cals * 100)
        carb_pct = round(summary['avg_carbs'] * 4 / total_macro_cals * 100)
        fat_pct = round(summary['avg_fat'] * 9 / total_macro_cals * 100)
    else:
        protein_pct = carb_pct = fat_pct = 0

    # Optimized prompt - concise and focused
    if time_range == "daily":
        timeframe_header = "TODAY (last 24 hours)"
        macro_header = "MACROS — Total Today"
        micro_header = "MICRONUTRIENTS — Total Today"
        trend_note = ""
    else:
        timeframe_header = f"{time_range.upper()} — Daily averages over {total_days} days"
        macro_header = "MACROS — Daily Average"
        micro_header = "MICRONUTRIENTS — Daily Average"
        trend_note = f"\nLOGGING: {summary['consistency_score']:.0f}% of days in this period had meals logged."

    prompt = f"""You are a clinical nutritionist analyzing a user's dietary data. Provide precise, data-backed insights.

ANALYSIS PERIOD: {timeframe_header}
{enrichment_note}
{macro_header}:
  Calories:  {summary['avg_calories']:.0f} kcal  (target: see personalized targets below)
  Protein:   {summary['avg_protein']:.0f}g  ({protein_pct}% of calories)
  Carbs:     {summary['avg_carbs']:.0f}g  ({carb_pct}% of calories)
  Fat:       {summary['avg_fat']:.0f}g  ({fat_pct}% of calories)

{micro_header}:
  Sugar:       {summary['avg_sugar']:.1f}g   | Fiber:      {summary['avg_fiber']:.1f}g
  Sodium:      {summary['avg_sodium']:.0f}mg  | Potassium:  {summary['avg_potassium']:.0f}mg
  Sat Fat:     {summary['avg_saturated_fat']:.1f}g  | Cholesterol: {summary['avg_cholesterol']:.0f}mg
  Calcium:     {summary['avg_calcium']:.0f}mg  | Iron:       {summary['avg_iron']:.2f}mg
  Vitamin C:   {summary['avg_vitamin_c']:.0f}mg   | Vitamin A:  {summary['avg_vitamin_a']:.0f}µg
  Vitamin D:   {summary['avg_vitamin_d']:.1f}µg  | Vitamin E:  {summary['avg_vitamin_e']:.1f}mg
  Magnesium:   {summary['avg_magnesium']:.0f}mg  | Zinc:       {summary['avg_zinc']:.2f}mg
  Folate:      {summary['avg_folate']:.0f}µg   | B12:        {summary['avg_vitamin_b12']:.2f}µg
  B6:          {summary['avg_vitamin_b6']:.2f}mg  | Vitamin K:  {summary['avg_vitamin_k']:.0f}µg

EATING PATTERNS:
  Meals logged: {summary['meal_count']} | Breakdown: {summary['meal_types']}
  Top foods: {', '.join(summary['top_foods'][:5]) if summary['top_foods'] else 'none logged'}
  Late meals (after 9pm): {summary['late_meals']}{trend_note}

PERSONALIZED HEALTH TARGETS (user's age/sex — compare EVERY value against these):
{health_targets}

DATA COVERAGE: {enrichment_pct:.0f}% of foods have full micronutrient data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY this JSON — no markdown, no explanation outside JSON:
{{
  "insights": {{
    "overall_diet_quality": "A/B/C/D/F grade with one-sentence justification",
    "eating_pattern": "1-sentence observation about meal frequency/timing/consistency based on the numbers above",
    "macro_balance": "Assessment of {protein_pct}% protein / {carb_pct}% carbs / {fat_pct}% fat — is this ratio appropriate? Compare to 20-35% protein / 45-65% carbs / 20-35% fat guidelines",
    "micronutrient_status": "Name the top 2-3 nutrients that are significantly above or below target, with actual values vs targets. For LOW nutrients, recommend specific foods to increase them. For HIGH nutrients, name culprit foods from top list.",
    "timing": "Specific comment on late meal count ({summary['late_meals']}) and meal distribution ({summary['meal_types']})",
    "variety": "Comment on food diversity based on top foods list — is the diet varied or repetitive?"{', "suggestions": [{{"title": "Action title (max 5 words)", "action": "Specific swap or habit change (max 20 words)", "culprit_foods": ["Food from top foods list"], "reason": "Why this matters (max 15 words)"}}]' if time_range == 'daily' else ''}
  }},
  "health_insights": {{
    "heart": "1 sentence on cardiovascular risk — cite sodium ({summary['avg_sodium']:.0f}mg vs target), sat fat ({summary['avg_saturated_fat']:.1f}g), and fiber ({summary['avg_fiber']:.1f}g).",
    "heart_recommended_foods": ["Specific food names if fiber LOW, e.g. 'oats', 'beans', 'avocado'"],
    "heart_culprit_foods": ["Specific foods from top list if sodium/sat fat HIGH"],
    "liver": "1 sentence on liver load — cite sugar ({summary['avg_sugar']:.1f}g vs target) and any processed foods from top list.",
    "liver_recommended_foods": ["Specific food names if sugar LOW"],
    "liver_culprit_foods": ["Specific foods from top list if sugar HIGH"],
    "kidney": "1 sentence on kidney impact — cite sodium ({summary['avg_sodium']:.0f}mg), potassium ({summary['avg_potassium']:.0f}mg), protein ({summary['avg_protein']:.0f}g).",
    "kidney_recommended_foods": ["Specific food names if potassium LOW, e.g. 'bananas', 'spinach', 'yogurt'"],
    "kidney_culprit_foods": ["Specific foods from top list if sodium HIGH"],
    "brain": "1 sentence on cognitive health — cite folate ({summary['avg_folate']:.0f}µg), B12 ({summary['avg_vitamin_b12']:.2f}µg), iron ({summary['avg_iron']:.2f}mg).",
    "brain_recommended_foods": ["Specific food names if LOW, e.g. 'eggs', 'salmon', 'leafy greens'"],
    "brain_culprit_foods": [],
    "skin": "1 sentence on skin health — cite vitamin A ({summary['avg_vitamin_a']:.0f}µg), vitamin C ({summary['avg_vitamin_c']:.0f}mg), zinc ({summary['avg_zinc']:.2f}mg).",
    "skin_recommended_foods": ["Specific food names if LOW, e.g. 'carrots', 'citrus', 'nuts'"],
    "skin_culprit_foods": []
  }},
  "bio_alerts": [
    {{"metric": "Sugar", "status": "good|warning|critical", "value": "{summary['avg_sugar']:.1f}g", "target": "UL from targets above", "message": "One sentence: actual vs target. If HIGH, name culprit foods from top list. If LOW, note good intake (max 20 words)"}},
    {{"metric": "Sodium", "status": "good|warning|critical", "value": "{summary['avg_sodium']:.0f}mg", "target": "UL from targets above", "message": "One sentence: actual vs target. If HIGH, name culprit foods from top list (max 20 words)"}},
    {{"metric": "Fiber", "status": "good|warning|critical", "value": "{summary['avg_fiber']:.1f}g", "target": "RDA from targets above", "message": "One sentence: actual vs target. If LOW, recommend fiber-rich foods (max 20 words)"}},
    {{"metric": "Iron", "status": "good|warning|critical", "value": "{summary['avg_iron']:.2f}mg", "target": "RDA from targets above", "message": "One sentence: actual vs target. If LOW, recommend iron-rich foods (max 20 words)"}}
  ],
  "red_flags": [
    {{
      "title": "Max 5 words",
      "description": "Cite specific food + actual value + % over limit (max 20 words)",
      "severity": "critical|warning|moderate",
      "culprit_foods": ["Specific food from top foods list"],
      "frequency": "X times this {time_range} (max 6 words)"
    }}
  ]
}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES — VIOLATIONS INVALIDATE THE OUTPUT:

1. GROUND EVERY CLAIM IN DATA. Every sentence must reference at least one number from above.
   ✗ WRONG: "Your potassium intake may be insufficient."
   ✓ RIGHT: "Potassium at {summary['avg_potassium']:.0f}mg is below the 3400mg AI — risk of muscle cramps."

2. BIO_ALERTS STATUS THRESHOLDS (apply these exactly):
   - "good": actual within acceptable range (≥RDA or ≤UL)
   - "warning": 10–30% over UL, OR 30–50% below RDA
   - "critical": >30% over UL, OR >50% below RDA

3. RED_FLAGS — strict criteria:
   - Only flag TRUE negatives with data support.
   - Must name at least 1 food from the Top Foods list as culprit.
   - Must cite the exact value AND target exceeded.
   - Do NOT flag nutrients where data coverage < 50%.
   - No compliments, encouragement, or neutral observations here.
   - If nothing qualifies → "red_flags": []

4. DATA COVERAGE < 70%: append "(micronutrient data partial — {enrichment_pct:.0f}% coverage)" to micronutrient_status.

5. UI LENGTH LIMITS (critical for display):
   - red_flags[].title: ≤5 words
   - red_flags[].description: ≤20 words
   - bio_alerts[].message: ≤18 words
   - health_insights.*: ≤30 words per organ

6. NO numeric 0-100 scores — those are computed separately. Your role is TEXT only.

7. overall_diet_quality grade rubric:
   A = meets most RDAs, no critical flags, balanced macros
   B = mostly good, 1-2 minor issues
   C = moderate issues (sugar/sodium elevated, 1 critical flag)
   D = multiple deficiencies or excesses
   F = severely imbalanced or multiple critical flags"""

    if time_range == "daily":
        prompt += f"""

DAILY MODE — ADDITIONAL RULES:
- Focus on TODAY's data only. Do not extrapolate trends.
- suggestions[]: min 1, max 3. Each must name a specific food from Top Foods as the culprit or target.
- Suggestions must be concrete: "Swap Coke for sparkling water to cut {summary['avg_sugar']:.0f}g sugar" not "Reduce sugar."
- If no red flags exist today, still return 1-2 positive reinforcement suggestions in insights.suggestions."""


    try:
        response = await openai_client.chat.completions.create(
            model='gpt-5.4-2026-03-05',
            messages=[
                {"role": "system", "content": "You are a nutrition analyst. Provide concise, data-backed insights in JSON format only. NEVER invent numbers or scores not present in the input data. Every claim must be traceable to a specific value provided."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )

        content = response.choices[0].message.content
        result = json.loads(content)

        tokens_used = response.usage.total_tokens if hasattr(response, 'usage') else 0

        return {
            "insights": result.get("insights", {}),
            "health_insights": result.get("health_insights", {}),
            "bio_alerts": result.get("bio_alerts", []),
            "red_flags": result.get("red_flags", []),
            "tokens_used": tokens_used
        }

    except Exception as e:
        logger.error("Error generating analytics: %s", e, exc_info=True)
        return {
            "insights": {},
            "health_insights": {},
            "bio_alerts": [],
            "red_flags": [],
            "tokens_used": 0
        }


# ---------------------------------------------------------------------------
# Data Aggregation
# ---------------------------------------------------------------------------

def _aggregate_meal_data(
    meals: List[Dict],
    time_range: str,
    timezone_offset: int = 0,
    total_days_in_range: int = 7,
) -> Dict[str, Any]:
    """
    Aggregate meal data into compact summary to reduce token usage.
    Instead of sending full meal details, send aggregated statistics.
    """

    if not meals:
        return {
            "meal_count": 0,
            "avg_calories": 0,
            "avg_protein": 0,
            "avg_carbs": 0,
            "avg_fat": 0,
            "avg_sugar": 0,
            "avg_sodium": 0,
            "avg_fiber": 0,
            "avg_saturated_fat": 0,
            "avg_cholesterol": 0,
            "avg_potassium": 0,
            "avg_calcium": 0,
            "avg_iron": 0,
            "avg_vitamin_c": 0,
            "avg_vitamin_a": 0,
            "avg_vitamin_d": 0,
            "avg_vitamin_e": 0,
            "avg_vitamin_k": 0,
            "avg_magnesium": 0,
            "avg_zinc": 0,
            "avg_folate": 0,
            "avg_vitamin_b12": 0,
            "avg_vitamin_b6": 0,
            "meal_types": {},
            "top_foods": [],
            "late_meals": 0,
            "consistency_score": 0
        }

    total_calories = sum(m.get("total_calories", 0) for m in meals)
    total_protein = sum(m.get("total_protein", 0) for m in meals)
    total_carbs = sum(m.get("total_carbs", 0) for m in meals)
    total_fat = sum(m.get("total_fat", 0) for m in meals)

    # Aggregate micronutrients from meals.micros
    total_sugar = 0
    total_sodium = 0
    total_fiber = 0
    total_saturated_fat = 0
    total_cholesterol = 0
    total_potassium = 0
    total_calcium = 0
    total_iron = 0
    total_vitamin_c = 0
    total_vitamin_a = 0
    total_vitamin_d = 0
    total_vitamin_e = 0
    total_vitamin_k = 0
    total_magnesium = 0
    total_zinc = 0
    total_folate = 0
    total_vitamin_b12 = 0
    total_vitamin_b6 = 0

    for m in meals:
        micros = m.get("micros", {})
        if isinstance(micros, str):
            try:
                micros = json.loads(micros)
            except:
                micros = {}

        total_sugar += micros.get("sugar_g", 0)
        total_sodium += micros.get("sodium_mg", 0)
        total_fiber += micros.get("fiber_g", 0)
        total_saturated_fat += micros.get("saturated_fat_g", 0)
        total_cholesterol += micros.get("cholesterol_mg", 0)
        total_potassium += micros.get("potassium_mg", 0)
        total_calcium += micros.get("calcium_mg", 0)
        total_iron += micros.get("iron_mg", 0)
        total_vitamin_c += micros.get("vitamin_c_mg", 0)
        total_vitamin_a += micros.get("vitamin_a_ug", 0)
        total_vitamin_d += micros.get("vitamin_d_ug", 0)
        total_vitamin_e += micros.get("vitamin_e_mg", 0)
        total_vitamin_k += micros.get("vitamin_k_ug", 0)
        total_magnesium += micros.get("magnesium_mg", 0)
        total_zinc += micros.get("zinc_mg", 0)
        total_folate += micros.get("folate_ug", 0)
        total_vitamin_b12 += micros.get("vitamin_b12_ug", 0)
        total_vitamin_b6 += micros.get("vitamin_b6_mg", 0)

    # Calculate per-day averages; in daily mode we want totals for today (divisor=1)
    if time_range == "daily":
        days_with_data = 1
    else:
        unique_days = set()
        for m in meals:
            ts = m.get("timestamp")
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts)
                except Exception:
                    ts = None
            if isinstance(ts, datetime):
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                # FIX: Apply timezone offset so day boundaries match the user's local time
                local_ts = ts + timedelta(minutes=int(timezone_offset))
                unique_days.add(local_ts.date())
            else:
                unique_days.add(datetime.now(timezone.utc).date())
        days_with_data = max(len(unique_days), 1)

    # Meal type distribution
    meal_types = {}
    for m in meals:
        mt = m.get("meal_type", "unknown")
        meal_types[mt] = meal_types.get(mt, 0) + 1

    # Top foods (frequency count)
    food_counts = {}
    for m in meals:
        foods = m.get("foods", [])
        if isinstance(foods, str):
            try:
                foods = json.loads(foods)
            except:
                foods = []

        for f in foods:
            if isinstance(f, dict):
                name = f.get("name", "")
                if name:
                    food_counts[name] = food_counts.get(name, 0) + 1

    top_foods = sorted(food_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    top_foods = [name for name, _ in top_foods]

    # Late meal count (after 9pm local time)
    late_meals = 0
    for m in meals:
        ts = m.get("timestamp")
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts)
            except Exception:
                ts = None
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            local_ts = ts + timedelta(minutes=int(timezone_offset))
            if local_ts.hour >= 21:
                late_meals += 1

    # FIX: Consistency score — measures proportion of days in range that
    # have at least one meal logged, as a percentage (0-100).
    # Old formula was: min(10, meals/days * 2.5) which measured meal frequency, not consistency.
    consistency_score = min(100.0, (days_with_data / max(1, total_days_in_range)) * 100.0)

    return {
        "meal_count": len(meals),
        "avg_calories": total_calories / days_with_data,
        "avg_protein": total_protein / days_with_data,
        "avg_carbs": total_carbs / days_with_data,
        "avg_fat": total_fat / days_with_data,
        "avg_sugar": total_sugar / days_with_data,
        "avg_sodium": total_sodium / days_with_data,
        "avg_fiber": total_fiber / days_with_data,
        "avg_saturated_fat": total_saturated_fat / days_with_data,
        "avg_cholesterol": total_cholesterol / days_with_data,
        "avg_potassium": total_potassium / days_with_data,
        "avg_calcium": total_calcium / days_with_data,
        "avg_iron": total_iron / days_with_data,
        "avg_vitamin_c": total_vitamin_c / days_with_data,
        "avg_vitamin_a": total_vitamin_a / days_with_data,
        "avg_vitamin_d": total_vitamin_d / days_with_data,
        "avg_vitamin_e": total_vitamin_e / days_with_data,
        "avg_vitamin_k": total_vitamin_k / days_with_data,
        "avg_magnesium": total_magnesium / days_with_data,
        "avg_zinc": total_zinc / days_with_data,
        "avg_folate": total_folate / days_with_data,
        "avg_vitamin_b12": total_vitamin_b12 / days_with_data,
        "avg_vitamin_b6": total_vitamin_b6 / days_with_data,
        "meal_types": meal_types,
        "top_foods": top_foods,
        "late_meals": late_meals,
        "consistency_score": consistency_score
    }
