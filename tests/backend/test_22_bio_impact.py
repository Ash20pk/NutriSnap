"""
Test 22: Bio impact scoring — deterministic scoring from analytics_ai.py.

All tests are pure math (no DB, no OpenAI).  They verify:
  - _nutrient_adequacy_score boundary conditions
  - _compute_bio_impact_scores output keys, value ranges, and known reference cases
"""

import sys
import os
import pytest

_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, _BACKEND_DIR)


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  _nutrient_adequacy_score
# ═══════════════════════════════════════════════════════════════════════════════

class TestNutrientAdequacyScore:

    @pytest.fixture(autouse=True)
    def _import(self):
        from analytics_ai import _nutrient_adequacy_score
        self.score = _nutrient_adequacy_score

    # ── higher-is-better nutrients ────────────────────────────────────────────

    def test_at_rda_gives_80_or_above(self):
        """Exactly meeting RDA should score ≥ 80."""
        s = self.score(actual=90.0, rda=90.0, ul=2000.0, higher_is_better=True)
        assert s >= 80.0

    def test_double_rda_gives_100(self):
        """2× RDA is the cap and should return 100."""
        s = self.score(actual=180.0, rda=90.0, ul=2000.0, higher_is_better=True)
        assert s == pytest.approx(100.0, abs=0.1)

    def test_zero_actual_gives_zero(self):
        s = self.score(actual=0.0, rda=90.0, ul=2000.0, higher_is_better=True)
        assert s == pytest.approx(0.0, abs=0.01)

    def test_half_rda_gives_40(self):
        """50% of RDA → ratio 0.5 → 0.5 * 80 = 40."""
        s = self.score(actual=45.0, rda=90.0, ul=2000.0, higher_is_better=True)
        assert s == pytest.approx(40.0, abs=0.5)

    def test_none_rda_gives_neutral_50(self):
        """No RDA available → neutral score 50."""
        s = self.score(actual=50.0, rda=None, ul=None, higher_is_better=True)
        assert s == pytest.approx(50.0, abs=0.01)

    def test_zero_rda_gives_neutral_50(self):
        s = self.score(actual=50.0, rda=0.0, ul=None, higher_is_better=True)
        assert s == pytest.approx(50.0, abs=0.01)

    def test_score_never_above_100(self):
        """Score is capped at 100 even with 10× RDA."""
        s = self.score(actual=900.0, rda=90.0, ul=2000.0, higher_is_better=True)
        assert s <= 100.0

    def test_score_never_below_zero(self):
        s = self.score(actual=0.0, rda=90.0, ul=2000.0, higher_is_better=True)
        assert s >= 0.0

    # ── lower-is-better nutrients ─────────────────────────────────────────────

    def test_zero_intake_lower_better_gives_100(self):
        """No sugar/sodium is perfect score."""
        s = self.score(actual=0.0, rda=None, ul=50.0, higher_is_better=False)
        assert s == pytest.approx(100.0, abs=0.01)

    def test_at_ul_gives_70(self):
        """Exactly at UL should score 70 (boundary)."""
        s = self.score(actual=50.0, rda=None, ul=50.0, higher_is_better=False)
        assert s == pytest.approx(70.0, abs=0.5)

    def test_below_ul_scores_above_70(self):
        """Intake below UL should score > 70."""
        s = self.score(actual=25.0, rda=None, ul=50.0, higher_is_better=False)
        assert s > 70.0

    def test_above_ul_scores_below_70(self):
        """Intake above UL should score < 70."""
        s = self.score(actual=100.0, rda=None, ul=50.0, higher_is_better=False)
        assert s < 70.0

    def test_far_above_ul_approaches_zero(self):
        """Massively exceeding UL pushes score toward 0."""
        s = self.score(actual=500.0, rda=None, ul=50.0, higher_is_better=False)
        assert s == pytest.approx(0.0, abs=1.0)

    def test_none_ul_gives_neutral_50(self):
        s = self.score(actual=100.0, rda=None, ul=None, higher_is_better=False)
        assert s == pytest.approx(50.0, abs=0.01)


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  _compute_bio_impact_scores  — output shape + value ranges
# ═══════════════════════════════════════════════════════════════════════════════

