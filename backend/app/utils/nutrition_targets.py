"""
Micronutrient RDA/AI and UL values based on DRI (Dietary Reference Intakes).

References:
- Institute of Medicine (US) Standing Committee on the Scientific Evaluation of Dietary Reference Intakes
- USDA Dietary Guidelines
- NIH Office of Dietary Supplements

Age bands follow standard DRI groupings.
Values are RDA (Recommended Dietary Allowance) or AI (Adequate Intake) where RDA is not established.
UL (Tolerable Upper Intake Level) included where defined.

Units: mg (milligrams), ug (micrograms), g (grams)
"""

from typing import Dict, Any, Optional

# RDA/AI values by sex and age band
# Format: {nutrient: {sex: {age_band: {"rda": value, "ul": value}}}}

_MICRONUTRIENT_RDAS = {
    # Vitamins (fat-soluble)
    "vitamin_a_ug": {
        "male": {
            "19-30": {"rda": 900, "ul": 3000},
            "31-50": {"rda": 900, "ul": 3000},
            "51-70": {"rda": 900, "ul": 3000},
            "71+": {"rda": 900, "ul": 3000},
        },
        "female": {
            "19-30": {"rda": 700, "ul": 3000},
            "31-50": {"rda": 700, "ul": 3000},
            "51-70": {"rda": 700, "ul": 3000},
            "71+": {"rda": 700, "ul": 3000},
        },
    },
    "vitamin_d_ug": {
        "male": {
            "19-30": {"rda": 15, "ul": 100},
            "31-50": {"rda": 15, "ul": 100},
            "51-70": {"rda": 15, "ul": 100},
            "71+": {"rda": 20, "ul": 100},
        },
        "female": {
            "19-30": {"rda": 15, "ul": 100},
            "31-50": {"rda": 15, "ul": 100},
            "51-70": {"rda": 15, "ul": 100},
            "71+": {"rda": 20, "ul": 100},
        },
    },
    "vitamin_e_mg": {
        "male": {
            "19-30": {"rda": 15, "ul": 1000},
            "31-50": {"rda": 15, "ul": 1000},
            "51-70": {"rda": 15, "ul": 1000},
            "71+": {"rda": 15, "ul": 1000},
        },
        "female": {
            "19-30": {"rda": 15, "ul": 1000},
            "31-50": {"rda": 15, "ul": 1000},
            "51-70": {"rda": 15, "ul": 1000},
            "71+": {"rda": 15, "ul": 1000},
        },
    },
    "vitamin_k_ug": {
        "male": {
            "19-30": {"rda": 120, "ul": None},
            "31-50": {"rda": 120, "ul": None},
            "51-70": {"rda": 120, "ul": None},
            "71+": {"rda": 120, "ul": None},
        },
        "female": {
            "19-30": {"rda": 90, "ul": None},
            "31-50": {"rda": 90, "ul": None},
            "51-70": {"rda": 90, "ul": None},
            "71+": {"rda": 90, "ul": None},
        },
    },
    # Vitamins (water-soluble)
    "vitamin_c_mg": {
        "male": {
            "19-30": {"rda": 90, "ul": 2000},
            "31-50": {"rda": 90, "ul": 2000},
            "51-70": {"rda": 90, "ul": 2000},
            "71+": {"rda": 90, "ul": 2000},
        },
        "female": {
            "19-30": {"rda": 75, "ul": 2000},
            "31-50": {"rda": 75, "ul": 2000},
            "51-70": {"rda": 75, "ul": 2000},
            "71+": {"rda": 75, "ul": 2000},
        },
    },
    "thiamin_b1_mg": {
        "male": {
            "19-30": {"rda": 1.2, "ul": None},
            "31-50": {"rda": 1.2, "ul": None},
            "51-70": {"rda": 1.2, "ul": None},
            "71+": {"rda": 1.2, "ul": None},
        },
        "female": {
            "19-30": {"rda": 1.1, "ul": None},
            "31-50": {"rda": 1.1, "ul": None},
            "51-70": {"rda": 1.1, "ul": None},
            "71+": {"rda": 1.1, "ul": None},
        },
    },
    "riboflavin_b2_mg": {
        "male": {
            "19-30": {"rda": 1.3, "ul": None},
            "31-50": {"rda": 1.3, "ul": None},
            "51-70": {"rda": 1.3, "ul": None},
            "71+": {"rda": 1.3, "ul": None},
        },
        "female": {
            "19-30": {"rda": 1.1, "ul": None},
            "31-50": {"rda": 1.1, "ul": None},
            "51-70": {"rda": 1.1, "ul": None},
            "71+": {"rda": 1.1, "ul": None},
        },
    },
    "niacin_b3_mg": {
        "male": {
            "19-30": {"rda": 16, "ul": 35},
            "31-50": {"rda": 16, "ul": 35},
            "51-70": {"rda": 16, "ul": 35},
            "71+": {"rda": 16, "ul": 35},
        },
        "female": {
            "19-30": {"rda": 14, "ul": 35},
            "31-50": {"rda": 14, "ul": 35},
            "51-70": {"rda": 14, "ul": 35},
            "71+": {"rda": 14, "ul": 35},
        },
    },
    "vitamin_b6_mg": {
        "male": {
            "19-30": {"rda": 1.3, "ul": 100},
            "31-50": {"rda": 1.3, "ul": 100},
            "51-70": {"rda": 1.7, "ul": 100},
            "71+": {"rda": 1.7, "ul": 100},
        },
        "female": {
            "19-30": {"rda": 1.3, "ul": 100},
            "31-50": {"rda": 1.3, "ul": 100},
            "51-70": {"rda": 1.5, "ul": 100},
            "71+": {"rda": 1.5, "ul": 100},
        },
    },
    "folate_ug": {
        "male": {
            "19-30": {"rda": 400, "ul": 1000},
            "31-50": {"rda": 400, "ul": 1000},
            "51-70": {"rda": 400, "ul": 1000},
            "71+": {"rda": 400, "ul": 1000},
        },
        "female": {
            "19-30": {"rda": 400, "ul": 1000},
            "31-50": {"rda": 400, "ul": 1000},
            "51-70": {"rda": 400, "ul": 1000},
            "71+": {"rda": 400, "ul": 1000},
        },
    },
    "vitamin_b12_ug": {
        "male": {
            "19-30": {"rda": 2.4, "ul": None},
            "31-50": {"rda": 2.4, "ul": None},
            "51-70": {"rda": 2.4, "ul": None},
            "71+": {"rda": 2.4, "ul": None},
        },
        "female": {
            "19-30": {"rda": 2.4, "ul": None},
            "31-50": {"rda": 2.4, "ul": None},
            "51-70": {"rda": 2.4, "ul": None},
            "71+": {"rda": 2.4, "ul": None},
        },
    },
    # Minerals (macrominerals)
    "calcium_mg": {
        "male": {
            "19-30": {"rda": 1000, "ul": 2500},
            "31-50": {"rda": 1000, "ul": 2500},
            "51-70": {"rda": 1000, "ul": 2000},
            "71+": {"rda": 1200, "ul": 2000},
        },
        "female": {
            "19-30": {"rda": 1000, "ul": 2500},
            "31-50": {"rda": 1000, "ul": 2500},
            "51-70": {"rda": 1200, "ul": 2000},
            "71+": {"rda": 1200, "ul": 2000},
        },
    },
    "phosphorus_mg": {
        "male": {
            "19-30": {"rda": 700, "ul": 4000},
            "31-50": {"rda": 700, "ul": 4000},
            "51-70": {"rda": 700, "ul": 4000},
            "71+": {"rda": 700, "ul": 3000},
        },
        "female": {
            "19-30": {"rda": 700, "ul": 4000},
            "31-50": {"rda": 700, "ul": 4000},
            "51-70": {"rda": 700, "ul": 4000},
            "71+": {"rda": 700, "ul": 3000},
        },
    },
    "magnesium_mg": {
        "male": {
            "19-30": {"rda": 400, "ul": 350},  # UL applies to supplemental magnesium only
            "31-50": {"rda": 420, "ul": 350},
            "51-70": {"rda": 420, "ul": 350},
            "71+": {"rda": 420, "ul": 350},
        },
        "female": {
            "19-30": {"rda": 310, "ul": 350},
            "31-50": {"rda": 320, "ul": 350},
            "51-70": {"rda": 320, "ul": 350},
            "71+": {"rda": 320, "ul": 350},
        },
    },
    "sodium_mg": {
        "male": {
            "19-30": {"rda": 1500, "ul": 2300},  # AI value, not RDA
            "31-50": {"rda": 1500, "ul": 2300},
            "51-70": {"rda": 1300, "ul": 2300},
            "71+": {"rda": 1200, "ul": 2300},
        },
        "female": {
            "19-30": {"rda": 1500, "ul": 2300},
            "31-50": {"rda": 1500, "ul": 2300},
            "51-70": {"rda": 1300, "ul": 2300},
            "71+": {"rda": 1200, "ul": 2300},
        },
    },
    "potassium_mg": {
        "male": {
            "19-30": {"rda": 3400, "ul": None},  # AI value
            "31-50": {"rda": 3400, "ul": None},
            "51-70": {"rda": 3400, "ul": None},
            "71+": {"rda": 3400, "ul": None},
        },
        "female": {
            "19-30": {"rda": 2600, "ul": None},
            "31-50": {"rda": 2600, "ul": None},
            "51-70": {"rda": 2600, "ul": None},
            "71+": {"rda": 2600, "ul": None},
        },
    },
    # Minerals (trace minerals)
    "iron_mg": {
        "male": {
            "19-30": {"rda": 8, "ul": 45},
            "31-50": {"rda": 8, "ul": 45},
            "51-70": {"rda": 8, "ul": 45},
            "71+": {"rda": 8, "ul": 45},
        },
        "female": {
            "19-30": {"rda": 18, "ul": 45},  # Premenopausal
            "31-50": {"rda": 18, "ul": 45},
            "51-70": {"rda": 8, "ul": 45},   # Postmenopausal
            "71+": {"rda": 8, "ul": 45},
        },
    },
    "zinc_mg": {
        "male": {
            "19-30": {"rda": 11, "ul": 40},
            "31-50": {"rda": 11, "ul": 40},
            "51-70": {"rda": 11, "ul": 40},
            "71+": {"rda": 11, "ul": 40},
        },
        "female": {
            "19-30": {"rda": 8, "ul": 40},
            "31-50": {"rda": 8, "ul": 40},
            "51-70": {"rda": 8, "ul": 40},
            "71+": {"rda": 8, "ul": 40},
        },
    },
    "copper_mg": {
        "male": {
            "19-30": {"rda": 0.9, "ul": 10},
            "31-50": {"rda": 0.9, "ul": 10},
            "51-70": {"rda": 0.9, "ul": 10},
            "71+": {"rda": 0.9, "ul": 10},
        },
        "female": {
            "19-30": {"rda": 0.9, "ul": 10},
            "31-50": {"rda": 0.9, "ul": 10},
            "51-70": {"rda": 0.9, "ul": 10},
            "71+": {"rda": 0.9, "ul": 10},
        },
    },
    "manganese_mg": {
        "male": {
            "19-30": {"rda": 2.3, "ul": 11},  # AI value
            "31-50": {"rda": 2.3, "ul": 11},
            "51-70": {"rda": 2.3, "ul": 11},
            "71+": {"rda": 2.3, "ul": 11},
        },
        "female": {
            "19-30": {"rda": 1.8, "ul": 11},
            "31-50": {"rda": 1.8, "ul": 11},
            "51-70": {"rda": 1.8, "ul": 11},
            "71+": {"rda": 1.8, "ul": 11},
        },
    },
    "selenium_ug": {
        "male": {
            "19-30": {"rda": 55, "ul": 400},
            "31-50": {"rda": 55, "ul": 400},
            "51-70": {"rda": 55, "ul": 400},
            "71+": {"rda": 55, "ul": 400},
        },
        "female": {
            "19-30": {"rda": 55, "ul": 400},
            "31-50": {"rda": 55, "ul": 400},
            "51-70": {"rda": 55, "ul": 400},
            "71+": {"rda": 55, "ul": 400},
        },
    },
    # Other nutrients (AI values, no UL established)
    "fiber_g": {
        "male": {
            "19-30": {"rda": 38, "ul": None},  # AI value
            "31-50": {"rda": 38, "ul": None},
            "51-70": {"rda": 30, "ul": None},
            "71+": {"rda": 30, "ul": None},
        },
        "female": {
            "19-30": {"rda": 25, "ul": None},
            "31-50": {"rda": 25, "ul": None},
            "51-70": {"rda": 21, "ul": None},
            "71+": {"rda": 21, "ul": None},
        },
    },
    # Nutrients with limits but no RDA (guidance values)
    "sugar_g": {
        "male": {
            "19-30": {"rda": None, "ul": 50},  # WHO guideline: <10% of energy (~50g for 2000 kcal)
            "31-50": {"rda": None, "ul": 50},
            "51-70": {"rda": None, "ul": 50},
            "71+": {"rda": None, "ul": 50},
        },
        "female": {
            "19-30": {"rda": None, "ul": 50},
            "31-50": {"rda": None, "ul": 50},
            "51-70": {"rda": None, "ul": 50},
            "71+": {"rda": None, "ul": 50},
        },
    },
    "saturated_fat_g": {
        "male": {
            "19-30": {"rda": None, "ul": 20},  # <10% of energy (~20g for 2000 kcal)
            "31-50": {"rda": None, "ul": 20},
            "51-70": {"rda": None, "ul": 20},
            "71+": {"rda": None, "ul": 20},
        },
        "female": {
            "19-30": {"rda": None, "ul": 20},
            "31-50": {"rda": None, "ul": 20},
            "51-70": {"rda": None, "ul": 20},
            "71+": {"rda": None, "ul": 20},
        },
    },
    "trans_fat_g": {
        "male": {
            "19-30": {"rda": None, "ul": 0},  # As low as possible
            "31-50": {"rda": None, "ul": 0},
            "51-70": {"rda": None, "ul": 0},
            "71+": {"rda": None, "ul": 0},
        },
        "female": {
            "19-30": {"rda": None, "ul": 0},
            "31-50": {"rda": None, "ul": 0},
            "51-70": {"rda": None, "ul": 0},
            "71+": {"rda": None, "ul": 0},
        },
    },
    "cholesterol_mg": {
        "male": {
            "19-30": {"rda": None, "ul": 300},  # Dietary Guidelines recommendation
            "31-50": {"rda": None, "ul": 300},
            "51-70": {"rda": None, "ul": 300},
            "71+": {"rda": None, "ul": 300},
        },
        "female": {
            "19-30": {"rda": None, "ul": 300},
            "31-50": {"rda": None, "ul": 300},
            "51-70": {"rda": None, "ul": 300},
            "71+": {"rda": None, "ul": 300},
        },
    },
    # Caffeine and alcohol (guidance only, not DRI)
    "caffeine_mg": {
        "male": {
            "19-30": {"rda": None, "ul": 400},  # FDA guidance
            "31-50": {"rda": None, "ul": 400},
            "51-70": {"rda": None, "ul": 400},
            "71+": {"rda": None, "ul": 400},
        },
        "female": {
            "19-30": {"rda": None, "ul": 400},
            "31-50": {"rda": None, "ul": 400},
            "51-70": {"rda": None, "ul": 400},
            "71+": {"rda": None, "ul": 400},
        },
    },
    "alcohol_g": {
        "male": {
            "19-30": {"rda": None, "ul": 28},  # ~2 standard drinks
            "31-50": {"rda": None, "ul": 28},
            "51-70": {"rda": None, "ul": 28},
            "71+": {"rda": None, "ul": 28},
        },
        "female": {
            "19-30": {"rda": None, "ul": 14},  # ~1 standard drink
            "31-50": {"rda": None, "ul": 14},
            "51-70": {"rda": None, "ul": 14},
            "71+": {"rda": None, "ul": 14},
        },
    },
}

