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
                    "content": """You are a certified nutritionist and dietitian. Generate comprehensive, personalized diet reports that are:
- Detailed and specific (not generic)
- Actionable with clear recommendations
- Evidence-based and scientifically accurate
- Encouraging and motivating
- Suitable for email delivery

Focus on providing specific food recommendations, meal timing suggestions, and practical tips the user can implement immediately."""
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=2000,
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
    
    # Extract nutrient averages
    summary = meals_data.get("summary", {})
    
    # Get existing insights
    insights = analytics_data.get("insights", {})
    bio_alerts = analytics_data.get("bio_alerts", [])
    red_flags = analytics_data.get("red_flags", [])
    
    prompt = f"""Generate a comprehensive diet report for the {time_range} period based on the following data:

MEAL SUMMARY:
- Total meals logged: {meal_count}
- Average daily calories: {summary.get('avg_calories', 0):.1f}
- Average daily protein: {summary.get('avg_protein', 0):.1f}g
- Average daily carbs: {summary.get('avg_carbs', 0):.1f}g
- Average daily fat: {summary.get('avg_fat', 0):.1f}g
- Average daily fiber: {summary.get('avg_fiber', 0):.1f}g
- Average daily sugar: {summary.get('avg_sugar', 0):.1f}g
- Average daily sodium: {summary.get('avg_sodium', 0):.1f}mg

MICRONUTRIENTS:
- Iron: {summary.get('avg_iron', 0):.1f}mg
- Vitamin B12: {summary.get('avg_vitamin_b12', 0):.1f}μg
- Vitamin C: {summary.get('avg_vitamin_c', 0):.1f}mg
- Vitamin D: {summary.get('avg_vitamin_d', 0):.1f}μg
- Calcium: {summary.get('avg_calcium', 0):.1f}mg
- Magnesium: {summary.get('avg_magnesium', 0):.1f}mg
- Zinc: {summary.get('avg_zinc', 0):.1f}mg
- Potassium: {summary.get('avg_potassium', 0):.1f}mg

EXISTING INSIGHTS:
- Macro balance: {insights.get('macro_balance', 'N/A')}
- Micronutrient status: {insights.get('micronutrient_status', 'N/A')}
- Eating pattern: {insights.get('eating_pattern', 'N/A')}
- Food variety: {insights.get('variety', 'N/A')}

"""
    
    if bio_alerts:
        prompt += "BIO ALERTS:\n"
        for alert in bio_alerts:
            prompt += f"- {alert.get('metric')}: {alert.get('message')}\n"
        prompt += "\n"
    
    if red_flags:
        prompt += "RED FLAGS:\n"
        for flag in red_flags:
            prompt += f"- {flag.get('title')}: {flag.get('description')}\n"
            if flag.get('frequency'):
                prompt += f"  Frequency: {flag.get('frequency')}\n"
        prompt += "\n"
    
    if user_profile:
        prompt += f"USER PROFILE:\n"
        prompt += f"- Age: {user_profile.get('age', 'N/A')}\n"
        prompt += f"- Gender: {user_profile.get('gender', 'N/A')}\n"
        prompt += f"- Daily calorie target: {user_profile.get('daily_calorie_target', 'N/A')}\n"
        prompt += f"- Protein target: {user_profile.get('protein_target', 'N/A')}g\n"
        prompt += f"- Carbs target: {user_profile.get('carbs_target', 'N/A')}g\n"
        prompt += f"- Fat target: {user_profile.get('fat_target', 'N/A')}g\n\n"
    
    prompt += """Generate a comprehensive report in the following JSON structure:

{
  "executive_summary": "2-3 sentence overview of diet quality and main findings",
  "strengths": ["List 3-5 specific strengths with examples"],
  "areas_for_improvement": ["List 3-5 specific areas needing improvement"],
  "detailed_analysis": {
    "macronutrients": "Detailed analysis of protein, carbs, fat balance with specific recommendations",
    "micronutrients": "Detailed analysis of key vitamins/minerals with food sources",
    "eating_pattern": "Analysis of meal timing, frequency, and distribution",
    "food_variety": "Assessment of food diversity and suggestions"
  },
  "specific_recommendations": [
    {
      "category": "macronutrients|micronutrients|timing|variety",
      "recommendation": "Specific actionable recommendation",
      "why": "Explanation of why this matters",
      "how_to_implement": "Practical steps to implement this"
    }
  ],
  "meal_suggestions": [
    "3-5 specific meal or snack ideas that address deficiencies",
    "Include food names and approximate portions"
  ],
  "action_plan": {
    "week_1": ["2-3 specific actions for first week"],
    "week_2": ["2-3 specific actions for second week"],
    "ongoing": ["2-3 habits to maintain long-term"]
  },
  "grade_justification": "Detailed explanation of the grade with specific reasons"
}

Make the report specific, actionable, and encouraging. Avoid generic advice. Use the actual nutrient values provided."""
    
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
