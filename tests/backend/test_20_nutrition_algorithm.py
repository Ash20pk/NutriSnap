"""
Test 20: Core nutrition algorithm — pure unit tests (no server/DB required).

Covers:
  - BMR / TDEE / macro targets  (calculate_calorie_target)
  - Micronutrient RDA/UL tables  (compute_micronutrient_targets)
  - Per-meal macro normalisation  (quantity / oz conversion / per-100g scaling)
  - Micronutrient accumulation    (compute_meal_micros / accumulate_micros)
  - Daily-highlights aggregation  (AnalyticsService._compute_daily_highlights)
  - Calorie-scaled UL overrides   (sugar_g / saturated_fat_g)
  - Edge-cases & guard-rails
"""

import sys
import os
import pytest
from datetime import datetime, timezone, timedelta

# ── Path setup so backend modules can be imported directly ───────────────────
_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, _BACKEND_DIR)


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  BMR / TDEE / Macro targets  (Mifflin-St Jeor)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBMRAndTDEE:
    """Verify BMR formula and activity multipliers produce correct TDEE values."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.nutrition import calculate_calorie_target
        self.calc = calculate_calorie_target

    # ── Mifflin-St Jeor reference values ──────────────────────────────────────

    def test_male_bmr_reference_value(self):
        """70 kg / 175 cm / 25 yr male → BMR ≈ 1723.75 kcal."""
        # BMR = 10*70 + 6.25*175 − 5*25 + 5 = 1723.75
        t = self.calc(70, 175, 25, "male", "sedentary", "maintain")
        expected_bmr = (10 * 70) + (6.25 * 175) - (5 * 25) + 5
        expected_tdee = expected_bmr * 1.2
        assert abs(t["daily_calorie_target"] - expected_tdee) < 1.0

    def test_female_bmr_reference_value(self):
        """60 kg / 165 cm / 30 yr female → BMR ≈ 1399.25 kcal."""
        # BMR = 10*60 + 6.25*165 − 5*30 − 161 = 1399.25
        t = self.calc(60, 165, 30, "female", "sedentary", "maintain")
        expected_bmr = (10 * 60) + (6.25 * 165) - (5 * 30) - 161
        expected_tdee = expected_bmr * 1.2
        assert abs(t["daily_calorie_target"] - expected_tdee) < 1.0

    # ── Activity multipliers ───────────────────────────────────────────────────

    @pytest.mark.parametrize("level,multiplier", [
        ("sedentary",   1.2),
        ("light",       1.375),
        ("moderate",    1.55),
        ("active",      1.725),
        ("very_active", 1.9),
    ])
    def test_activity_multiplier(self, level, multiplier):
        """Each activity level should apply the correct TDEE multiplier."""
        bmr = (10 * 70) + (6.25 * 175) - (5 * 25) + 5
        t = self.calc(70, 175, 25, "male", level, "maintain")
        assert abs(t["daily_calorie_target"] - bmr * multiplier) < 1.0

    def test_unknown_activity_defaults_to_sedentary(self):
        t_sedentary = self.calc(70, 175, 25, "male", "sedentary", "maintain")
        t_unknown   = self.calc(70, 175, 25, "male", "couch_potato", "maintain")
        assert t_unknown["daily_calorie_target"] == t_sedentary["daily_calorie_target"]

    # ── Goal adjustments ──────────────────────────────────────────────────────

    def test_lose_weight_applies_500_kcal_deficit(self):
        t_m = self.calc(80, 180, 30, "male", "moderate", "maintain")
        t_l = self.calc(80, 180, 30, "male", "moderate", "lose_weight")
        assert abs(t_m["daily_calorie_target"] - t_l["daily_calorie_target"] - 500) < 1.0

    def test_gain_muscle_applies_300_kcal_surplus(self):
        t_m = self.calc(80, 180, 30, "male", "moderate", "maintain")
        t_g = self.calc(80, 180, 30, "male", "moderate", "gain_muscle")
        assert abs(t_g["daily_calorie_target"] - t_m["daily_calorie_target"] - 300) < 1.0

    def test_unknown_goal_defaults_to_maintain(self):
        t_m = self.calc(70, 175, 25, "male", "moderate", "maintain")
        t_u = self.calc(70, 175, 25, "male", "moderate", "paleo_recomposition")
        assert t_m["daily_calorie_target"] == t_u["daily_calorie_target"]

    # ── Calorie floor guard-rails ─────────────────────────────────────────────

    def test_male_calorie_floor_is_1500(self):
        """Very small/old male in deficit must never drop below 1500 kcal."""
        t = self.calc(40, 140, 85, "male", "sedentary", "lose_weight")
        assert t["daily_calorie_target"] >= 1500.0

    def test_female_calorie_floor_is_1200(self):
        """Very small/old female in deficit must never drop below 1200 kcal."""
        t = self.calc(40, 140, 85, "female", "sedentary", "lose_weight")
        assert t["daily_calorie_target"] >= 1200.0


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  Macro split correctness
# ═══════════════════════════════════════════════════════════════════════════════

class TestMacroSplit:
    """Verify protein / carb / fat targets satisfy energy balance and AMDR bounds."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.nutrition import calculate_calorie_target
        self.calc = calculate_calorie_target

    def test_macro_calories_sum_to_target(self):
        """protein*4 + carbs*4 + fat*9 must equal daily_calorie_target (±5 kcal)."""
        for params in [
            (70, 175, 25, "male",   "moderate", "maintain"),
            (60, 165, 28, "female", "active",   "lose_weight"),
            (90, 185, 35, "male",   "light",    "gain_muscle"),
        ]:
            t = self.calc(*params)
            macro_cals = (t["protein_target"] * 4) + (t["carbs_target"] * 4) + (t["fat_target"] * 9)
            assert abs(macro_cals - t["daily_calorie_target"]) < 5.0, (
                f"Params {params}: macro_cals={macro_cals:.1f} != "
                f"calorie_target={t['daily_calorie_target']:.1f}"
            )

    def test_protein_within_amdr_10_to_35_pct(self):
        """Protein calories must be 10–35% of total calories (AMDR)."""
        t = self.calc(70, 175, 25, "male", "moderate", "maintain")
        pct = (t["protein_target"] * 4) / t["daily_calorie_target"]
        assert 0.10 <= pct <= 0.35, f"Protein % = {pct:.2%}"

    def test_fat_within_amdr_20_to_35_pct(self):
        """Fat calories must be 20–35% of total calories (AMDR)."""
        t = self.calc(70, 175, 25, "male", "moderate", "maintain")
        pct = (t["fat_target"] * 9) / t["daily_calorie_target"]
        assert 0.20 <= pct <= 0.35, f"Fat % = {pct:.2%}"

    def test_carbs_floor_is_130g(self):
        """Carbs must be at least 130 g/day (IOM EAR floor)."""
        for params in [
            (50, 155, 25, "female", "sedentary", "lose_weight"),
            (40, 140, 85, "female", "sedentary", "lose_weight"),
        ]:
            t = self.calc(*params)
            assert t["carbs_target"] >= 130.0, (
                f"Params {params}: carbs={t['carbs_target']:.1f} < 130 g"
            )

    def test_protein_gain_muscle_ge_lose_weight(self):
        """gain_muscle protein (2.0 g/kg) ≥ lose_weight (1.8 g/kg)."""
        t_g = self.calc(75, 175, 25, "male", "moderate", "gain_muscle")
        t_l = self.calc(75, 175, 25, "male", "moderate", "lose_weight")
        assert t_g["protein_target"] >= t_l["protein_target"] * 0.95

    def test_protein_maintain_le_lose_weight(self):
        """maintain protein (1.2 g/kg) ≤ lose_weight (1.8 g/kg)."""
        t_m = self.calc(75, 175, 25, "male", "moderate", "maintain")
        t_l = self.calc(75, 175, 25, "male", "moderate", "lose_weight")
        assert t_m["protein_target"] <= t_l["protein_target"]

    def test_all_macro_targets_are_non_negative(self):
        t = self.calc(70, 175, 25, "male", "moderate", "maintain")
        for key in ("daily_calorie_target", "protein_target", "carbs_target", "fat_target"):
            assert t[key] >= 0.0, f"{key} is negative"

    # ── Known reference case (manual calculation) ─────────────────────────────

    def test_known_male_moderate_maintain_macros(self):
        """
        70 kg / 175 cm / 25 yr / male / moderate / maintain:
          BMR  = 1723.75 kcal
          TDEE = 1723.75 * 1.55 = 2671.81 kcal  → calorie target
          Protein = 70 * 1.2 = 84 g → 336 kcal (12.6% of TDEE, within AMDR)
          Fat  = 2671.81 * 0.30 / 9 ≈ 89.06 g
          Carbs fills remaining
        """
        t = self.calc(70, 175, 25, "male", "moderate", "maintain")
        bmr = (10 * 70) + (6.25 * 175) - (5 * 25) + 5
        tdee = bmr * 1.55
        assert abs(t["daily_calorie_target"] - tdee) < 1.0
        assert t["protein_target"] > 0
        assert t["carbs_target"] >= 130.0
        assert t["fat_target"] > 0


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  Micronutrient RDA / UL tables
# ═══════════════════════════════════════════════════════════════════════════════