# Pregnancy adjustments (add to base female RDA)
_PREGNANCY_ADJUSTMENTS = {
    "vitamin_a_ug": {"rda": 770, "ul": 3000},
    "vitamin_d_ug": {"rda": 15, "ul": 100},
    "vitamin_e_mg": {"rda": 15, "ul": 1000},
    "vitamin_k_ug": {"rda": 90, "ul": None},
    "vitamin_c_mg": {"rda": 85, "ul": 2000},
    "thiamin_b1_mg": {"rda": 1.4, "ul": None},
    "riboflavin_b2_mg": {"rda": 1.4, "ul": None},
    "niacin_b3_mg": {"rda": 18, "ul": 35},
    "vitamin_b6_mg": {"rda": 1.9, "ul": 100},
    "folate_ug": {"rda": 600, "ul": 1000},
    "vitamin_b12_ug": {"rda": 2.6, "ul": None},
    "calcium_mg": {"rda": 1000, "ul": 2500},
    "phosphorus_mg": {"rda": 700, "ul": 3500},
    "magnesium_mg": {"rda": 350, "ul": 350},
    "iron_mg": {"rda": 27, "ul": 45},
    "zinc_mg": {"rda": 11, "ul": 40},
    "copper_mg": {"rda": 1.0, "ul": 10},
    "selenium_ug": {"rda": 60, "ul": 400},
    "fiber_g": {"rda": 28, "ul": None},
}

