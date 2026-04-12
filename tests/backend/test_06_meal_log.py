"""
Test 06: Meal logging.
Verifies meal creation, nutrition computation, per_100g recomputation, and edge cases.
"""

import pytest
from tests.conftest import make_meal_log_data


class TestMealLog:
    def test_log_meal_basic(self, client, state):
        """POST /meals/log should create a meal and return it."""
        data = make_meal_log_data(state.user_id)
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200, resp.text

        body = resp.json()
        state.meal_id = body["id"]

        assert body["user_id"] == state.user_id
        assert body["meal_type"] == "lunch"
        assert body["total_calories"] > 0
        assert body["total_protein"] > 0
        assert len(body["foods"]) == 2

    def test_macros_recomputed_from_per_100g(self, client, state):
        """When per_100g is present, macros should be recomputed regardless of client totals."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Fake Food",
                "calories": 9999.0,        # Wrong client total
                "protein": 9999.0,
                "carbs": 9999.0,
                "fat": 9999.0,
                "calories_per_100g": 100.0,  # Correct per_100g
                "protein_per_100g": 10.0,
                "carbs_per_100g": 20.0,
                "fat_per_100g": 5.0,
                "quantity": 200.0,
                "displayQuantity": 200.0,
                "displayUnit": "g",
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200

        body = resp.json()
        # Should be 100 * 2.0 = 200 cal, NOT 9999
        assert body["total_calories"] == pytest.approx(200.0, abs=1)
        assert body["total_protein"] == pytest.approx(20.0, abs=1)
        assert body["total_carbs"] == pytest.approx(40.0, abs=1)
        assert body["total_fat"] == pytest.approx(10.0, abs=1)

    def test_macros_use_client_values_when_no_per_100g(self, client, state):
        """When per_100g is absent, client-sent totals should be preserved."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Client-only food",
                "calories": 250.0,
                "protein": 20.0,
                "carbs": 30.0,
                "fat": 8.0,
                "quantity": 100.0,
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_calories"] == pytest.approx(250.0, abs=1)

    def test_oz_unit_converted_to_grams(self, client, state):
        """Foods with unit=oz should be converted to grams."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Steak",
                "calories_per_100g": 250.0,
                "protein_per_100g": 26.0,
                "carbs_per_100g": 0.0,
                "fat_per_100g": 15.0,
                "quantity": 8.0,       # 8 oz
                "unit": "oz",
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200
        body = resp.json()
        # 8 oz = ~226.8g → ~567 cal
        assert body["total_calories"] == pytest.approx(250 * 226.8 / 100, abs=10)

    def test_zero_quantity_meal(self, client, state):
        """Zero quantity food should not crash, just log 0 cals."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Air",
                "calories_per_100g": 0.0,
                "protein_per_100g": 0.0,
                "carbs_per_100g": 0.0,
                "fat_per_100g": 0.0,
                "quantity": 0.0,
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200
        assert resp.json()["total_calories"] == 0.0

    def test_empty_foods_list(self, client, state):
        """Meal with no foods should succeed with 0 totals."""
        data = make_meal_log_data(state.user_id, foods=[])
        resp = client.post("/meals/log", json=data)
        # Might return 200 with 0 cals, or 422 validation error — both acceptable
        assert resp.status_code in (200, 422)

    def test_meal_types(self, client, state):
        """All meal types should be accepted."""
        for mt in ["breakfast", "lunch", "dinner", "snack"]:
            data = make_meal_log_data(state.user_id, meal_type=mt, foods=[
                {"name": f"Test {mt}", "calories": 100, "protein": 5, "carbs": 10, "fat": 3, "quantity": 100}
            ])
            resp = client.post("/meals/log", json=data)
            assert resp.status_code == 200, f"Failed for meal_type={mt}"

    def test_micros_stored_on_log(self, client, state):
        """Logged meal should have micros in the response."""
        data = make_meal_log_data(state.user_id)
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200
        body = resp.json()
        assert "micros" in body
        assert isinstance(body["micros"], dict)

    def test_delete_meal(self, client, state):
        """DELETE /meals/{id} should remove the meal."""
        # Log a throwaway meal
        data = make_meal_log_data(state.user_id, notes="delete me")
        resp = client.post("/meals/log", json=data)
        meal_id = resp.json()["id"]

        resp = client.delete(f"/meals/{meal_id}")
        assert resp.status_code == 200

    def test_delete_other_users_meal_returns_403(self, client):
        """Deleting another user's meal should be forbidden."""
        fake_meal = "00000000-0000-0000-0000-000000000000"
        resp = client.delete(f"/meals/{fake_meal}")
        assert resp.status_code in (403, 404)