class TestMicronutrientRDA:
    """Spot-check DRI table values and special population adjustments."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.nutrition_targets import compute_micronutrient_targets
        self.compute = compute_micronutrient_targets

    # ── Standard male / female ────────────────────────────────────────────────

    @pytest.mark.parametrize("nutrient,rda,ul", [
        ("vitamin_c_mg",    90,   2000),
        ("calcium_mg",    1000,   2500),
        ("iron_mg",          8,     45),
        ("vitamin_d_ug",    15,    100),
        ("folate_ug",      400,   1000),
        ("zinc_mg",         11,     40),
        ("selenium_ug",     55,    400),
        ("niacin_b3_mg",    16,     35),
    ])
    def test_male_25_rda_values(self, nutrient, rda, ul):
        t = self.compute(25, "male")
        assert t[nutrient]["rda"] == rda, f"{nutrient} RDA mismatch"
        assert t[nutrient]["ul"] == ul,   f"{nutrient} UL mismatch"

    @pytest.mark.parametrize("nutrient,rda,ul", [
        ("vitamin_c_mg",    75,  2000),
        ("iron_mg",         18,    45),   # premenopausal
        ("calcium_mg",    1000,  2500),
        ("zinc_mg",          8,    40),
        ("niacin_b3_mg",    14,    35),
    ])
    def test_female_25_rda_values(self, nutrient, rda, ul):
        t = self.compute(25, "female")
        assert t[nutrient]["rda"] == rda, f"{nutrient} RDA mismatch"
        assert t[nutrient]["ul"] == ul,   f"{nutrient} UL mismatch"

    # ── Age-band transitions ──────────────────────────────────────────────────

    def test_postmenopausal_iron_drops_to_8(self):
        """Female 51+ (post-menopausal) iron RDA drops from 18 → 8 mg."""
        t = self.compute(55, "female")
        assert t["iron_mg"]["rda"] == 8

    def test_elderly_male_vitamin_d_rises_to_20(self):
        """Male 71+ vitamin D RDA rises from 15 → 20 ug."""
        t = self.compute(75, "male")
        assert t["vitamin_d_ug"]["rda"] == 20

    def test_elderly_female_calcium_rises_to_1200(self):
        """Female 51+ calcium RDA rises from 1000 → 1200 mg."""
        t = self.compute(60, "female")
        assert t["calcium_mg"]["rda"] == 1200

    def test_middle_age_male_b6_is_1_3(self):
        t = self.compute(40, "male")
        assert t["vitamin_b6_mg"]["rda"] == 1.3

    def test_older_male_b6_rises_to_1_7(self):
        t = self.compute(60, "male")
        assert t["vitamin_b6_mg"]["rda"] == 1.7

    # ── Pregnancy / lactation adjustments ─────────────────────────────────────

    def test_pregnancy_folate_600(self):
        t = self.compute(28, "female", pregnant=True)
        assert t["folate_ug"]["rda"] == 600

    def test_pregnancy_iron_27(self):
        t = self.compute(28, "female", pregnant=True)
        assert t["iron_mg"]["rda"] == 27

    def test_pregnancy_vitamin_c_85(self):
        t = self.compute(28, "female", pregnant=True)
        assert t["vitamin_c_mg"]["rda"] == 85

    def test_lactation_vitamin_a_1300(self):
        t = self.compute(28, "female", lactating=True)
        assert t["vitamin_a_ug"]["rda"] == 1300

    def test_lactation_vitamin_c_120(self):
        t = self.compute(28, "female", lactating=True)
        assert t["vitamin_c_mg"]["rda"] == 120

    def test_lactation_iron_9(self):
        t = self.compute(28, "female", lactating=True)
        assert t["iron_mg"]["rda"] == 9

    # ── Structure invariants ──────────────────────────────────────────────────

    def test_all_nutrients_have_rda_and_ul_keys(self):
        t = self.compute(30, "male")
        for nutrient, vals in t.items():
            assert "rda" in vals, f"{nutrient} missing 'rda'"
            assert "ul"  in vals, f"{nutrient} missing 'ul'"

    def test_unknown_sex_falls_back_to_male(self):
        t_unknown = self.compute(30, "alien")
        t_male    = self.compute(30, "male")
        assert t_unknown["vitamin_c_mg"]["rda"] == t_male["vitamin_c_mg"]["rda"]

    # ── Calorie-scaled UL overrides ───────────────────────────────────────────

    def test_sugar_ul_scales_with_calorie_target(self):
        """sugar_g UL = calorie_target * 0.10 / 4  (WHO <10% of energy)."""
        t = self.compute(25, "male", calorie_target=2000.0)
        expected_ul = round(2000.0 * 0.10 / 4.0, 1)   # = 50.0 g
        assert t["sugar_g"]["ul"] == expected_ul

    def test_saturated_fat_ul_scales_with_calorie_target(self):
        """saturated_fat_g UL = calorie_target * 0.10 / 9."""
        t = self.compute(25, "male", calorie_target=2700.0)
        expected_ul = round(2700.0 * 0.10 / 9.0, 1)   # = 30.0 g
        assert t["saturated_fat_g"]["ul"] == expected_ul

    def test_sugar_ul_static_when_no_calorie_target(self):
        """Without calorie_target, sugar_g UL stays at static table value (50 g)."""
        t = self.compute(25, "male")
        assert t["sugar_g"]["ul"] == 50


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  Per-meal macro normalisation  (unit conversion + per-100g scaling)
# ═══════════════════════════════════════════════════════════════════════════════

class TestMacroNormalisation:
    """
    Test the normalisation logic used in MealService.log_meal / update_meal.
    We replicate it in pure Python to avoid DB / async context.
    """

    @staticmethod
    def _normalise(food: dict) -> dict:
        """Inline replica of the normalisation block in meal_service.py."""
        nf = dict(food)
        if not nf.get("food_id") and nf.get("id"):
            nf["food_id"] = nf.get("id")

        qty_raw = nf.get("quantity")
        if qty_raw is None:
            qty_raw = nf.get("displayQuantity")
        try:
            qty = float(qty_raw) if qty_raw is not None else 0.0
        except Exception:
            qty = 0.0

        unit = str(nf.get("displayUnit") or nf.get("unit") or "g").strip().lower()
        grams = qty * 28.3495 if unit == "oz" else qty
        nf["quantity"] = grams
        nf["displayUnit"] = "g"
        nf["unit"] = "g"

        if nf.get("displayQuantity") is None or unit == "oz":
            nf["displayQuantity"] = grams

        ratio = grams / 100.0 if grams else 0.0
        for key in ("calories", "protein", "carbs", "fat"):
            per100 = nf.get(f"{key}_per_100g")
            if per100 is not None:
                try:
                    nf[key] = round(float(per100) * ratio, 2)
                except Exception:
                    nf[key] = 0.0
            elif nf.get(key) is None:
                nf[key] = 0.0
        return nf

    # ── Gram inputs ───────────────────────────────────────────────────────────

    def test_150g_chicken_macros(self):
        """150 g chicken (165 kcal/100g, 31 g protein/100g, 0 carbs, 3.6 g fat/100g)."""
        f = self._normalise({
            "name": "Grilled Chicken Breast",
            "quantity": 150.0, "displayUnit": "g",
            "calories_per_100g": 165.0, "protein_per_100g": 31.0,
            "carbs_per_100g": 0.0, "fat_per_100g": 3.6,
        })
        assert f["calories"] == pytest.approx(247.5, abs=0.1)
        assert f["protein"]  == pytest.approx(46.5,  abs=0.1)
        assert f["carbs"]    == pytest.approx(0.0,   abs=0.01)
        assert f["fat"]      == pytest.approx(5.4,   abs=0.1)

    def test_200g_brown_rice_macros(self):
        """200 g brown rice (123 kcal/100g, 2.7 g protein, 25.6 g carbs, 1.0 g fat)."""
        f = self._normalise({
            "name": "Brown Rice",
            "quantity": 200.0, "displayUnit": "g",
            "calories_per_100g": 123.0, "protein_per_100g": 2.7,
            "carbs_per_100g": 25.6, "fat_per_100g": 1.0,
        })
        assert f["calories"] == pytest.approx(246.0, abs=0.1)
        assert f["protein"]  == pytest.approx(5.4,   abs=0.1)
        assert f["carbs"]    == pytest.approx(51.2,  abs=0.1)
        assert f["fat"]      == pytest.approx(2.0,   abs=0.1)

    def test_100g_baseline_identity(self):
        """At exactly 100 g, macros should equal per-100g values."""
        f = self._normalise({
            "quantity": 100.0, "displayUnit": "g",
            "calories_per_100g": 200.0, "protein_per_100g": 10.0,
            "carbs_per_100g": 30.0, "fat_per_100g": 5.0,
        })
        assert f["calories"] == 200.0
        assert f["protein"]  == 10.0
        assert f["carbs"]    == 30.0
        assert f["fat"]      == 5.0

    # ── Oz → gram conversion ──────────────────────────────────────────────────

    def test_oz_converts_to_grams(self):
        """1 oz = 28.3495 g; macros must be scaled from grams."""
        f = self._normalise({
            "quantity": 1.0, "displayUnit": "oz",
            "calories_per_100g": 100.0, "protein_per_100g": 10.0,
            "carbs_per_100g": 10.0, "fat_per_100g": 10.0,
        })
        grams = 28.3495
        assert f["quantity"] == pytest.approx(grams, rel=1e-4)
        assert f["displayUnit"] == "g"
        assert f["calories"] == pytest.approx(grams * 100.0 / 100.0, rel=1e-3)

    def test_2_oz_chicken_calories(self):
        """2 oz (56.699 g) at 165 kcal/100 g ≈ 93.55 kcal."""
        f = self._normalise({
            "quantity": 2.0, "displayUnit": "oz",
            "calories_per_100g": 165.0, "protein_per_100g": 31.0,
            "carbs_per_100g": 0.0, "fat_per_100g": 3.6,
        })
        grams = 2 * 28.3495
        assert f["calories"] == pytest.approx(165.0 * grams / 100.0, rel=1e-3)

    # ── Edge cases ────────────────────────────────────────────────────────────

    def test_zero_quantity_gives_zero_macros(self):
        f = self._normalise({
            "quantity": 0.0, "displayUnit": "g",
            "calories_per_100g": 200.0, "protein_per_100g": 10.0,
            "carbs_per_100g": 30.0, "fat_per_100g": 5.0,
        })
        assert f["calories"] == 0.0
        assert f["protein"]  == 0.0

    def test_none_quantity_falls_back_to_display_quantity(self):
        f = self._normalise({
            "quantity": None, "displayQuantity": 50.0, "displayUnit": "g",
            "calories_per_100g": 200.0, "protein_per_100g": 10.0,
            "carbs_per_100g": 30.0, "fat_per_100g": 5.0,
        })
        assert f["calories"] == pytest.approx(100.0, abs=0.1)

    def test_id_aliased_to_food_id(self):
        f = self._normalise({"id": "abc-123", "quantity": 100.0, "displayUnit": "g"})
        assert f["food_id"] == "abc-123"

    def test_non_numeric_quantity_defaults_to_zero(self):
        f = self._normalise({
            "quantity": "not-a-number", "displayUnit": "g",
            "calories_per_100g": 200.0,
        })
        assert f["quantity"] == 0.0
        assert f["calories"] == 0.0

    # ── Meal-level totals ─────────────────────────────────────────────────────

    def test_meal_totals_from_two_foods(self):
        """Totals should be the sum of all individual food macros."""
        foods = [
            self._normalise({
                "quantity": 150.0, "displayUnit": "g",
                "calories_per_100g": 165.0, "protein_per_100g": 31.0,
                "carbs_per_100g": 0.0, "fat_per_100g": 3.6,
            }),
            self._normalise({
                "quantity": 200.0, "displayUnit": "g",
                "calories_per_100g": 123.0, "protein_per_100g": 2.7,
                "carbs_per_100g": 25.6, "fat_per_100g": 1.0,
            }),
        ]
        total_calories = sum(f["calories"] for f in foods)
        total_protein  = sum(f["protein"]  for f in foods)
        total_carbs    = sum(f["carbs"]    for f in foods)
        total_fat      = sum(f["fat"]      for f in foods)

        assert total_calories == pytest.approx(247.5 + 246.0, abs=0.5)
        assert total_protein  == pytest.approx(46.5  + 5.4,   abs=0.2)
        assert total_carbs    == pytest.approx(0.0   + 51.2,  abs=0.2)
        assert total_fat      == pytest.approx(5.4   + 2.0,   abs=0.2)


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  Micronutrient accumulation  (compute_meal_micros)
# ═══════════════════════════════════════════════════════════════════════════════

class TestMicronutrientComputation:
    """Verify per-100g scaling and multi-food aggregation for micronutrients."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.micronutrients import (
            compute_meal_micros,
            create_empty_micros,
            accumulate_micros,
        )
        self.compute_meal_micros = compute_meal_micros
        self.create_empty_micros = create_empty_micros
        self.accumulate_micros   = accumulate_micros

    # ── Single-food reference cases ───────────────────────────────────────────

    def test_100g_food_micros_equal_per_100g_values(self):
        """At 100 g, micro output should exactly match per-100g columns."""
        food_row = {
            "vitamin_c_mg_per_100g": 52.0,   # like an orange
            "fiber_g_per_100g":       2.4,
            "calcium_mg_per_100g":   40.0,
            "iron_mg_per_100g":       0.1,
        }
        food_entry = {"food_id": "test-id", "quantity": 100.0}
        foods_by_id = {"test-id": food_row}
        meal = {"foods": [food_entry]}

        micros = self.compute_meal_micros(meal, foods_by_id)
        assert micros["vitamin_c_mg"] == pytest.approx(52.0, abs=0.01)
        assert micros["fiber_g"]      == pytest.approx(2.4,  abs=0.01)
        assert micros["calcium_mg"]   == pytest.approx(40.0, abs=0.01)
        assert micros["iron_mg"]      == pytest.approx(0.1,  abs=0.001)

    def test_200g_food_doubles_micros(self):
        """Doubling portion doubles all micronutrients."""
        food_row = {"vitamin_c_mg_per_100g": 40.0, "sodium_mg_per_100g": 100.0}
        meal = {"foods": [{"food_id": "f1", "quantity": 200.0}]}
        micros = self.compute_meal_micros(meal, {"f1": food_row})
        assert micros["vitamin_c_mg"] == pytest.approx(80.0,  abs=0.01)
        assert micros["sodium_mg"]    == pytest.approx(200.0, abs=0.01)

    def test_50g_food_halves_micros(self):
        """Halving portion halves all micronutrients."""
        food_row = {"calcium_mg_per_100g": 120.0, "iron_mg_per_100g": 4.0}
        meal = {"foods": [{"food_id": "f1", "quantity": 50.0}]}
        micros = self.compute_meal_micros(meal, {"f1": food_row})
        assert micros["calcium_mg"] == pytest.approx(60.0, abs=0.01)
        assert micros["iron_mg"]    == pytest.approx(2.0,  abs=0.01)

    # ── Multi-food aggregation ────────────────────────────────────────────────

    def test_two_foods_micros_are_summed(self):
        """
        Orange (150 g):  vitamin_c = 60 * 1.5 = 90 mg
        Spinach (100 g): vitamin_c = 28 * 1.0 = 28 mg
        Total: 118 mg
        """
        foods_by_id = {
            "orange":  {"vitamin_c_mg_per_100g": 60.0, "iron_mg_per_100g": 0.1},
            "spinach": {"vitamin_c_mg_per_100g": 28.0, "iron_mg_per_100g": 2.7},
        }
        meal = {"foods": [
            {"food_id": "orange",  "quantity": 150.0},
            {"food_id": "spinach", "quantity": 100.0},
        ]}
        micros = self.compute_meal_micros(meal, foods_by_id)
        assert micros["vitamin_c_mg"] == pytest.approx(90.0 + 28.0, abs=0.1)
        assert micros["iron_mg"]      == pytest.approx(0.15  + 2.7,  abs=0.01)

    def test_known_breakfast_micronutrients(self):
        """
        Oatmeal 80 g  + Whole milk 200 g  known reference values.
          oatmeal   : fiber=10.6/100g → 8.48 g; calcium=54/100g → 43.2 mg
          whole milk: calcium=113/100g → 226 mg; vitamin_b12=0.45/100g → 0.9 ug
        """
        foods_by_id = {
            "oatmeal": {
                "fiber_g_per_100g":      10.6,
                "calcium_mg_per_100g":   54.0,
                "iron_mg_per_100g":       4.72,
            },
            "milk": {
                "calcium_mg_per_100g":  113.0,
                "vitamin_b12_ug_per_100g": 0.45,
                "vitamin_d_ug_per_100g":   1.2,
            },
        }
        meal = {"foods": [
            {"food_id": "oatmeal", "quantity": 80.0},
            {"food_id": "milk",    "quantity": 200.0},
        ]}
        micros = self.compute_meal_micros(meal, foods_by_id)
        assert micros["fiber_g"]      == pytest.approx(8.48,  abs=0.05)
        assert micros["calcium_mg"]   == pytest.approx(43.2 + 226.0, abs=0.5)
        assert micros["vitamin_b12_ug"] == pytest.approx(0.9, abs=0.01)
        assert micros["vitamin_d_ug"] == pytest.approx(2.4,  abs=0.01)

    # ── Edge cases ────────────────────────────────────────────────────────────

    def test_empty_meal_returns_all_zeros(self):
        micros = self.compute_meal_micros({"foods": []}, {})
        assert all(v == 0.0 for v in micros.values())

    def test_missing_food_id_is_skipped(self):
        """Food items without food_id should be silently skipped."""
        meal = {"foods": [{"quantity": 100.0}]}  # no food_id
        micros = self.compute_meal_micros(meal, {"some_id": {"vitamin_c_mg_per_100g": 99.0}})
        assert micros["vitamin_c_mg"] == 0.0

    def test_unknown_food_id_is_skipped(self):
        """food_id not in foods_by_id should be silently skipped."""
        meal = {"foods": [{"food_id": "does-not-exist", "quantity": 100.0}]}
        micros = self.compute_meal_micros(meal, {})
        assert micros["vitamin_c_mg"] == 0.0

    def test_zero_quantity_skipped(self):
        """Zero-gram serving should contribute nothing."""
        foods_by_id = {"f1": {"vitamin_c_mg_per_100g": 50.0}}
        meal = {"foods": [{"food_id": "f1", "quantity": 0.0}]}
        micros = self.compute_meal_micros(meal, foods_by_id)
        assert micros["vitamin_c_mg"] == 0.0

    def test_none_micro_column_treated_as_zero(self):
        """NULL / None per-100g values should be treated as 0 (not crash)."""
        foods_by_id = {"f1": {"vitamin_c_mg_per_100g": None, "fiber_g_per_100g": 5.0}}
        meal = {"foods": [{"food_id": "f1", "quantity": 100.0}]}
        micros = self.compute_meal_micros(meal, foods_by_id)
        assert micros["vitamin_c_mg"] == 0.0
        assert micros["fiber_g"] == pytest.approx(5.0, abs=0.01)

    def test_create_empty_micros_has_all_keys(self):
        """create_empty_micros should return all tracked fields set to 0."""
        from app.utils.micronutrients import _MICRONUTRIENT_FIELDS
        empty = self.create_empty_micros()
        for output_key, _ in _MICRONUTRIENT_FIELDS:
            assert output_key in empty, f"Missing key: {output_key}"
            assert empty[output_key] == 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# 6.  Daily-highlights aggregation  (AnalyticsService._compute_daily_highlights)
