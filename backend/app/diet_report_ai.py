"""
AI-powered diet report generation.

Generates comprehensive, detailed diet reports suitable for email delivery.
Reports include executive summary, detailed analysis, recommendations, and action items.
"""

import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


async def generate_diet_report(
    meals_data: Dict[str, Any],
    analytics_data: Dict[str, Any],
    time_range: str = "week",
    user_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a comprehensive diet report using AI.
    
    Args:
        meals_data: Meal data with foods, nutrients, etc.
        analytics_data: Existing analytics data (insights, bio_alerts, red_flags, etc.)
        time_range: Time range for the report (week, month, year)
        user_profile: Optional user profile with age, gender, targets
    
    Returns:
        Comprehensive diet report with detailed sections
    """
    from app.core.config import settings
    from openai import AsyncOpenAI
    
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    
    # Build the prompt with meal and analytics data
    prompt = _build_diet_report_prompt(meals_data, analytics_data, time_range, user_profile)
    
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior clinical dietitian with 15 years of experience. "
                        "Your reports are cited by actual numbers — never make a claim without quoting the specific value. "
                        "Every recommendation must name a real food, a real portion, and a real expected benefit. "
                        "Never give generic advice like 'eat more vegetables' — always say 'add 100g spinach to lunch for 3mg iron, "
                        "closing 36% of your daily gap'. Write as if this report will be emailed directly to the patient."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.4,
            max_tokens=3500,
        )
        
        content = response.choices[0].message.content
        
        # Parse the AI response into structured data
        report = _parse_diet_report_response(content, time_range)
        
        # Merge with existing analytics data
        report["grade"] = analytics_data.get("insights", {}).get("overall_diet_quality", "C").split()[0]
        report["bio_alerts"] = analytics_data.get("bio_alerts", [])
        report["red_flags"] = analytics_data.get("red_flags", [])
        report["health_insights"] = analytics_data.get("health_insights", {})
        
        return report
        
    except Exception as e:
        logger.error(f"Failed to generate diet report: {e}")
        # Return a basic report if AI fails
        return _generate_basic_report(analytics_data, time_range)


def _build_diet_report_prompt(
    meals_data: Dict[str, Any],
    analytics_data: Dict[str, Any],
    time_range: str,
    user_profile: Optional[Dict[str, Any]],
) -> str:
    """Build the AI prompt for diet report generation."""

    meals = meals_data.get("meals", [])
    meal_count = len(meals)
    summary = meals_data.get("summary", {})
    insights = analytics_data.get("insights", {})
    bio_alerts = analytics_data.get("bio_alerts", [])
    red_flags = analytics_data.get("red_flags", [])
    top_foods = analytics_data.get("top_foods", [])

    # ── user targets (with sensible fallbacks) ──────────────────────────────
    cal_target  = user_profile.get("daily_calorie_target", 2000) if user_profile else 2000
    prot_target = user_profile.get("protein_target", 50)         if user_profile else 50
    carb_target = user_profile.get("carbs_target", 250)          if user_profile else 250
    fat_target  = user_profile.get("fat_target", 65)             if user_profile else 65

    avg_cal   = summary.get("avg_calories", 0)
    avg_prot  = summary.get("avg_protein", 0)
    avg_carb  = summary.get("avg_carbs", 0)
    avg_fat   = summary.get("avg_fat", 0)
    avg_fiber = summary.get("avg_fiber", 0)
    avg_sugar = summary.get("avg_sugar", 0)
    avg_na    = summary.get("avg_sodium", 0)
    avg_iron  = summary.get("avg_iron", 0)
    avg_b12   = summary.get("avg_vitamin_b12", 0)
    avg_vitc  = summary.get("avg_vitamin_c", 0)
    avg_vitd  = summary.get("avg_vitamin_d", 0)
    avg_ca    = summary.get("avg_calcium", 0)
    avg_mg    = summary.get("avg_magnesium", 0)
    avg_zn    = summary.get("avg_zinc", 0)
    avg_k     = summary.get("avg_potassium", 0)
    avg_fol   = summary.get("avg_folate", 0)
    avg_vita  = summary.get("avg_vitamin_a", 0)

    # ── pct of target helpers ───────────────────────────────────────────────
    def pct(actual: float, target: float) -> str:
        if not target:
            return "N/A"
        return f"{actual / target * 100:.0f}%"

    # ── top foods list ───────────────────────────────────────────────────────
    top_foods_str = ", ".join(
        f"{f.get('name','?')} ({f.get('count',0)}x)" for f in top_foods[:10]
    ) if top_foods else "No foods logged"

    # ── meal-level breakdown ─────────────────────────────────────────────────
    meal_types: Dict[str, int] = {}
    for m in meals:
        mt = (m.get("meal_type") or "unknown").lower()
        meal_types[mt] = meal_types.get(mt, 0) + 1
    meal_dist = ", ".join(f"{k}: {v}" for k, v in sorted(meal_types.items()))

    prompt = f"""You are writing a comprehensive weekly nutrition report for a real user. Every sentence MUST cite actual numbers from the data below.

━━━ USER TARGETS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Calories:  {cal_target} kcal/day   Protein: {prot_target}g   Carbs: {carb_target}g   Fat: {fat_target}g
Fiber RDA: 38g   Sodium UL: 2300mg   Iron RDA: 8mg   Calcium RDA: 1000mg
Vitamin C RDA: 90mg   Vitamin D RDA: 15µg   B12 RDA: 2.4µg   Folate RDA: 400µg
Zinc RDA: 11mg   Magnesium RDA: 400mg   Potassium AI: 3400mg   Vitamin A RDA: 900µg

━━━ ACTUAL AVERAGES (per day over this {time_range}) ━━━━━━━━━━━━━━━━━━━━━━
Calories:  {avg_cal:.0f} kcal  ({pct(avg_cal, cal_target)} of target)
Protein:   {avg_prot:.1f}g    ({pct(avg_prot, prot_target)} of target)
Carbs:     {avg_carb:.1f}g    ({pct(avg_carb, carb_target)} of target)
Fat:       {avg_fat:.1f}g     ({pct(avg_fat, fat_target)} of target)
Fiber:     {avg_fiber:.1f}g   ({pct(avg_fiber, 38)} of RDA)
Sugar:     {avg_sugar:.1f}g   ({pct(avg_sugar, 50)} of ~50g guideline)
Sodium:    {avg_na:.0f}mg     ({pct(avg_na, 2300)} of UL)
Iron:      {avg_iron:.2f}mg   ({pct(avg_iron, 8)} of RDA)
Vitamin B12: {avg_b12:.2f}µg ({pct(avg_b12, 2.4)} of RDA)
Vitamin C: {avg_vitc:.1f}mg  ({pct(avg_vitc, 90)} of RDA)
Vitamin D: {avg_vitd:.1f}µg  ({pct(avg_vitd, 15)} of RDA)
Calcium:   {avg_ca:.0f}mg    ({pct(avg_ca, 1000)} of RDA)
Magnesium: {avg_mg:.0f}mg    ({pct(avg_mg, 400)} of RDA)
Zinc:      {avg_zn:.2f}mg    ({pct(avg_zn, 11)} of RDA)
Potassium: {avg_k:.0f}mg     ({pct(avg_k, 3400)} of AI)
Folate:    {avg_fol:.0f}µg   ({pct(avg_fol, 400)} of RDA)
Vitamin A: {avg_vita:.0f}µg  ({pct(avg_vita, 900)} of RDA)

━━━ MEAL PATTERN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total meals logged: {meal_count}
Meal distribution: {meal_dist if meal_dist else "not available"}
Eating pattern insight: {insights.get("eating_pattern", "N/A")}

━━━ FOOD CHOICES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Top foods: {top_foods_str}
Variety insight: {insights.get("variety", "N/A")}

━━━ EXISTING ANALYSIS ━━━━━━━━━━━━━━━━━━━━━━━━
Macro balance: {insights.get("macro_balance", "N/A")}
Micronutrient status: {insights.get("micronutrient_status", "N/A")}
"""

    if bio_alerts:
        prompt += "\n━━━ BIO ALERTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        for a in bio_alerts:
            prompt += f"• {a.get('metric')}: {a.get('status','').upper()} — {a.get('message')}\n"

    if red_flags:
        prompt += "\n━━━ RED FLAGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        for f in red_flags:
            prompt += f"• [{f.get('severity','').upper()}] {f.get('title')}: {f.get('description')}"
            if f.get("frequency"):
                prompt += f" ({f.get('frequency')})"
            prompt += "\n"

    if user_profile:
        prompt += f"\n━━━ USER PROFILE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        prompt += f"Age: {user_profile.get('age','N/A')}  Gender: {user_profile.get('gender','N/A')}\n"

    prompt += """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT RULES — VIOLATIONS DISQUALIFY THE REPORT:

1. Every sentence must contain at least one specific number (e.g. "981 kcal", "64mg", "38%").
2. Never write "eat more vegetables" — always say "add 80g broccoli (28mg vitamin C, 31% of your 90mg RDA)".
3. Strengths/improvements must reference specific foods or actual numbers from the data.
4. Recommendations must each name: a real food + a portion + a specific nutrient benefit.
5. Meal suggestions must be full meals with portion sizes (e.g. "150g grilled chicken + 1 cup brown rice + 100g spinach salad").
6. Action plan steps must be measurable (e.g. "add 1 banana daily = +422mg potassium, closing 12% of your 3400mg gap").
7. detailed_analysis fields must each be at least 3 sentences with numbers.
8. Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.

Return this exact JSON structure:
{
  "executive_summary": "3-4 sentences citing your top 3 actual numbers (calories vs target, biggest deficiency, one strength). Mention the overall grade direction.",
  "strengths": [
    "5 items — each citing a specific nutrient value and why it is good relative to its target"
  ],
  "areas_for_improvement": [
    "5 items — each citing actual value vs RDA/target and the health consequence of the gap"
  ],
  "detailed_analysis": {
    "macronutrients": "4+ sentences: quote calories gap, protein gap, carb gap, fat gap. Explain functional impact of each gap. Suggest exact foods to close them.",
    "micronutrients": "4+ sentences: quote the 3 worst deficiencies with % of RDA. Name exact foods + portions that close each gap.",
    "eating_pattern": "3+ sentences: cite meal count, meal distribution by type, and how timing affects energy and nutrient absorption.",
    "food_variety": "3+ sentences: cite top 3 repeated foods, diversity score, and name 3 new foods to rotate in with their specific benefits."
  },
  "specific_recommendations": [
    {
      "category": "calories|protein|fiber|vitamins|minerals|timing|variety",
      "recommendation": "One sentence, specific food + portion",
      "why": "One sentence citing exact nutrient gap and health impact",
      "how_to_implement": "One sentence with practical daily habit and expected improvement"
    }
  ],
  "meal_suggestions": [
    "5 full meal descriptions with portion sizes and the specific nutrient gap each addresses"
  ],
  "action_plan": {
    "week_1": ["3 measurable actions with expected nutrient improvements"],
    "week_2": ["3 measurable actions building on week 1"],
    "ongoing": ["3 long-term habits with measurable targets"]
  },
  "grade_justification": "3 sentences: cite 2 failing metrics, 1 passing metric, and explain why the grade is what it is."
}"""

    return prompt


def _parse_diet_report_response(content: str, time_range: str) -> Dict[str, Any]:
    """Parse the AI response into structured report data."""
    try:
        # Try to extract JSON from the response
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        
        if json_start >= 0 and json_end > json_start:
            json_str = content[json_start:json_end]
            report = json.loads(json_str)
            return report
        else:
            # If JSON parsing fails, create a basic structure from text
            return _parse_text_to_report(content, time_range)
    except json.JSONDecodeError:
        logger.warning("Failed to parse AI response as JSON, using text parsing")
        return _parse_text_to_report(content, time_range)


def _parse_text_to_report(content: str, time_range: str) -> Dict[str, Any]:
    """Parse text response into basic report structure."""
    return {
        "executive_summary": content[:200] if content else "Report generation failed",
        "strengths": [],
        "areas_for_improvement": [],
        "detailed_analysis": {
            "macronutrients": "",
            "micronutrients": "",
            "eating_pattern": "",
            "food_variety": ""
        },
        "specific_recommendations": [],
        "meal_suggestions": [],
        "action_plan": {
            "week_1": [],
            "week_2": [],
            "ongoing": []
        },
        "grade_justification": content[:300] if content else "Unable to generate detailed analysis"
    }


def _generate_basic_report(analytics_data: Dict[str, Any], time_range: str) -> Dict[str, Any]:
    """Generate a basic report from analytics data when AI fails."""
    insights = analytics_data.get("insights", {})
    
    return {
        "executive_summary": f"Your {time_range} diet analysis is ready. Based on your food logs, we've identified key areas for improvement.",
        "strengths": [
            "Consistent meal logging",
            "Awareness of nutritional intake"
        ],
        "areas_for_improvement": [
            "Increase micronutrient diversity",
            "Optimize macronutrient balance",
            "Improve meal timing"
        ],
        "detailed_analysis": {
            "macronutrients": insights.get("macro_balance", "Analysis not available"),
            "micronutrients": insights.get("micronutrient_status", "Analysis not available"),
            "eating_pattern": insights.get("eating_pattern", "Analysis not available"),
            "food_variety": insights.get("variety", "Analysis not available")
        },
        "specific_recommendations": [],
        "meal_suggestions": [],
        "action_plan": {
            "week_1": ["Log all meals consistently"],
            "week_2": ["Focus on whole foods"],
            "ongoing": ["Maintain variety"]
        },
        "grade_justification": insights.get("overall_diet_quality", "Grade based on overall nutritional balance")
    }
