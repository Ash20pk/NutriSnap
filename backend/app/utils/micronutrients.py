"""
Micronutrient calculation utilities.
Handles per-100g scaling and aggregation of micronutrients from foods.
"""

from typing import Dict, Any


# Micronutrient field mappings (output_key, database_column)
_MICRONUTRIENT_FIELDS = [
    ("fiber_g", "fiber_g_per_100g"),
    ("sugar_g", "sugar_g_per_100g"),
    ("saturated_fat_g", "saturated_fat_g_per_100g"),
    ("trans_fat_g", "trans_fat_g_per_100g"),
    ("cholesterol_mg", "cholesterol_mg_per_100g"),
    ("sodium_mg", "sodium_mg_per_100g"),
    ("potassium_mg", "potassium_mg_per_100g"),
    ("vitamin_a_ug", "vitamin_a_ug_per_100g"),
    ("calcium_mg", "calcium_mg_per_100g"),
    ("iron_mg", "iron_mg_per_100g"),
    ("magnesium_mg", "magnesium_mg_per_100g"),
    ("phosphorus_mg", "phosphorus_mg_per_100g"),
    ("zinc_mg", "zinc_mg_per_100g"),
    ("copper_mg", "copper_mg_per_100g"),
    ("manganese_mg", "manganese_mg_per_100g"),
    ("selenium_ug", "selenium_ug_per_100g"),
    ("vitamin_c_mg", "vitamin_c_mg_per_100g"),
    ("vitamin_d_ug", "vitamin_d_ug_per_100g"),
    ("vitamin_e_mg", "vitamin_e_mg_per_100g"),
    ("vitamin_k_ug", "vitamin_k_ug_per_100g"),
    ("thiamin_b1_mg", "thiamin_b1_mg_per_100g"),
    ("riboflavin_b2_mg", "riboflavin_b2_mg_per_100g"),
    ("niacin_b3_mg", "niacin_b3_mg_per_100g"),
    ("vitamin_b6_mg", "vitamin_b6_mg_per_100g"),
    ("folate_ug", "folate_ug_per_100g"),
    ("vitamin_b12_ug", "vitamin_b12_ug_per_100g"),
    ("caffeine_mg", "caffeine_mg_per_100g"),
    ("alcohol_g", "alcohol_g_per_100g"),
]


def create_empty_micros() -> Dict[str, float]:
    """
    Create an empty micronutrients dictionary with all fields initialized to 0.
    
    Returns:
        Dictionary with all micronutrient keys set to 0.0
    """
    return {output_key: 0.0 for output_key, _ in _MICRONUTRIENT_FIELDS}


def accumulate_micros(micros: Dict[str, float], food_row: Dict[str, Any], ratio: float) -> None:
    """
    Accumulate micronutrients from a food row into the micros dictionary.
    
    Scales per-100g values by the ratio (grams consumed / 100).
    
    Args:
        micros: The micronutrients dictionary to update (modified in place)
        food_row: The food database row with per-100g values
        ratio: The ratio of grams consumed / 100 (e.g., 150g = 1.5 ratio)
    """
    for output_key, db_column in _MICRONUTRIENT_FIELDS:
        micros[output_key] += float(food_row.get(db_column) or 0) * ratio


def compute_meal_micros(meal: Dict[str, Any], foods_by_id: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute total micronutrients for a meal based on its foods.
    
    Uses per-100g values from the foods table and scales by consumed quantity.
    
    Args:
        meal: The meal dictionary with a 'foods' list containing food_id and quantity
        foods_by_id: Dictionary mapping food_id strings to food database rows
    
    Returns:
        Dictionary of total micronutrients for the meal
    """
    micros = create_empty_micros()
    foods = meal.get("foods") or []

    if not isinstance(foods, list):
        return micros

    for f in foods:
        if not isinstance(f, dict):
            continue
        fid = f.get("food_id")
        if not fid:
            continue
        row = foods_by_id.get(str(fid))
        if not row:
            continue

        grams = f.get("quantity")
        if grams is None:
            grams = f.get("displayQuantity")
        try:
            grams_f = float(grams or 0)
        except Exception:
            grams_f = 0.0
        if grams_f <= 0:
            continue

        ratio = grams_f / 100.0
        accumulate_micros(micros, row, ratio)

    return micros