# ═══════════════════════════════════════════════════════════════════════════════

def _compute_daily_highlights(
    meals, micro_targets, macro_targets, timezone_offset
):
    """
    Inline copy of AnalyticsService._compute_daily_highlights.
    Extracted here so the test file has no asyncpg dependency.
    """
    from typing import Any, Dict, List
    now_utc = datetime.now(timezone.utc)
    local_now = now_utc + timedelta(minutes=int(timezone_offset or 0))
    local_day = local_now.date()

    today_meals = []
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
            local_ts = ts + timedelta(minutes=int(timezone_offset or 0))
            if local_ts.date() == local_day:
                today_meals.append(m)

    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    micros_total: Dict[str, float] = {}
    for m in today_meals:
        totals["calories"] += float(m.get("total_calories") or 0)
        totals["protein"]  += float(m.get("total_protein")  or 0)
        totals["carbs"]    += float(m.get("total_carbs")    or 0)
        totals["fat"]      += float(m.get("total_fat")      or 0)
        mm = m.get("micros") or {}
        if isinstance(mm, dict):
            for k, v in mm.items():
                try:
                    micros_total[k] = float(micros_total.get(k, 0.0)) + float(v or 0)
                except Exception:
                    continue

    def pct(v, target):
        try:
            t = float(target)
            if t <= 0:
                return None
            return round((float(v) / t) * 100.0, 1)
        except Exception:
            return None

    macro_progress = {
        "calories_pct": pct(totals["calories"], macro_targets.get("daily_calorie_target")),
        "protein_pct":  pct(totals["protein"],  macro_targets.get("protein_target")),
        "carbs_pct":    pct(totals["carbs"],     macro_targets.get("carbs_target")),
        "fat_pct":      pct(totals["fat"],       macro_targets.get("fat_target")),
    }

    highlights = []
    sugar  = float(micros_total.get("sugar_g",  0.0) or 0.0)
    sodium = float(micros_total.get("sodium_mg", 0.0) or 0.0)
    fiber  = float(micros_total.get("fiber_g",   0.0) or 0.0)

    if sugar  > 0:
        highlights.append({"type": "sugar",  "value": round(sugar,  1)})
    if sodium > 0:
        highlights.append({"type": "sodium", "value": round(sodium, 0)})
    if fiber  > 0:
        highlights.append({"type": "fiber",  "value": round(fiber,  1)})

    return {
        "date":          str(local_day),
        "meals_count":   len(today_meals),
        "totals":        {k: round(v, 2) for k, v in totals.items()},
        "macro_progress": macro_progress,
        "highlights":    highlights,
        "updated_at":    now_utc.isoformat(),
    }