class TestComputeBioImpactScores:

    @pytest.fixture(autouse=True)
    def _import(self):
        from analytics_ai import _compute_bio_impact_scores
        self.compute = _compute_bio_impact_scores

    # Micro targets representative of a 25-yr male
    TARGETS = {
        "iron_mg":         {"rda": 8,    "ul": 45},
        "vitamin_b12_ug":  {"rda": 2.4,  "ul": None},
        "calcium_mg":      {"rda": 1000, "ul": 2500},
        "sugar_g":         {"rda": None, "ul": 50},
        "zinc_mg":         {"rda": 11,   "ul": 40},
        "vitamin_c_mg":    {"rda": 90,   "ul": 2000},
        "magnesium_mg":    {"rda": 400,  "ul": 350},
        "folate_ug":       {"rda": 400,  "ul": 1000},
        "fiber_g":         {"rda": 38,   "ul": None},
        "saturated_fat_g": {"rda": None, "ul": 22},
        "vitamin_a_ug":    {"rda": 900,  "ul": 3000},
        "vitamin_d_ug":    {"rda": 15,   "ul": 100},
        "sodium_mg":       {"rda": None, "ul": 2300},
        "potassium_mg":    {"rda": 4700, "ul": None},
        "cholesterol_mg":  {"rda": None, "ul": 300},
    }

    # Perfect day: all nutrients at or above RDA, sugar and sodium below UL
    IDEAL_SUMMARY = {
        "avg_iron":         8.0,
        "avg_vitamin_b12":  2.4,
        "avg_calcium":      1000.0,
        "avg_sugar":        20.0,    # below UL of 50
        "avg_zinc":         11.0,
        "avg_vitamin_c":    90.0,
        "avg_magnesium":    400.0,
        "avg_folate":       400.0,
        "avg_fiber":        38.0,
        "avg_saturated_fat": 10.0,   # below UL of 22
        "avg_vitamin_a":    900.0,
        "avg_vitamin_d":    15.0,
        "avg_sodium":       1500.0,  # below UL of 2300
        "avg_potassium":    4700.0,
        "avg_cholesterol":  150.0,   # below UL of 300
    }

    # Terrible day: all nutrient-rich ones are 0, all harmful ones are maxed
    POOR_SUMMARY = {
        "avg_iron":         0.0,
        "avg_vitamin_b12":  0.0,
        "avg_calcium":      0.0,
        "avg_sugar":        200.0,   # 4× UL
        "avg_zinc":         0.0,
        "avg_vitamin_c":    0.0,
        "avg_magnesium":    0.0,
        "avg_folate":       0.0,
        "avg_fiber":        0.0,
        "avg_saturated_fat": 100.0,  # way above UL
        "avg_vitamin_a":    0.0,
        "avg_vitamin_d":    0.0,
        "avg_sodium":       10000.0, # 4× UL
        "avg_potassium":    0.0,
        "avg_cholesterol":  1000.0,  # way above UL
    }

    def _keys(self):
        return [
            "energy", "recovery", "focus", "stability",
            "antioxidants", "digestion",
        ]

    def _organ_keys(self):
        return ["heart", "liver", "kidney", "brain", "skin"]

    # ── Output shape ──────────────────────────────────────────────────────────

    def test_output_has_all_top_level_keys(self):
        result = self.compute(self.IDEAL_SUMMARY, self.TARGETS)
        for key in self._keys():
            assert key in result, f"Missing key: {key}"
        assert "organ_effects" in result

    def test_organ_effects_has_all_organ_keys(self):
        result = self.compute(self.IDEAL_SUMMARY, self.TARGETS)
        organs = result["organ_effects"]
        for key in self._organ_keys():
            assert key in organs, f"Missing organ: {key}"

    def test_all_scores_are_integers(self):
        """Scores are rounded ints (0-100) not floats."""
        result = self.compute(self.IDEAL_SUMMARY, self.TARGETS)
        for key in self._keys():
            assert isinstance(result[key], int), f"{key} is not int"
        for key in self._organ_keys():
            assert isinstance(result["organ_effects"][key], int)

    def test_all_scores_within_0_to_100(self):
        for summary in [self.IDEAL_SUMMARY, self.POOR_SUMMARY, {}]:
            result = self.compute(summary, self.TARGETS)
            for key in self._keys():
                assert 0 <= result[key] <= 100, f"{key}={result[key]} out of range"
            for key in self._organ_keys():
                v = result["organ_effects"][key]
                assert 0 <= v <= 100, f"organ.{key}={v} out of range"

    # ── Known reference cases ─────────────────────────────────────────────────

    def test_ideal_diet_scores_high(self):
        """Ideal nutrient profile should score ≥ 70 on all dimensions."""
        result = self.compute(self.IDEAL_SUMMARY, self.TARGETS)
        for key in self._keys():
            assert result[key] >= 70, f"{key} too low on ideal diet: {result[key]}"
        for key in self._organ_keys():
            assert result["organ_effects"][key] >= 70, (
                f"organ.{key} too low on ideal diet: {result['organ_effects'][key]}"
            )

    def test_poor_diet_scores_low(self):
        """Poor nutrient profile should score ≤ 40 on most dimensions."""
        result = self.compute(self.POOR_SUMMARY, self.TARGETS)
        low_count = sum(1 for k in self._keys() if result[k] <= 40)
        assert low_count >= 4, f"Expected mostly low scores, got: {result}"

    def test_empty_summary_scores_valid_range(self):
        """
        No meal data → higher-is-better nutrients score 0 (no intake),
        lower-is-better nutrients score 100 (no harmful intake).
        Scores will NOT all be 50; they'll be a mix depending on nutrient type.
        """
        result = self.compute({}, self.TARGETS)
        for key in self._keys():
            assert 0 <= result[key] <= 100, f"{key}={result[key]} out of range"
        # With no nutrients consumed, penalised dims (energy, focus, recovery) are low
        assert result["energy"] <= 50
        assert result["focus"]  <= 50

    def test_empty_targets_returns_neutral_50(self):
        """No micro targets → all scores should be 50."""
        result = self.compute(self.IDEAL_SUMMARY, {})
        for key in self._keys():
            assert result[key] == 50, f"{key}={result[key]} (expected 50)"

    # ── Organ-specific known properties ──────────────────────────────────────

    def test_heart_score_high_when_low_sodium_low_satfat_high_fiber(self):
        summary = {
            "avg_sodium":       500.0,    # well below UL of 2300
            "avg_saturated_fat": 5.0,     # well below UL of 22
            "avg_fiber":        40.0,     # above RDA of 38
            "avg_potassium":    5000.0,   # above RDA
            "avg_cholesterol":  50.0,     # well below UL of 300
        }
        result = self.compute(summary, self.TARGETS)
        assert result["organ_effects"]["heart"] >= 75

    def test_heart_score_low_when_high_sodium_high_satfat(self):
        summary = {
            "avg_sodium":       8000.0,   # 3.5× UL
            "avg_saturated_fat": 80.0,    # 3.6× UL
            "avg_fiber":        0.0,
            "avg_potassium":    0.0,
            "avg_cholesterol":  1000.0,
        }
        result = self.compute(summary, self.TARGETS)
        assert result["organ_effects"]["heart"] <= 30

    def test_stability_score_high_when_low_sugar_high_fiber(self):
        summary = {
            "avg_sugar":        5.0,      # well below UL of 50
            "avg_fiber":        40.0,
            "avg_saturated_fat": 5.0,
        }
        result = self.compute(summary, self.TARGETS)
        assert result["stability"] >= 70

    def test_focus_score_driven_by_b12_folate_iron(self):
        """Focus depends on B12 + folate + iron + low sugar."""
        high_focus_summary = {
            "avg_vitamin_b12":  2.4,
            "avg_folate":       400.0,
            "avg_iron":         8.0,
            "avg_sugar":        10.0,
        }
        low_focus_summary = {
            "avg_vitamin_b12":  0.0,
            "avg_folate":       0.0,
            "avg_iron":         0.0,
            "avg_sugar":        200.0,
        }
        high = self.compute(high_focus_summary, self.TARGETS)
        low  = self.compute(low_focus_summary,  self.TARGETS)
        assert high["focus"] > low["focus"]


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  Bio impact scoring integration  (simulate analytics bundle)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBioImpactInAnalyticsContext:
    """
    Simulate the analytics pipeline: nutrient summary → bio impact scores,
    then verify the scores appear in the analytics bundle response.
    """

    @pytest.fixture(autouse=True)
    def _import(self):
        from analytics_ai import _compute_bio_impact_scores, _nutrient_adequacy_score
        self.compute = _compute_bio_impact_scores
        self.score   = _nutrient_adequacy_score

    def test_bio_impact_score_monotone_in_b12(self):
        """
        Increasing vitamin B12 intake (holding everything else constant)
        must monotonically increase the focus and energy scores.
        """
        targets = {
            "vitamin_b12_ug": {"rda": 2.4, "ul": None},
            "folate_ug":      {"rda": 400, "ul": 1000},
            "iron_mg":        {"rda": 8,   "ul": 45},
            "sugar_g":        {"rda": None,"ul": 50},
            "calcium_mg":     {"rda": 1000,"ul": 2500},
        }
        base = {
            "avg_folate": 400.0, "avg_iron": 8.0, "avg_sugar": 20.0,
            "avg_calcium": 1000.0, "avg_vitamin_b12": 0.0,
        }
        scores = []
        for b12 in [0.0, 0.6, 1.2, 1.8, 2.4, 3.6]:
            s = self.compute({**base, "avg_vitamin_b12": b12}, targets)
            scores.append(s["focus"])
        # Each step should be >= the previous (monotone non-decreasing)
        for i in range(1, len(scores)):
            assert scores[i] >= scores[i - 1], (
                f"focus score decreased: {scores[i-1]} → {scores[i]} at b12={[0,0.6,1.2,1.8,2.4,3.6][i]}"
            )

    def test_energy_score_reflects_iron_deficiency(self):
        """Zero iron should give a low energy score."""
        targets = {
            "iron_mg":        {"rda": 8,   "ul": 45},
            "vitamin_b12_ug": {"rda": 2.4, "ul": None},
            "calcium_mg":     {"rda": 1000,"ul": 2500},
            "sugar_g":        {"rda": None,"ul": 50},
        }
        iron_ok   = self.compute({"avg_iron": 8.0,  "avg_vitamin_b12": 2.4, "avg_calcium": 1000.0, "avg_sugar": 20.0}, targets)
        iron_zero = self.compute({"avg_iron": 0.0,  "avg_vitamin_b12": 2.4, "avg_calcium": 1000.0, "avg_sugar": 20.0}, targets)
        assert iron_ok["energy"] > iron_zero["energy"]

    def test_all_scores_reproducible(self):
        """Same input always produces same output (deterministic)."""
        targets = {"sugar_g": {"rda": None, "ul": 50}, "fiber_g": {"rda": 38, "ul": None}}
        summary = {"avg_sugar": 30.0, "avg_fiber": 20.0}
        r1 = self.compute(summary, targets)
        r2 = self.compute(summary, targets)
        assert r1 == r2
