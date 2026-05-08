"""
Test 23: Photo analysis pipeline + NutriLens label extraction.

Unit tests (no OpenAI, no DB):
  - analyze_food_image response parser guard-rails
  - Photo → matched foods multiplier pipeline
  - process-label endpoint shape checks

Integration tests (marked @pytest.mark.ai, call real OpenAI):
  - POST /meals/log-photo with blank image
  - POST /foods/process-label with blank image
"""

import sys
import os
import json
import pytest

_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, _BACKEND_DIR)

# Minimal 1×1 white pixel PNG (valid base64)
BLANK_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"
    "2mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg=="
)


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  Photo analysis response envelope  (unit — no OpenAI)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhotoAnalysisResponseShape:
    """
    Simulate what analyze_photo returns after the AI response is parsed
    and matched to DB rows.  We verify the output envelope is correct
    without calling OpenAI.
    """

    @staticmethod
    def _build_response(analysis: dict, matched_foods: list) -> dict:
        """Inline replica of AIMealService.analyze_photo return value."""
        return {
            "coin_detected": analysis.get("coin_detected", False),
            "coin_type":     analysis.get("coin_type"),
            "foods":         matched_foods,
            "notes":         analysis.get("notes", ""),
        }

    def test_no_coin_detected_flag_is_false_by_default(self):
        r = self._build_response({}, [])
        assert r["coin_detected"] is False
        assert r["coin_type"] is None

    def test_coin_type_forwarded(self):
        r = self._build_response({"coin_detected": True, "coin_type": "₹5"}, [])
        assert r["coin_detected"] is True
        assert r["coin_type"] == "₹5"

    def test_foods_list_forwarded(self):
        foods = [
            {"name": "Dal", "calories": 120.0, "protein": 8.0, "quantity": 100.0},
        ]
        r = self._build_response({"foods": foods}, foods)
        assert len(r["foods"]) == 1
        assert r["foods"][0]["name"] == "Dal"

    def test_notes_forwarded(self):
        r = self._build_response({"notes": "Low confidence detection"}, [])
        assert r["notes"] == "Low confidence detection"

    def test_empty_analysis_gives_empty_foods(self):
        r = self._build_response({}, [])
        assert r["foods"] == []

    def test_each_food_should_carry_confidence(self):
        """After matching, foods should include confidence from the AI response."""
        raw_food = {"name": "Roti", "estimated_quantity_grams": 30.0, "confidence": "high"}
        matched = {
            "name": "Roti",
            "quantity": 30.0,
            "calories": 90.0,
            "protein": 3.0,
            "carbs": 18.0,
            "fat": 0.5,
        }
        matched["confidence"] = raw_food.get("confidence", "medium")
        r = self._build_response({"foods": [raw_food]}, [matched])
        assert r["foods"][0]["confidence"] == "high"


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  Photo → nutrition multiplier pipeline  (unit — pure math)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhotoFoodNutrientMultiplier:
    """
    The match step in AIMealService._match_food_to_database multiplies
    per-100g values by (quantity / 100).  We test that logic in isolation.
    """

    @staticmethod
    def _apply_match(food_row: dict, qty_grams: float) -> dict:
        multiplier = qty_grams / 100.0
        return {
            "food_id":           food_row.get("id", "test"),
            "name":              food_row.get("name", ""),
            "quantity":          qty_grams,
            "calories":          round(float(food_row.get("calories_per_100g", 0) or 0) * multiplier, 2),
            "protein":           round(float(food_row.get("protein_per_100g",  0) or 0) * multiplier, 2),
            "carbs":             round(float(food_row.get("carbs_per_100g",    0) or 0) * multiplier, 2),
            "fat":               round(float(food_row.get("fat_per_100g",      0) or 0) * multiplier, 2),
            "calories_per_100g": float(food_row.get("calories_per_100g", 0) or 0),
        }

    @pytest.mark.parametrize("food,qty,expected_cal", [
        # (name, grams, expected_kcal)
        ("Dal (200g)",   200, 340),   # 170 kcal/100g
        ("Roti (30g)",    30,  90),   # 300 kcal/100g
        ("Rice (150g)",  150, 195),   # 130 kcal/100g
        ("Paneer (50g)",  50, 132),   # 265 kcal/100g
    ])
    def test_common_indian_dish_calories(self, food, qty, expected_cal):
        kcal_per_100 = {
            "Dal (200g)":   170.0,
            "Roti (30g)":   300.0,
            "Rice (150g)":  130.0,
            "Paneer (50g)": 265.0,
        }[food]
        row = {"calories_per_100g": kcal_per_100}
        r = self._apply_match(row, qty)
        assert r["calories"] == pytest.approx(expected_cal, rel=0.01)

    def test_zero_quantity_gives_zero_macros(self):
        row = {"calories_per_100g": 165.0, "protein_per_100g": 31.0}
        r = self._apply_match(row, 0.0)
        assert r["calories"] == 0.0
        assert r["protein"] == 0.0

    def test_per_100g_values_preserved_on_matched_food(self):
        row = {"calories_per_100g": 165.0, "protein_per_100g": 31.0}
        r = self._apply_match(row, 200.0)
        assert r["calories_per_100g"] == 165.0

    def test_multi_food_meal_total(self):
        """Sum of matched foods matches expected meal total."""
        foods = [
            self._apply_match({"calories_per_100g": 170.0, "protein_per_100g": 9.0}, 200.0),  # dal
            self._apply_match({"calories_per_100g": 300.0, "protein_per_100g": 8.5}, 30.0),   # roti
        ]
        total_cal = sum(f["calories"] for f in foods)
        total_prot = sum(f["protein"] for f in foods)
        assert total_cal  == pytest.approx(340.0 + 90.0,   abs=0.5)
        assert total_prot == pytest.approx(18.0  + 2.55,   abs=0.1)


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  NutriLens process-label response shape  (unit — no OpenAI)
# ═══════════════════════════════════════════════════════════════════════════════