# Lactation adjustments (add to base female RDA)
_LACTATION_ADJUSTMENTS = {
    "vitamin_a_ug": {"rda": 1300, "ul": 3000},
    "vitamin_d_ug": {"rda": 15, "ul": 100},
    "vitamin_e_mg": {"rda": 19, "ul": 1000},
    "vitamin_k_ug": {"rda": 90, "ul": None},
    "vitamin_c_mg": {"rda": 120, "ul": 2000},
    "thiamin_b1_mg": {"rda": 1.4, "ul": None},
    "riboflavin_b2_mg": {"rda": 1.6, "ul": None},
    "niacin_b3_mg": {"rda": 17, "ul": 35},
    "vitamin_b6_mg": {"rda": 2.0, "ul": 100},
    "folate_ug": {"rda": 500, "ul": 1000},
    "vitamin_b12_ug": {"rda": 2.8, "ul": None},
    "calcium_mg": {"rda": 1000, "ul": 2500},
    "phosphorus_mg": {"rda": 700, "ul": 4000},
    "magnesium_mg": {"rda": 310, "ul": 350},
    "iron_mg": {"rda": 9, "ul": 45},
    "zinc_mg": {"rda": 12, "ul": 40},
    "copper_mg": {"rda": 1.3, "ul": 10},
    "selenium_ug": {"rda": 70, "ul": 400},
    "fiber_g": {"rda": 29, "ul": None},
}


