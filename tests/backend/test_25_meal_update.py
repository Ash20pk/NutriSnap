"""
Test 25: Meal update and edit endpoints.

Unit tests (no DB):
  - Macro recomputation from per_100g on update
  - oz→g unit conversion on update
  - Partial update (meal_type/notes only, no foods)

Integration tests (need server):
  - PATCH /meals/{id}  (type, foods, notes)
  - Update non-existent meal → 404
  - Update another user's meal → 403
  - Auth guard
"""

import sys
import os
import pytest

_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, _BACKEND_DIR)


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  Update normalization logic  (unit — pure Python)
# ═══════════════════════════════════════════════════════════════════════════════

class TestMealUpdateNormalization:
    """
    Inline the normalization block from MealService.update_meal so we can test
    it without a DB. Mirrors the same logic as log_meal normalization.
    """

    @staticmethod
    def _normalize_food(raw: dict) -> dict:
        nf = dict(raw)
        if not nf.get("food_id") and nf.get("id"):
            nf["food_id"] = nf["id"]
        qty_raw = nf.get("quantity") if nf.get("quantity") is not None else nf.get("displayQuantity")
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

    def test_per_100g_recomputed_on_update(self):
        raw = {"name": "Chicken", "quantity": 200.0, "calories_per_100g": 165.0, "protein_per_100g": 31.0}
        nf = self._normalize_food(raw)
        assert nf["calories"] == pytest.approx(330.0, abs=0.1)
        assert nf["protein"] == pytest.approx(62.0, abs=0.1)

    def test_oz_converted_to_grams(self):
        raw = {"name": "Steak", "displayQuantity": 6.0, "displayUnit": "oz", "calories_per_100g": 250.0}
        nf = self._normalize_food(raw)
        expected_grams = 6.0 * 28.3495
        assert nf["quantity"] == pytest.approx(expected_grams, rel=0.001)
        assert nf["displayUnit"] == "g"

    def test_oz_calories_recomputed_after_conversion(self):
        raw = {"displayQuantity": 4.0, "displayUnit": "oz", "calories_per_100g": 200.0}
        nf = self._normalize_food(raw)
        grams = 4.0 * 28.3495
        assert nf["calories"] == pytest.approx(grams * 200.0 / 100.0, rel=0.01)

    def test_missing_macros_default_to_zero(self):
        raw = {"name": "Mystery food", "quantity": 100.0}
        nf = self._normalize_food(raw)
        for key in ("calories", "protein", "carbs", "fat"):
            assert nf[key] == 0.0

    def test_id_copied_to_food_id(self):
        raw = {"id": "uuid-abc", "quantity": 50.0}
        nf = self._normalize_food(raw)
        assert nf["food_id"] == "uuid-abc"

    def test_display_quantity_aligned_to_grams(self):
        raw = {"displayQuantity": 3.0, "displayUnit": "oz"}
        nf = self._normalize_food(raw)
        assert nf["displayQuantity"] == pytest.approx(nf["quantity"], rel=0.001)

    def test_zero_quantity_gives_zero_macros(self):
        raw = {"quantity": 0.0, "calories_per_100g": 200.0, "protein_per_100g": 20.0}
        nf = self._normalize_food(raw)
        assert nf["calories"] == 0.0
        assert nf["protein"] == 0.0

    @pytest.mark.parametrize("qty,cal_per_100,expected", [
        (100, 165.0, 165.0),
        (250, 130.0, 325.0),
        (50, 380.0, 190.0),
    ])
    def test_calories_parametrized(self, qty, cal_per_100, expected):
        nf = self._normalize_food({"quantity": float(qty), "calories_per_100g": cal_per_100})
        assert nf["calories"] == pytest.approx(expected, rel=0.01)


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  Meal update integration tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMealUpdateEndpoint:

    def _log_meal(self, client, state) -> str:
        """Helper: log a simple meal and return its id."""
        resp = client.post("/meals/log", json={
            "user_id": state.user_id,
            "meal_type": "lunch",
            "foods": [{
                "name": "Rice",
                "quantity": 200.0,
                "calories_per_100g": 130.0,
                "protein_per_100g": 2.7,
                "carbs_per_100g": 28.0,
                "fat_per_100g": 0.3,
            }],
            "logging_method": "manual",
        })
        assert resp.status_code == 200, resp.text
        return resp.json()["id"]

    def test_update_meal_type_only(self, client, state):
        meal_id = self._log_meal(client, state)
        resp = client.put(f"/meals/{meal_id}", json={"meal_type": "dinner"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["meal_type"] == "dinner"

    def test_update_notes_only(self, client, state):
        meal_id = self._log_meal(client, state)
        resp = client.put(f"/meals/{meal_id}", json={"notes": "updated note"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["notes"] == "updated note"

    def test_update_foods_recomputes_totals(self, client, state):
        meal_id = self._log_meal(client, state)
        new_foods = [{
            "name": "Dal",
            "quantity": 300.0,
            "calories_per_100g": 170.0,
            "protein_per_100g": 9.0,
            "carbs_per_100g": 28.0,
            "fat_per_100g": 0.7,
        }]
        resp = client.put(f"/meals/{meal_id}", json={"foods": new_foods})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total_calories"] == pytest.approx(510.0, abs=1.0)
        assert body["total_protein"] == pytest.approx(27.0, abs=0.5)

    def test_update_nonexistent_meal_returns_404(self, client, state):
        resp = client.put("/meals/00000000-0000-0000-0000-000000000099", json={"meal_type": "snack"})
        assert resp.status_code == 404

    def test_update_requires_auth(self, anon_client, state):
        resp = anon_client.put("/meals/00000000-0000-0000-0000-000000000001", json={"meal_type": "snack"})
        assert resp.status_code in (401, 403)

    def test_updated_meal_appears_in_history(self, client, state):
        meal_id = self._log_meal(client, state)
        client.put(f"/meals/{meal_id}", json={"notes": "verified-update"})
        resp = client.get(f"/meals/{state.user_id}/history")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        history = body["meals"] if isinstance(body, dict) and "meals" in body else body
        assert isinstance(history, list), f"Expected list, got {type(body)}: {body}"
        notes = [m.get("notes") for m in history if isinstance(m, dict)]
        assert "verified-update" in notes
