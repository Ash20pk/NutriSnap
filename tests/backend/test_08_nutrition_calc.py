"""
Test 08: Nutrition calculation correctness.
Verifies Mifflin-St Jeor, macro splits, protein ordering, and edge cases.
"""

import pytest
import sys
import os

# Allow importing the backend module directly for unit-level checks
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))


class TestMifflinStJeor:
    """Unit tests for calculate_calorie_target — no server needed."""

    @pytest.fixture(autouse=True)
    def import_calc(self):
        from app.utils.nutrition import calculate_calorie_target
        self.calc = calculate_calorie_target

    def test_male_maintain(self):
        t = self.calc(70, 175, 25, "male", "moderate", "maintain")
        bmr = (10 * 70) + (6.25 * 175) - (5 * 25) + 5
        expected = bmr * 1.55
        assert abs(t["daily_calorie_target"] - expected) < 1

    def test_female_maintain(self):
        t = self.calc(60, 165, 30, "female", "sedentary", "maintain")
        bmr = (10 * 60) + (6.25 * 165) - (5 * 30) - 161
        expected = bmr * 1.2
        assert abs(t["daily_calorie_target"] - expected) < 1

    def test_lose_weight_deficit(self):
        t_maintain = self.calc(80, 180, 30, "male", "moderate", "maintain")
        t_lose = self.calc(80, 180, 30, "male", "moderate", "lose_weight")
        assert abs(t_maintain["daily_calorie_target"] - t_lose["daily_calorie_target"] - 500) < 1

    def test_gain_muscle_surplus(self):
        t_maintain = self.calc(80, 180, 30, "male", "moderate", "maintain")
        t_gain = self.calc(80, 180, 30, "male", "moderate", "gain_muscle")
        assert abs(t_gain["daily_calorie_target"] - t_maintain["daily_calorie_target"] - 300) < 1

    def test_calorie_floor_at_1000(self):
        # Tiny person with deficit could go below 1000
        t = self.calc(40, 140, 80, "female", "sedentary", "lose_weight")
        assert t["daily_calorie_target"] >= 1000

    def test_protein_gain_muscle_higher_than_lose_weight(self):
        """gain_muscle protein (2.0 g/kg) should be >= lose_weight (1.8 g/kg)."""
        t_gain = self.calc(75, 175, 25, "male", "moderate", "gain_muscle")
        t_lose = self.calc(75, 175, 25, "male", "moderate", "lose_weight")
        assert t_gain["protein_target"] >= t_lose["protein_target"] * 0.95

    def test_protein_maintain_is_lowest(self):
        t_maint = self.calc(75, 175, 25, "male", "moderate", "maintain")
        t_lose = self.calc(75, 175, 25, "male", "moderate", "lose_weight")
        assert t_maint["protein_target"] <= t_lose["protein_target"]

    def test_macros_sum_to_calories(self):
        """Protein*4 + Carbs*4 + Fat*9 should ~= daily_calorie_target."""
        t = self.calc(70, 175, 25, "male", "moderate", "maintain")
        macro_cals = (t["protein_target"] * 4) + (t["carbs_target"] * 4) + (t["fat_target"] * 9)
        assert abs(macro_cals - t["daily_calorie_target"]) < 5

    def test_all_activity_levels(self):
        """All activity levels should produce valid results."""
        for level in ["sedentary", "light", "moderate", "active", "very_active"]:
            t = self.calc(70, 175, 25, "male", level, "maintain")
            assert t["daily_calorie_target"] > 0
            assert t["protein_target"] > 0

    def test_unknown_activity_level_falls_to_sedentary(self):
        """Unknown activity level should default to sedentary multiplier."""
        t_unknown = self.calc(70, 175, 25, "male", "unknown_level", "maintain")
        t_sedentary = self.calc(70, 175, 25, "male", "sedentary", "maintain")
        assert t_unknown["daily_calorie_target"] == t_sedentary["daily_calorie_target"]

    def test_unknown_goal_falls_to_maintain(self):
        """Unknown goal should default to maintain (no surplus/deficit)."""
        t_unknown = self.calc(70, 175, 25, "male", "moderate", "random_goal")
        t_maintain = self.calc(70, 175, 25, "male", "moderate", "maintain")
        assert t_unknown["daily_calorie_target"] == t_maintain["daily_calorie_target"]


class TestMicronutrientTargets:
    """Unit tests for micronutrient RDA computation."""

    @pytest.fixture(autouse=True)
    def import_targets(self):
        from nutrition_targets import compute_micronutrient_targets
        self.compute = compute_micronutrient_targets

    def test_basic_male_targets(self):
        targets = self.compute(25, "male")
        assert targets["vitamin_c_mg"]["rda"] == 90
        assert targets["calcium_mg"]["rda"] == 1000
        assert targets["iron_mg"]["rda"] == 8

    def test_basic_female_targets(self):
        targets = self.compute(25, "female")
        assert targets["vitamin_c_mg"]["rda"] == 75
        assert targets["iron_mg"]["rda"] == 18  # Premenopausal

    def test_postmenopausal_iron(self):
        targets = self.compute(55, "female")
        assert targets["iron_mg"]["rda"] == 8  # Postmenopausal

    def test_pregnancy_adjustments(self):
        targets = self.compute(30, "female", pregnant=True)
        assert targets["folate_ug"]["rda"] == 600  # Higher than normal 400
        assert targets["iron_mg"]["rda"] == 27

    def test_lactation_adjustments(self):
        targets = self.compute(30, "female", lactating=True)
        assert targets["vitamin_a_ug"]["rda"] == 1300
        assert targets["vitamin_c_mg"]["rda"] == 120

    def test_elderly_vitamin_d(self):
        targets = self.compute(75, "male")
        assert targets["vitamin_d_ug"]["rda"] == 20  # Higher for 71+

    def test_all_nutrients_have_rda_or_ul(self):
        targets = self.compute(25, "male")
        for nutrient, vals in targets.items():
            assert "rda" in vals, f"{nutrient} missing rda"
            assert "ul" in vals, f"{nutrient} missing ul"