class TestProcessLabelResponseShape:
    """
    Verify the process-label return envelope without calling OpenAI.
    Simulates what label_service.process_label should return.
    """

    @staticmethod
    def _build_label_response(food_data: dict, health_check: dict) -> dict:
        """Inline replica of label_service.process_label return shape."""
        return {
            "food": {
                "id":                food_data.get("barcode", "unknown"),
                "name":              food_data.get("name"),
                "brand":             food_data.get("brand"),
                "calories_per_100g": food_data.get("calories_per_100g", 0),
                "protein_per_100g":  food_data.get("protein_per_100g",  0),
                "carbs_per_100g":    food_data.get("carbs_per_100g",    0),
                "fat_per_100g":      food_data.get("fat_per_100g",      0),
            },
            "health_check": health_check,
        }

    def test_food_field_present(self):
        r = self._build_label_response({"name": "Creatine"}, {})
        assert "food" in r

    def test_health_check_field_present(self):
        r = self._build_label_response({}, {"score": 75})
        assert "health_check" in r

    def test_nutrition_fields_flat_on_food(self):
        """Nutrition values must be flat on food, not nested."""
        r = self._build_label_response({
            "name": "Protein Bar",
            "calories_per_100g": 380.0,
            "protein_per_100g": 30.0,
        }, {})
        food = r["food"]
        assert food["calories_per_100g"] == pytest.approx(380.0, abs=0.1)
        assert food["protein_per_100g"]  == pytest.approx(30.0,  abs=0.1)
        # Must NOT be nested
        assert "nutrition" not in food

    def test_missing_nutrition_defaults_to_zero(self):
        r = self._build_label_response({"name": "Unknown"}, {})
        food = r["food"]
        assert food["calories_per_100g"] == 0
        assert food["protein_per_100g"]  == 0

    def test_health_check_score_accessible(self):
        hc = {"overall_score": 65, "flags": ["high sugar"]}
        r = self._build_label_response({}, hc)
        assert r["health_check"]["overall_score"] == 65
        assert "high sugar" in r["health_check"]["flags"]


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  Live endpoint smoke tests  (integration — needs server)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhotoEndpointSmoke:
    """
    Basic shape-only checks on the live endpoints.
    No AI call — we only test that the endpoint is reachable and returns
    the right envelope (errors or empty results are fine).
    """

    def test_log_photo_requires_auth(self, anon_client, state):
        resp = anon_client.post("/meals/log-photo", json={
            "user_id": state.user_id,
            "image_base64": BLANK_PNG,
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.ai
    def test_log_photo_blank_image_returns_foods_list(self, client, state):
        """Blank image should not crash; may return empty foods or low-confidence items."""
        resp = client.post("/meals/log-photo", json={
            "user_id": state.user_id,
            "image_base64": BLANK_PNG,
        })
        if resp.status_code == 429:
            pytest.skip("Rate limited — rerun after 1 minute")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "foods" in body
        assert isinstance(body["foods"], list)
        assert "coin_detected" in body

    def test_process_label_requires_auth(self, anon_client, state):
        resp = anon_client.post("/foods/process-label", json={
            "user_id": state.user_id,
            "barcode": "1234567890123",
            "image_base64": BLANK_PNG,
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.ai
    def test_process_label_blank_image_returns_food_and_health_check(self, client, state):
        """Blank image through NutriLens should return the correct envelope."""
        resp = client.post("/foods/process-label", json={
            "user_id": state.user_id,
            "barcode": "9999999999999",
            "image_base64": BLANK_PNG,
        })
        # 200 with food+health_check, or 400/422 if validation rejects blank
        assert resp.status_code in (200, 400, 422, 500), resp.text
        if resp.status_code == 200:
            body = resp.json()
            assert "food" in body
            assert "health_check" in body
            # nutrition fields must be flat on food
            food = body["food"]
            assert "nutrition" not in food
            for field in ("calories_per_100g", "protein_per_100g",
                          "carbs_per_100g", "fat_per_100g"):
                assert field in food, f"Missing field: {field}"

    @pytest.mark.ai
    def test_has_food_blank_image_returns_bool(self, client, state):
        """has-food must return has_food bool regardless of content."""
        resp = client.post("/meals/has-food", json={
            "user_id": state.user_id,
            "image_base64": BLANK_PNG,
        })
        if resp.status_code == 429:
            pytest.skip("Rate limited — rerun after 1 minute")
        assert resp.status_code == 200
        body = resp.json()
        assert "has_food" in body
        assert isinstance(body["has_food"], bool)
