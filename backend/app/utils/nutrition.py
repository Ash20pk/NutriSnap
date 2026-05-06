"""
Nutrition calculation utilities.
Handles calorie targets, macro calculations, and BMR/TDEE computations.
"""

from datetime import date
from typing import Dict


def calculate_calorie_target(
    weight: float, 
    height: float, 
    age: int, 
    gender: str, 
    activity_level: str, 
    goal: str
) -> Dict[str, float]:
    """
    Calculate daily calorie and macro targets based on user profile.
    
    Uses Mifflin-St Jeor Equation for BMR and goal-based protein targets.
    
    Args:
        weight: Weight in kg
        height: Height in cm
        age: Age in years
        gender: "male" or "female"
        activity_level: "sedentary", "light", "moderate", "active", "very_active"
        goal: "lose_weight", "gain_muscle", or "maintain"
    
    Returns:
        Dictionary with daily_calorie_target, protein_target, carbs_target, fat_target
    """
    # Calculate BMR using Mifflin-St Jeor Equation
    if gender.lower() == "male":
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
    
    # Activity multiplier
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9
    }
    
    tdee = bmr * activity_multipliers.get(activity_level, 1.2)
    
    # Adjust for goal
    if goal == "lose_weight":
        calories = tdee - 500  # 500 calorie deficit
    elif goal == "gain_muscle":
        calories = tdee + 300  # 300 calorie surplus
    else:
        calories = tdee

    # Safe minimum floors: 1500 kcal for males, 1200 kcal for females (NIH/NHLBI guidance)
    calorie_floor = 1500.0 if gender.lower() == "male" else 1200.0
    calories = max(float(calories), calorie_floor)

    # Goal-based protein targets (g/kg bodyweight)
    goal_normalized = (goal or "").strip().lower()
    if goal_normalized == "gain_muscle":
        protein_g_per_kg = 2.0   # Higher end of ACSM 1.6-2.2 g/kg for hypertrophy
    elif goal_normalized == "lose_weight":
        protein_g_per_kg = 1.8   # High protein to preserve lean mass in deficit
    else:
        protein_g_per_kg = 1.2   # Adequate for maintain / general_health

    protein = max(0.0, float(weight) * protein_g_per_kg)
    protein_cal = protein * 4.0

    # Keep protein within AMDR-like bounds (10-35% of calories) for stability
    protein_cal_min = calories * 0.10
    protein_cal_max = calories * 0.35
    if protein_cal < protein_cal_min:
        protein_cal = protein_cal_min
        protein = protein_cal / 4.0
    elif protein_cal > protein_cal_max:
        protein_cal = protein_cal_max
        protein = protein_cal / 4.0

    remaining_cal = max(0.0, calories - protein_cal)

    # Fat: 30% of total calories, clamped within AMDR 20-35% of total calories.
    # Using total calories (not remaining) so fat % is meaningful.
    fat_cal = min(max(calories * 0.30, calories * 0.20), calories * 0.35)
    # Never exceed remaining calories
    fat_cal = min(fat_cal, remaining_cal)
    fat = fat_cal / 9.0

    carbs_cal = max(0.0, remaining_cal - fat_cal)
    carbs = carbs_cal / 4.0

    # AMDR minimum for carbs: 130g/day (IOM EAR) — floor it if deficit pushes lower
    carbs = max(carbs, 130.0)
    
    return {
        "daily_calorie_target": round(calories, 2),
        "protein_target": round(protein, 2),
        "carbs_target": round(carbs, 2),
        "fat_target": round(fat, 2)
    }


def calculate_age_from_dob(dob: date) -> int:
    """
    Calculate age from date of birth.
    
    Args:
        dob: Date of birth
    
    Returns:
        Age in years
    """
    today = date.today()
    age = today.year - dob.year
    
    # Adjust if birthday hasn't occurred yet this year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    
    return age