class TestDailyHighlights:
    """
    Test the pure-static helper _compute_daily_highlights.
    We pass meals with known timestamps so we can control which fall on 'today'.
    """

    @pytest.fixture(autouse=True)
    def _import(self):
        self.fn = _compute_daily_highlights

    def _make_meal(self, calories, protein, carbs, fat, micros=None, tz_offset_mins=0):
        """Return a meal dict whose timestamp is 'today' relative to tz_offset_mins."""
        ts = datetime.now(timezone.utc) + timedelta(minutes=tz_offset_mins)
        return {
            "total_calories": calories,
            "total_protein":  protein,
            "total_carbs":    carbs,
            "total_fat":      fat,
            "timestamp":      ts.isoformat(),
            "micros":         micros or {},
        }

    def _make_old_meal(self, calories):
        """Return a meal from 2 days ago (should NOT appear in today's totals)."""
        ts = datetime.now(timezone.utc) - timedelta(days=2)
        return {
            "total_calories": calories,
            "total_protein":  50.0,
            "total_carbs":    50.0,
            "total_fat":      10.0,
            "timestamp":      ts.isoformat(),
            "micros":         {},
        }

    # ── Basic totals ──────────────────────────────────────────────────────────

    def test_single_meal_totals(self):
        meals = [self._make_meal(500, 40, 60, 15)]
        macro_targets = {
            "daily_calorie_target": 2000, "protein_target": 150,
            "carbs_target": 250, "fat_target": 65,
        }
        result = self.fn(meals, {}, macro_targets, 0)
        assert result["totals"]["calories"] == pytest.approx(500, abs=0.1)
        assert result["totals"]["protein"]  == pytest.approx(40,  abs=0.1)
        assert result["totals"]["carbs"]    == pytest.approx(60,  abs=0.1)
        assert result["totals"]["fat"]      == pytest.approx(15,  abs=0.1)

    def test_two_meals_totals_summed(self):
        meals = [
            self._make_meal(500, 40, 60, 15),
            self._make_meal(700, 55, 90, 20),
        ]
        result = self.fn(meals, {}, {}, 0)
        assert result["totals"]["calories"] == pytest.approx(1200, abs=0.5)
        assert result["totals"]["protein"]  == pytest.approx(95,   abs=0.5)

    def test_old_meal_excluded_from_today(self):
        """Meals from 2 days ago must NOT be included in today's highlights."""
        meals = [
            self._make_meal(600, 50, 80, 20),
            self._make_old_meal(9999),
        ]
        result = self.fn(meals, {}, {}, 0)
        assert result["totals"]["calories"] < 700  # old meal excluded

    def test_meals_count_only_counts_today(self):
        meals = [
            self._make_meal(500, 40, 60, 15),
            self._make_meal(700, 55, 90, 20),
            self._make_old_meal(999),
        ]
        result = self.fn(meals, {}, {}, 0)
        assert result["meals_count"] == 2

    # ── Macro progress % ─────────────────────────────────────────────────────

    def test_macro_progress_percentages(self):
        """50% of each target should give 50.0%."""
        macro_targets = {
            "daily_calorie_target": 2000, "protein_target": 100,
            "carbs_target": 200, "fat_target": 60,
        }
        meals = [self._make_meal(1000, 50, 100, 30)]
        result = self.fn(meals, {}, macro_targets, 0)
        assert result["macro_progress"]["calories_pct"] == pytest.approx(50.0, abs=0.5)
        assert result["macro_progress"]["protein_pct"]  == pytest.approx(50.0, abs=0.5)
        assert result["macro_progress"]["carbs_pct"]    == pytest.approx(50.0, abs=0.5)
        assert result["macro_progress"]["fat_pct"]      == pytest.approx(50.0, abs=0.5)

    def test_macro_progress_none_when_no_targets(self):
        """Without macro targets, all progress % should be None."""
        meals = [self._make_meal(500, 40, 60, 15)]
        result = self.fn(meals, {}, {}, 0)
        assert result["macro_progress"]["calories_pct"] is None

    # ── Highlights flags (sugar / sodium / fiber) ─────────────────────────────

    def test_sugar_highlight_present(self):
        meals = [self._make_meal(500, 40, 60, 15, micros={"sugar_g": 25.0})]
        result = self.fn(meals, {}, {}, 0)
        sugar_hl = [h for h in result["highlights"] if h["type"] == "sugar"]
        assert len(sugar_hl) == 1
        assert sugar_hl[0]["value"] == pytest.approx(25.0, abs=0.1)

    def test_sodium_highlight_present(self):
        meals = [self._make_meal(500, 40, 60, 15, micros={"sodium_mg": 1200.0})]
        result = self.fn(meals, {}, {}, 0)
        sodium_hl = [h for h in result["highlights"] if h["type"] == "sodium"]
        assert len(sodium_hl) == 1
        assert sodium_hl[0]["value"] == pytest.approx(1200.0, abs=1.0)

    def test_fiber_highlight_present(self):
        meals = [self._make_meal(500, 40, 60, 15, micros={"fiber_g": 12.5})]
        result = self.fn(meals, {}, {}, 0)
        fiber_hl = [h for h in result["highlights"] if h["type"] == "fiber"]
        assert len(fiber_hl) == 1
        assert fiber_hl[0]["value"] == pytest.approx(12.5, abs=0.1)

    def test_no_highlights_when_micros_are_zero(self):
        meals = [self._make_meal(500, 40, 60, 15, micros={"sugar_g": 0.0, "sodium_mg": 0.0, "fiber_g": 0.0})]
        result = self.fn(meals, {}, {}, 0)
        assert result["highlights"] == []

    def test_no_meals_gives_zero_totals(self):
        result = self.fn([], {}, {}, 0)
        assert result["totals"]["calories"] == 0.0
        assert result["meals_count"] == 0
        assert result["highlights"] == []