def _get_age_band(age: int) -> str:
    """Map age to standard DRI age band."""
    if age < 19:
        return "19-30"  # Fallback for younger users (could add teen bands later)
    elif age <= 30:
        return "19-30"
    elif age <= 50:
        return "31-50"
    elif age <= 70:
        return "51-70"
    else:
        return "71+"


def compute_micronutrient_targets(
    age: int,
    sex: str,
    pregnant: bool = False,
    lactating: bool = False,
    calorie_target: Optional[float] = None,
) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Compute personalized micronutrient targets (RDA/AI and UL) based on user profile.

    Args:
        age: User's age in years
        sex: User's biological sex ("male" or "female")
        pregnant: Whether user is pregnant (female only)
        lactating: Whether user is lactating (female only)

    Returns:
        Dictionary mapping nutrient names to {"rda": value, "ul": value}
        where value is None if not established.

    Example:
        >>> compute_micronutrient_targets(25, "male")
        {
            "vitamin_c_mg": {"rda": 90, "ul": 2000},
            "calcium_mg": {"rda": 1000, "ul": 2500},
            ...
        }
    """
    sex_normalized = sex.lower() if sex else "male"
    if sex_normalized not in ["male", "female"]:
        sex_normalized = "male"  # Fallback

    age_band = _get_age_band(age)

    targets = {}

    for nutrient, sex_data in _MICRONUTRIENT_RDAS.items():
        if sex_normalized not in sex_data:
            continue

        age_data = sex_data[sex_normalized].get(age_band, {})
        rda = age_data.get("rda")
        ul = age_data.get("ul")

        # Apply pregnancy/lactation adjustments for females
        if sex_normalized == "female":
            if pregnant and nutrient in _PREGNANCY_ADJUSTMENTS:
                adj = _PREGNANCY_ADJUSTMENTS[nutrient]
                rda = adj.get("rda", rda)
                ul = adj.get("ul", ul)
            elif lactating and nutrient in _LACTATION_ADJUSTMENTS:
                adj = _LACTATION_ADJUSTMENTS[nutrient]
                rda = adj.get("rda", rda)
                ul = adj.get("ul", ul)

        targets[nutrient] = {"rda": rda, "ul": ul}

    # Scale energy-relative ULs to the user's actual calorie target.
    # WHO guidelines: added sugars <10% of energy; saturated fat <10% of energy.
    # The static table assumes 2000 kcal. Override when a real target is known.
    if calorie_target and calorie_target > 0:
        kcal = float(calorie_target)
        if "sugar_g" in targets:
            targets["sugar_g"] = {"rda": None, "ul": round(kcal * 0.10 / 4.0, 1)}
        if "saturated_fat_g" in targets:
            targets["saturated_fat_g"] = {"rda": None, "ul": round(kcal * 0.10 / 9.0, 1)}

    return targets


def get_all_tracked_nutrients() -> list:
    """Return list of all micronutrient keys tracked in this module."""
    return list(_MICRONUTRIENT_RDAS.keys())
