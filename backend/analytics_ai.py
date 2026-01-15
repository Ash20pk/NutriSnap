"""
AI-powered analytics generation with optimized prompts for cost efficiency.
Analyzes meal data to generate insights, bio-impact scores, and recommendations.
"""

import json
from typing import List, Dict, Any
from datetime import datetime, timezone


async def _generate_analytics_ai(meals: List[Dict], time_range: str, openai_client) -> Dict[str, Any]:
    """
    Generate AI-powered analytics from meal data with token optimization.
    
    Strategy:
    1. Aggregate meal data into compact summary (reduce token usage)
    2. Use single AI call for all insights (batch processing)
    3. Structured output format for consistency
    4. Focus on actionable insights, not verbose descriptions
    
    Returns:
    {
        "insights": {...},
        "bio_impact": {...},
        "recommendations": [...],
        "tokens_used": int
    }
    """
    
    if not openai_client:
        return {
            "insights": {},
            "bio_impact": {},
            "health_insights": {},
            "bio_alerts": [],
            "red_flags": [],
            "tokens_used": 0
        }
    
    # Aggregate meal data to reduce token usage
    summary = _aggregate_meal_data(meals, time_range)
    
    # Optimized prompt - concise and focused with micronutrients
    prompt = f"""Analyze this {time_range} nutrition data and provide health insights.

MACROS (Daily Avg):
- Calories: {summary['avg_calories']:.0f} | Protein: {summary['avg_protein']:.0f}g | Carbs: {summary['avg_carbs']:.0f}g | Fat: {summary['avg_fat']:.0f}g

MICRONUTRIENTS (Daily Avg):
- Sugar: {summary['avg_sugar']:.0f}g | Sodium: {summary['avg_sodium']:.0f}mg | Fiber: {summary['avg_fiber']:.0f}g
- Sat Fat: {summary['avg_saturated_fat']:.0f}g | Chol: {summary['avg_cholesterol']:.0f}mg | Potassium: {summary['avg_potassium']:.0f}mg
- Calcium: {summary['avg_calcium']:.0f}mg | Iron: {summary['avg_iron']:.1f}mg | Vit C: {summary['avg_vitamin_c']:.0f}mg
- Vit A: {summary['avg_vitamin_a']:.0f}ug | Vit D: {summary['avg_vitamin_d']:.1f}ug | Magnesium: {summary['avg_magnesium']:.0f}mg
- Zinc: {summary['avg_zinc']:.1f}mg | Folate: {summary['avg_folate']:.0f}ug | B12: {summary['avg_vitamin_b12']:.1f}ug

PATTERNS:
- Meals: {summary['meal_count']} | Types: {summary['meal_types']}
- Top Foods: {', '.join(summary['top_foods'][:5])}
- Late Meals (>9pm): {summary['late_meals']} | Consistency: {summary['consistency_score']:.1f}/10

HEALTH TARGETS:
- Sugar: <50g | Sodium: <2300mg | Fiber: >25g | Sat Fat: <20g
- Calcium: >1000mg | Iron: >8mg (F), >18mg (M) | Vit C: >75mg
- Vit A: >700-900ug | Vit D: >15ug | Magnesium: >320-420mg | Zinc: >8-11mg | Folate: >400ug | B12: >2.4ug

Return ONLY JSON:
{{
  "insights": {{
    "eating_pattern": "1-sentence pattern observation",
    "macro_balance": "protein/carb/fat assessment with % ratios",
    "micronutrient_status": "key deficiencies or excesses (sugar/sodium/fiber focus)",
    "timing": "meal timing impact on health",
    "variety": "food diversity comment"
  }},
  "bio_impact": {{
    "energy": 0-100,
    "recovery": 0-100,
    "focus": 0-100,
    "stability": 0-100,
    "antioxidants": 0-100,
    "digestion": 0-100,
    "organ_effects": {{
      "heart": 0-100,
      "liver": 0-100,
      "kidney": 0-100,
      "brain": 0-100,
      "skin": 0-100
    }}
  }},
  "health_insights": {{
    "heart": "1-sentence insight on cardiovascular impact from sodium/sat fat/fiber",
    "liver": "1-sentence insight on liver health from sugar/additives/alcohol",
    "kidney": "1-sentence insight on kidney function from sodium/protein/potassium",
    "brain": "1-sentence insight on cognitive health from omega-3/antioxidants/sugar",
    "skin": "1-sentence insight on skin health from vitamins/hydration/sugar"
  }},
  "bio_alerts": [
    {{"metric": "Sugar", "status": "warning/critical/good", "message": "specific concern with value"}},
    {{"metric": "Sodium", "status": "warning/critical/good", "message": "specific concern with value"}},
    {{"metric": "Fiber", "status": "warning/critical/good", "message": "specific concern with value"}}
  ],
  "red_flags": [
    {{
      "title": "Excessive Sugar Intake",
      "description": "Consumed 5 cokes today - 175g sugar (350% of daily limit)",
      "severity": "critical/warning/moderate",
      "culprit_foods": ["Coca-Cola", "Pepsi"],
      "frequency": "5 times today"
    }}
  ]
}}

Constraints (VERY IMPORTANT for UI):
- red_flags[].title: max 5 words
- red_flags[].description: max 18 words
- red_flags[].frequency: max 6 words
- bio_alerts[].message: max 16 words

RED FLAGS RULES (CRITICAL):
- Only include an item in red_flags if it is a TRUE negative issue supported by the provided data (foods, timing, or nutrient over/under target).
- No “green flags”, compliments, encouragement, or neutral observations in red_flags.
- If there are no true red flags, return: "red_flags": []
- Every red_flags item must name at least 1 culprit_food and reference a concrete metric (e.g. sugar/sodium/fiber/sat fat) or a concrete behavior (e.g. late meals) that is actually present.

Focus on identifying RED FLAGS - problematic patterns like excessive consumption of specific foods, nutrient overages, or unhealthy eating patterns. Be specific with quantities and frequencies."""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",  # Cost-effective model
            messages=[
                {"role": "system", "content": "You are world's best nutrition analyst. Provide concise, actionable insights in JSON format only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=800,  # Increased for health_insights, bio_alerts, and enhanced recommendations
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Track token usage for cost monitoring
        tokens_used = response.usage.total_tokens if hasattr(response, 'usage') else 0
        
        return {
            "insights": result.get("insights", {}),
            "bio_impact": result.get("bio_impact", {}),
            "health_insights": result.get("health_insights", {}),
            "bio_alerts": result.get("bio_alerts", []),
            "red_flags": result.get("red_flags", []),
            "tokens_used": tokens_used
        }
        
    except Exception as e:
        print(f"Error generating analytics: {e}")
        return {
            "insights": {},
            "bio_impact": {},
            "health_insights": {},
            "bio_alerts": [],
            "red_flags": [],
            "tokens_used": 0
        }


def _aggregate_meal_data(meals: List[Dict], time_range: str) -> Dict[str, Any]:
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
            "avg_magnesium": 0,
            "avg_zinc": 0,
            "avg_folate": 0,
            "avg_vitamin_b12": 0,
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
    total_magnesium = 0
    total_zinc = 0
    total_folate = 0
    total_vitamin_b12 = 0
    
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
        total_magnesium += micros.get("magnesium_mg", 0)
        total_zinc += micros.get("zinc_mg", 0)
        total_folate += micros.get("folate_ug", 0)
        total_vitamin_b12 += micros.get("vitamin_b12_ug", 0)
    
    # Calculate daily averages
    days = 7 if time_range == "week" else (30 if time_range == "month" else 365)
    unique_days = len(set(m.get("timestamp", datetime.now(timezone.utc)).date() for m in meals))
    days_with_data = max(unique_days, 1)
    
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
    
    # Late meal count (after 9pm)
    late_meals = sum(1 for m in meals if m.get("timestamp", datetime.now(timezone.utc)).hour >= 21)
    
    # Consistency score (based on meal frequency and timing regularity)
    consistency_score = min(10, (len(meals) / days_with_data) * 2.5)
    
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
        "avg_magnesium": total_magnesium / days_with_data,
        "avg_zinc": total_zinc / days_with_data,
        "avg_folate": total_folate / days_with_data,
        "avg_vitamin_b12": total_vitamin_b12 / days_with_data,
        "meal_types": meal_types,
        "top_foods": top_foods,
        "late_meals": late_meals,
        "consistency_score": consistency_score
    }