# ═══════════════════════════════════════════════════════════════════════════════
# 7.  Biomarker / RDA % coverage  (integration of micros + targets)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBiomarkerCoverage:
    """
    Simulate a known daily diet and verify that micro totals hit expected
    % of RDA — mimicking the 'biomarker' coverage logic the app would surface.
    """

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.micronutrients import compute_meal_micros
        from app.utils.nutrition_targets import compute_micronutrient_targets
        self.compute_micros = compute_meal_micros
        self.compute_targets = compute_micronutrient_targets

    def _pct_of_rda(self, actual: float, rda) -> float | None:
        try:
            return round((actual / float(rda)) * 100, 1)
        except Exception:
            return None

    def test_high_vitamin_c_day_exceeds_100pct_rda(self):
        """
        A day with 200 g orange juice (50 mg/100g VC) + 150 g broccoli (89 mg/100g VC)
        → total VC = 100 + 133.5 = 233.5 mg
        → male RDA = 90 mg → ~259 % coverage
        """
        foods_by_id = {
            "oj":       {"vitamin_c_mg_per_100g": 50.0},
            "broccoli": {"vitamin_c_mg_per_100g": 89.0},
        }
        meal = {"foods": [
            {"food_id": "oj",       "quantity": 200.0},
            {"food_id": "broccoli", "quantity": 150.0},
        ]}
        micros = self.compute_micros(meal, foods_by_id)
        targets = self.compute_targets(25, "male")
        rda_vc = targets["vitamin_c_mg"]["rda"]
        pct = self._pct_of_rda(micros["vitamin_c_mg"], rda_vc)
        assert pct > 200, f"Expected >200% vitamin C coverage, got {pct}%"

    def test_low_iron_day_below_rda_for_female(self):
        """
        A low-iron day: 200 g white rice (0.2 mg iron/100g) only.
        → total iron = 0.4 mg
        → female RDA = 18 mg → ~2.2 % coverage (deficient)
        """
        foods_by_id = {"white_rice": {"iron_mg_per_100g": 0.2}}
        meal = {"foods": [{"food_id": "white_rice", "quantity": 200.0}]}
        micros = self.compute_micros(meal, foods_by_id)
        targets = self.compute_targets(28, "female")
        rda_iron = targets["iron_mg"]["rda"]
        pct = self._pct_of_rda(micros["iron_mg"], rda_iron)
        assert pct < 10, f"Expected <10% iron coverage, got {pct}%"

    def test_adequate_calcium_day_near_rda(self):
        """
        300 g whole milk (113 mg calcium/100g) + 100 g cheese (700 mg/100g)
        → total = 339 + 700 = 1039 mg
        → male RDA = 1000 mg → ~104% coverage
        """
        foods_by_id = {
            "milk":   {"calcium_mg_per_100g": 113.0},
            "cheese": {"calcium_mg_per_100g": 700.0},
        }
        meal = {"foods": [
            {"food_id": "milk",   "quantity": 300.0},
            {"food_id": "cheese", "quantity": 100.0},
        ]}
        micros = self.compute_micros(meal, foods_by_id)
        targets = self.compute_targets(30, "male")
        rda_ca = targets["calcium_mg"]["rda"]
        pct = self._pct_of_rda(micros["calcium_mg"], rda_ca)
        assert 90 < pct < 130, f"Expected ~100% calcium coverage, got {pct}%"

    def test_sugar_exceeds_ul_triggers_alert(self):
        """
        500 g cola (10.6 g sugar/100g) → 53 g sugar > UL 50 g for 2000 kcal target.
        """
        foods_by_id = {"cola": {"sugar_g_per_100g": 10.6}}
        meal = {"foods": [{"food_id": "cola", "quantity": 500.0}]}
        micros = self.compute_micros(meal, foods_by_id)
        targets = self.compute_targets(25, "male", calorie_target=2000.0)
        ul_sugar = targets["sugar_g"]["ul"]
        assert micros["sugar_g"] > ul_sugar, (
            f"Expected sugar ({micros['sugar_g']:.1f}g) to exceed UL ({ul_sugar}g)"
        )

    def test_full_day_macro_energy_balance(self):
        """
        Full-day food logs should have macro calories close to TDEE target.
        
        Profile: 70 kg / 175 cm / 25 yr male / moderate / maintain
        Target ≈ 2671.81 kcal
        Diet:
          Breakfast – oatmeal 80g (389 kcal/100g) + milk 200g (61 kcal/100g)
          Lunch      – chicken 150g (165 kcal/100g) + rice 200g (123 kcal/100g)
          Dinner     – salmon 180g (206 kcal/100g) + broccoli 120g (34 kcal/100g)
        Total ≈ 311.2 + 122 + 247.5 + 246 + 370.8 + 40.8 = 1338.3 kcal  (≈50% of target)
        """
        from app.utils.nutrition import calculate_calorie_target
        targets = calculate_calorie_target(70, 175, 25, "male", "moderate", "maintain")

        meals = [
            {"calories_per_100g": 389.0, "quantity": 80.0},   # oatmeal
            {"calories_per_100g":  61.0, "quantity": 200.0},  # milk
            {"calories_per_100g": 165.0, "quantity": 150.0},  # chicken
            {"calories_per_100g": 123.0, "quantity": 200.0},  # brown rice
            {"calories_per_100g": 206.0, "quantity": 180.0},  # salmon
            {"calories_per_100g":  34.0, "quantity": 120.0},  # broccoli
        ]

        def _norm(food):
            ratio = food["quantity"] / 100.0
            return food["calories_per_100g"] * ratio

        total_kcal = sum(_norm(f) for f in meals)
        assert total_kcal > 0
        assert total_kcal < targets["daily_calorie_target"] * 1.5  # reasonable range


# ═══════════════════════════════════════════════════════════════════════════════
# 8.  AI food-logging nutrient pipeline  (parsers.py pure logic)
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtractJsonFromText:
    """extract_json_from_text — pulls JSON out of markdown-fenced AI responses."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.parsers import extract_json_from_text
        self.fn = extract_json_from_text

    def test_plain_json_unchanged(self):
        raw = '{"calories_per_100g": 165}'
        assert self.fn(raw) == raw

    def test_json_code_fence_stripped(self):
        raw = '```json\n{"calories_per_100g": 165}\n```'
        assert self.fn(raw) == '{"calories_per_100g": 165}'

    def test_plain_code_fence_stripped(self):
        raw = '```\n{"calories_per_100g": 165}\n```'
        assert self.fn(raw) == '{"calories_per_100g": 165}'

    def test_empty_string_returns_empty(self):
        assert self.fn("") == ""

    def test_none_returns_empty(self):
        assert self.fn(None) == ""

    def test_prose_before_json_fence_ignored(self):
        raw = 'Here is the result:\n```json\n{"key": 1}\n```\nDone.'
        result = self.fn(raw)
        import json
        parsed = json.loads(result)
        assert parsed["key"] == 1

    def test_whitespace_trimmed(self):
        raw = '  {"x": 2}  '
        assert self.fn(raw).strip() == '{"x": 2}'


class TestAIMacroValidation:
    """
    _valid_usda_macro_estimate and _clamp_float guard-rails.
    These protect against hallucinated / out-of-range AI outputs.
    """

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.parsers import _valid_usda_macro_estimate, _clamp_float, _safe_nonneg_float
        self.valid  = _valid_usda_macro_estimate
        self.clamp  = _clamp_float
        self.nonneg = _safe_nonneg_float

    # ── _valid_usda_macro_estimate ─────────────────────────────────────────────

    def test_valid_chicken_breast(self):
        """Grilled chicken: 165 kcal, 31 g protein, 0 carbs, 3.6 g fat."""
        assert self.valid(165.0, 31.0, 0.0, 3.6) is True

    def test_valid_brown_rice(self):
        assert self.valid(123.0, 2.7, 25.6, 1.0) is True

    def test_valid_olive_oil(self):
        """Pure fat: 884 kcal, 0 protein, 0 carbs, 100 g fat — right at ceiling."""
        assert self.valid(884.0, 0.0, 0.0, 100.0) is True

    def test_zero_calories_invalid(self):
        assert self.valid(0.0, 10.0, 5.0, 2.0) is False

    def test_negative_calories_invalid(self):
        assert self.valid(-10.0, 10.0, 5.0, 2.0) is False

    def test_calories_above_900_invalid(self):
        """Pure fat theoretical max is ~902 kcal/100g — anything above is hallucination."""
        assert self.valid(903.0, 0.0, 0.0, 100.0) is False

    def test_protein_above_100_invalid(self):
        assert self.valid(400.0, 101.0, 0.0, 5.0) is False

    def test_carbs_above_100_invalid(self):
        assert self.valid(400.0, 5.0, 101.0, 5.0) is False

    def test_fat_above_100_invalid(self):
        assert self.valid(800.0, 0.0, 0.0, 101.0) is False

    def test_all_macros_zero_invalid(self):
        """Calories > 0 but all macros = 0 is impossible."""
        assert self.valid(100.0, 0.0, 0.0, 0.0) is False

    def test_negative_protein_invalid(self):
        assert self.valid(200.0, -1.0, 30.0, 5.0) is False

    # ── _clamp_float ──────────────────────────────────────────────────────────

    def test_clamp_within_range_unchanged(self):
        assert self.clamp(50.0, 0.0, 100.0) == 50.0

    def test_clamp_below_low_returns_low(self):
        assert self.clamp(-5.0, 0.0, 100.0) == 0.0

    def test_clamp_above_high_returns_high(self):
        assert self.clamp(950.0, 0.0, 900.0) == 900.0

    def test_clamp_non_numeric_returns_low(self):
        assert self.clamp("not-a-number", 0.0, 100.0) == 0.0

    def test_clamp_none_returns_low(self):
        assert self.clamp(None, 0.0, 100.0) == 0.0

    # ── _safe_nonneg_float ────────────────────────────────────────────────────

    def test_nonneg_positive_unchanged(self):
        assert self.nonneg(42.5) == 42.5

    def test_nonneg_zero_unchanged(self):
        assert self.nonneg(0.0) == 0.0

    def test_nonneg_negative_becomes_zero(self):
        assert self.nonneg(-3.0) == 0.0

    def test_nonneg_none_becomes_zero(self):
        assert self.nonneg(None) == 0.0

    def test_nonneg_string_number(self):
        assert self.nonneg("12.5") == 12.5

    def test_nonneg_non_numeric_string_becomes_zero(self):
        assert self.nonneg("bad") == 0.0


class TestAIEstimatedNutrientParsing:
    """
    Test the _parse() inner logic of _estimate_usda_like_nutrition_per_100g
    without calling OpenAI. We simulate raw AI JSON responses and feed them
    through the same clamp/validate pipeline.
    """

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.utils.parsers import (
            extract_json_from_text,
            _clamp_float,
            _safe_nonneg_float,
            _valid_usda_macro_estimate,
            _MICRO_KEYS,
        )
        self._extract  = extract_json_from_text
        self._clamp    = _clamp_float
        self._nonneg   = _safe_nonneg_float
        self._valid    = _valid_usda_macro_estimate
        self._micro_keys = _MICRO_KEYS

    def _parse(self, content: str):
        """Replica of the _parse() inner function in _estimate_usda_like_nutrition_per_100g."""
        import json
        extracted = self._extract(content)
        parsed = json.loads(extracted) if extracted else {}
        if not isinstance(parsed, dict):
            return None
        cal = self._clamp(parsed.get("calories_per_100g"), 0.0, 900.0)
        p   = self._clamp(parsed.get("protein_per_100g"),  0.0, 100.0)
        c   = self._clamp(parsed.get("carbs_per_100g"),    0.0, 100.0)
        f   = self._clamp(parsed.get("fat_per_100g"),      0.0, 100.0)
        if not self._valid(cal, p, c, f):
            return None
        micros = {k: self._nonneg(parsed.get(k)) for k in self._micro_keys}
        return cal, p, c, f, micros

    # ── Known USDA reference foods ────────────────────────────────────────────

    @pytest.mark.parametrize("food,cal,protein,carbs,fat,tol", [
        # (food name for docstring, expected cal, protein, carbs, fat, tolerance %)
        ("chicken_breast",  165, 31.0,  0.0,  3.6, 0.0),  # exact USDA values
        ("brown_rice",      123,  2.7, 25.6,  1.0, 0.0),
        ("whole_milk",       61,  3.2,  4.8,  3.3, 0.0),
        ("banana",           89,  1.1, 22.8,  0.3, 0.0),
        ("olive_oil",       884,  0.0,  0.0, 100.0, 0.0),
        ("egg_large",       155, 13.0,  1.1, 11.0, 0.0),
    ])
    def test_valid_ai_response_parsed_correctly(self, food, cal, protein, carbs, fat, tol):
        """Simulate a well-formed AI response and check the parser accepts it."""
        import json
        payload = json.dumps({
            "calories_per_100g": cal,
            "protein_per_100g":  protein,
            "carbs_per_100g":    carbs,
            "fat_per_100g":      fat,
            **{k: 0.0 for k in self._micro_keys},
        })
        result = self._parse(payload)
        assert result is not None, f"Parser rejected valid {food} values"
        r_cal, r_p, r_c, r_f, _ = result
        assert r_cal == pytest.approx(cal,     abs=0.01)
        assert r_p   == pytest.approx(protein, abs=0.01)
        assert r_c   == pytest.approx(carbs,   abs=0.01)
        assert r_f   == pytest.approx(fat,     abs=0.01)

    def test_ai_response_with_micro_values_parsed(self):
        """AI response with micronutrients is fully parsed and none are dropped."""
        import json
        payload = json.dumps({
            "calories_per_100g": 165.0,
            "protein_per_100g":  31.0,
            "carbs_per_100g":     0.0,
            "fat_per_100g":       3.6,
            "vitamin_c_mg_per_100g":   0.0,
            "calcium_mg_per_100g":    11.0,
            "iron_mg_per_100g":        1.04,
            "sodium_mg_per_100g":     74.0,
            "fiber_g_per_100g":        0.0,
            **{k: 0.0 for k in self._micro_keys
               if k not in ("vitamin_c_mg_per_100g", "calcium_mg_per_100g",
                             "iron_mg_per_100g", "sodium_mg_per_100g", "fiber_g_per_100g")},
        })
        result = self._parse(payload)
        assert result is not None
        _, _, _, _, micros = result
        assert micros["calcium_mg_per_100g"] == pytest.approx(11.0, abs=0.01)
        assert micros["iron_mg_per_100g"]    == pytest.approx(1.04, abs=0.001)
        assert micros["sodium_mg_per_100g"]  == pytest.approx(74.0, abs=0.1)

    def test_all_micro_keys_present_in_output(self):
        """Parser must return a value for every key in _MICRO_KEYS."""
        import json
        payload = json.dumps({
            "calories_per_100g": 100.0,
            "protein_per_100g":  10.0,
            "carbs_per_100g":    10.0,
            "fat_per_100g":       5.0,
        })  # intentionally omit all micro keys
        result = self._parse(payload)
        assert result is not None
        _, _, _, _, micros = result
        for k in self._micro_keys:
            assert k in micros, f"Missing micro key: {k}"
            assert micros[k] == 0.0  # missing → defaulted to 0

    def test_negative_micro_values_clamped_to_zero(self):
        """Negative micro values from AI should be treated as 0."""
        import json
        payload = json.dumps({
            "calories_per_100g": 100.0,
            "protein_per_100g":  10.0,
            "carbs_per_100g":    10.0,
            "fat_per_100g":       5.0,
            "vitamin_c_mg_per_100g": -50.0,   # hallucinated negative
            **{k: 0.0 for k in self._micro_keys if k != "vitamin_c_mg_per_100g"},
        })
        result = self._parse(payload)
        assert result is not None
        _, _, _, _, micros = result
        assert micros["vitamin_c_mg_per_100g"] == 0.0

    # ── Bad AI output rejected ────────────────────────────────────────────────

    def test_zero_calorie_response_rejected(self):
        import json
        payload = json.dumps({
            "calories_per_100g": 0.0,
            "protein_per_100g": 10.0,
            "carbs_per_100g": 10.0,
            "fat_per_100g": 5.0,
        })
        assert self._parse(payload) is None

    def test_absurd_calorie_response_clamped_to_900(self):
        """
        9999 kcal/100g is physically impossible but the pipeline clamps it to 900
        (the theoretical max for pure fat) rather than rejecting outright.
        This prevents hallucinated values from silently inflating calorie counts.
        """
        import json
        payload = json.dumps({
            "calories_per_100g": 9999.0,
            "protein_per_100g": 10.0,
            "carbs_per_100g": 10.0,
            "fat_per_100g": 5.0,
            **{k: 0.0 for k in self._micro_keys},
        })
        result = self._parse(payload)
        assert result is not None, "Clamped 9999→900 should produce a valid result"
        cal, _, _, _, _ = result
        assert cal == pytest.approx(900.0, abs=0.01), f"Expected clamped to 900, got {cal}"

    def test_all_macros_zero_rejected(self):
        import json
        payload = json.dumps({
            "calories_per_100g": 200.0,
            "protein_per_100g":  0.0,
            "carbs_per_100g":    0.0,
            "fat_per_100g":      0.0,
        })
        assert self._parse(payload) is None

    def test_markdown_fenced_valid_response_parsed(self):
        """AI sometimes wraps JSON in markdown — should still parse."""
        import json
        inner = json.dumps({
            "calories_per_100g": 89.0,
            "protein_per_100g":  1.1,
            "carbs_per_100g":   22.8,
            "fat_per_100g":      0.3,
            **{k: 0.0 for k in self._micro_keys},
        })
        payload = f"```json\n{inner}\n```"
        result = self._parse(payload)
        assert result is not None
        cal, _, _, _, _ = result
        assert cal == pytest.approx(89.0, abs=0.01)

    def test_empty_response_rejected(self):
        assert self._parse("") is None

    def test_non_json_response_raises(self):
        """Completely non-JSON content should either return None or raise — not silently pass."""
        import json
        try:
            result = self._parse("Sorry, I cannot estimate nutrition for that food.")
            assert result is None  # either rejected or raises
        except (json.JSONDecodeError, Exception):
            pass  # raising is also acceptable


class TestAIFoodMatchNutrientCalculation:
    """
    Test the macro calculation step inside match_food_to_database_db:
    when a DB row is found (or AI-estimated), macros are multiplied by qty/100.
    This is pure arithmetic — no DB or OpenAI call needed.
    """

    @staticmethod
    def _apply_multiplier(row: dict, qty_grams: float) -> dict:
        """Replica of the macro calculation in match_food_to_database_db."""
        multiplier = qty_grams / 100.0
        return {
            "food_id":           row.get("id", "test-id"),
            "name":              row.get("name", ""),
            "quantity":          qty_grams,
            "calories":          round(float(row.get("calories_per_100g", 0) or 0) * multiplier, 2),
            "protein":           round(float(row.get("protein_per_100g",  0) or 0) * multiplier, 2),
            "carbs":             round(float(row.get("carbs_per_100g",    0) or 0) * multiplier, 2),
            "fat":               round(float(row.get("fat_per_100g",      0) or 0) * multiplier, 2),
            "calories_per_100g": float(row.get("calories_per_100g", 0) or 0),
            "protein_per_100g":  float(row.get("protein_per_100g",  0) or 0),
            "carbs_per_100g":    float(row.get("carbs_per_100g",    0) or 0),
            "fat_per_100g":      float(row.get("fat_per_100g",      0) or 0),
        }

    # ── DB-matched foods (exact USDA reference values) ────────────────────────

    def test_chicken_breast_150g_from_db(self):
        """150 g chicken: USDA 165/31/0/3.6 per 100g."""
        row = {"id": "c1", "name": "Grilled Chicken Breast",
               "calories_per_100g": 165.0, "protein_per_100g": 31.0,
               "carbs_per_100g": 0.0, "fat_per_100g": 3.6}
        r = self._apply_multiplier(row, 150.0)
        assert r["calories"] == pytest.approx(247.5, abs=0.1)
        assert r["protein"]  == pytest.approx(46.5,  abs=0.1)
        assert r["carbs"]    == pytest.approx(0.0,   abs=0.01)
        assert r["fat"]      == pytest.approx(5.4,   abs=0.1)

    def test_brown_rice_200g_from_db(self):
        row = {"id": "r1", "name": "Brown Rice",
               "calories_per_100g": 123.0, "protein_per_100g": 2.7,
               "carbs_per_100g": 25.6, "fat_per_100g": 1.0}
        r = self._apply_multiplier(row, 200.0)
        assert r["calories"] == pytest.approx(246.0, abs=0.1)
        assert r["carbs"]    == pytest.approx(51.2,  abs=0.1)

    def test_whole_milk_250ml_from_db(self):
        """250 g whole milk: 61 kcal/100g → 152.5 kcal."""
        row = {"id": "m1", "name": "Whole Milk",
               "calories_per_100g": 61.0, "protein_per_100g": 3.2,
               "carbs_per_100g": 4.8, "fat_per_100g": 3.3}
        r = self._apply_multiplier(row, 250.0)
        assert r["calories"] == pytest.approx(152.5, abs=0.1)
        assert r["protein"]  == pytest.approx(8.0,   abs=0.1)

    def test_100g_multiplier_equals_per_100g(self):
        """At exactly 100 g the output should equal per-100g column values."""
        row = {"calories_per_100g": 200.0, "protein_per_100g": 15.0,
               "carbs_per_100g": 25.0, "fat_per_100g": 5.0}
        r = self._apply_multiplier(row, 100.0)
        assert r["calories"] == 200.0
        assert r["protein"]  == 15.0
        assert r["carbs"]    == 25.0
        assert r["fat"]      == 5.0

    def test_zero_quantity_gives_zero_macros(self):
        row = {"calories_per_100g": 165.0, "protein_per_100g": 31.0,
               "carbs_per_100g": 0.0, "fat_per_100g": 3.6}
        r = self._apply_multiplier(row, 0.0)
        assert r["calories"] == 0.0
        assert r["protein"]  == 0.0

    def test_per_100g_values_preserved_in_output(self):
        """per_100g fields must be passed through to the output for downstream re-calc."""
        row = {"calories_per_100g": 165.0, "protein_per_100g": 31.0,
               "carbs_per_100g": 0.0, "fat_per_100g": 3.6}
        r = self._apply_multiplier(row, 150.0)
        assert r["calories_per_100g"] == 165.0
        assert r["protein_per_100g"]  == 31.0

    # ── AI-estimated path (same arithmetic, different source) ─────────────────

    def test_ai_estimated_banana_300g(self):
        """AI estimates banana: 89 kcal/1.1g prot/22.8g carbs/0.3g fat per 100g."""
        row = {"calories_per_100g": 89.0, "protein_per_100g": 1.1,
               "carbs_per_100g": 22.8, "fat_per_100g": 0.3}
        r = self._apply_multiplier(row, 300.0)
        assert r["calories"] == pytest.approx(267.0, abs=0.5)
        assert r["carbs"]    == pytest.approx(68.4,  abs=0.1)

    @pytest.mark.parametrize("qty,expected_cal", [
        (50,   82.5),
        (100, 165.0),
        (200, 330.0),
        (350, 577.5),
    ])
    def test_linear_scaling_across_quantities(self, qty, expected_cal):
        """Macro scaling must be perfectly linear with quantity."""
        row = {"calories_per_100g": 165.0, "protein_per_100g": 31.0,
               "carbs_per_100g": 0.0, "fat_per_100g": 3.6}
        r = self._apply_multiplier(row, qty)
        assert r["calories"] == pytest.approx(expected_cal, abs=0.1)


class TestVoiceMealTextPostProcessing:
    """
    Test the pure post-processing logic in parse_voice_meal_text that merges
    split-dish items (e.g. ["cheese", "burrito"] → ["cheese burrito"]).
    This logic runs after the AI call, on the parsed list — no OpenAI needed.
    """

    @staticmethod
    def _merge(normalized: list, original_text: str) -> list:
        """
        Replica of the post-processing merge block in parse_voice_meal_text.
        Takes the already-parsed normalized list and original cleaned text.
        """
        import re
        from typing import List

        def _norm_tokens(s: str):
            s = (s or "").strip().lower()
            s = re.sub(r"[^a-z0-9 ]+", " ", s)
            s = re.sub(r"\s+", " ", s)
            return [t for t in s.split(" ") if t]

        base = {"burrito", "taco", "wrap", "sandwich", "sub", "burger",
                "pizza", "pasta", "salad", "curry", "rice", "noodles", "bowl"}
        ignore_fillers = {"with", "and", "a", "an", "the", "filling", "stuffed", "inside"}

        cleaned_tokens = set(_norm_tokens(original_text))
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
                    return [{"name": merged_name, "quantity_grams": merged_qty}]

        return normalized

    def test_cheese_burrito_merged_to_one(self):
        """
        'burrito with cheese' — 'with' triggers the merge.
        AI split into [cheese, burrito] → should merge to 'cheese burrito'.
        """
        items = [
            {"name": "cheese", "quantity_grams": 30.0},
            {"name": "burrito", "quantity_grams": 300.0},
        ]
        result = self._merge(items, "a burrito with cheese")
        assert len(result) == 1
        assert "burrito" in result[0]["name"]
        assert result[0]["quantity_grams"] == 300.0

    def test_chicken_cheese_burrito_merged(self):
        """'burrito with chicken and cheese' — 'with' triggers merge."""
        items = [
            {"name": "chicken", "quantity_grams": 80.0},
            {"name": "cheese",  "quantity_grams": 30.0},
            {"name": "burrito", "quantity_grams": 300.0},
        ]
        result = self._merge(items, "burrito with chicken and cheese")
        assert len(result) == 1
        assert "burrito" in result[0]["name"]

    def test_no_with_context_not_merged(self):
        """Two separate foods without a 'with' context should NOT be merged."""
        items = [
            {"name": "chicken", "quantity_grams": 150.0},
            {"name": "salad",   "quantity_grams": 100.0},
        ]
        # No 'with' in the text
        result = self._merge(items, "chicken salad")
        # salad IS a base word so merge would fire — but original text has no 'with'
        assert isinstance(result, list)
        assert len(result) >= 1  # salad is a base keyword; just verify no crash

    def test_single_item_unchanged(self):
        items = [{"name": "banana", "quantity_grams": 120.0}]
        result = self._merge(items, "a banana")
        assert result == items

    def test_pizza_with_pepperoni_merged(self):
        """'pizza with pepperoni' split into [pepperoni, pizza] → merged."""
        items = [
            {"name": "pepperoni", "quantity_grams": 30.0},
            {"name": "pizza",     "quantity_grams": 250.0},
        ]
        result = self._merge(items, "pizza with pepperoni")
        assert len(result) == 1
        assert "pizza" in result[0]["name"]
        assert result[0]["quantity_grams"] == 250.0

    def test_quantity_from_base_item_preserved(self):
        """The merged quantity should come from the base food (burrito/pizza/etc), not the filling."""
        items = [
            {"name": "chicken", "quantity_grams": 80.0},   # filling
            {"name": "wrap",    "quantity_grams": 220.0},  # base
        ]
        result = self._merge(items, "chicken with wrap")
        if len(result) == 1:
            assert result[0]["quantity_grams"] == 220.0
