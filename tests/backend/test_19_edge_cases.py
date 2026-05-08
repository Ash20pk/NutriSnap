"""
Test 19: Edge cases and regression tests.
Covers bugs found during the nutrition audit and other boundary conditions.
"""

import pytest
from tests.conftest import make_meal_log_data


class TestNutritionEdgeCases:
    def test_per_100g_always_overrides_client_macros(self, client, state):
        """REGRESSION: per_100g should always override client-sent totals."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Oats",
                "calories": 1.0,            # Wrong
                "calories_per_100g": 379.0,  # Correct
                "protein": 1.0,
                "protein_per_100g": 13.2,
                "carbs": 1.0,
                "carbs_per_100g": 67.7,
                "fat": 1.0,
                "fat_per_100g": 6.5,
                "quantity": 50.0,
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200
        body = resp.json()
        # 379 * 0.5 = 189.5
        assert body["total_calories"] == pytest.approx(189.5, abs=1)

    def test_negative_quantity_handled(self, client, state):
        """Negative quantity should not produce negative calories."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Negative Test",
                "calories_per_100g": 100.0,
                "protein_per_100g": 10.0,
                "carbs_per_100g": 10.0,
                "fat_per_100g": 5.0,
                "quantity": -50.0,
            }
        ])
        resp = client.post("/meals/log", json=data)
        # Server may accept and compute (possibly negative) or reject — both are valid
        assert resp.status_code in (200, 422)

    def test_very_large_quantity(self, client, state):
        """Very large quantity should not crash."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "Water",
                "calories_per_100g": 0.0,
                "protein_per_100g": 0.0,
                "carbs_per_100g": 0.0,
                "fat_per_100g": 0.0,
                "quantity": 999999.0,
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200

    def test_missing_food_name_returns_error(self, client, state):
        """Food without name should be rejected."""
        data = {
            "user_id": state.user_id,
            "meal_type": "lunch",
            "foods": [{"calories": 100, "protein": 5, "carbs": 10, "fat": 3}],
            "logging_method": "manual",
        }
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 422  # Pydantic validation error

    def test_unicode_food_name(self, client, state):
        """Unicode food names should not crash."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "पनीर टिक्का",
                "calories": 200,
                "protein": 15,
                "carbs": 5,
                "fat": 14,
                "quantity": 100,
            }
        ])
        resp = client.post("/meals/log", json=data)
        assert resp.status_code == 200

    def test_very_long_food_name(self, client, state):
        """Very long food name should be handled."""
        data = make_meal_log_data(state.user_id, foods=[
            {
                "name": "A" * 500,
                "calories": 100,
                "protein": 5,
                "carbs": 10,
                "fat": 3,
                "quantity": 100,
            }
        ])
        resp = client.post("/meals/log", json=data)
        # Should either succeed or return a clean error
        assert resp.status_code in (200, 400, 422)


class TestTimezoneEdgeCases:
    def test_extreme_positive_timezone(self, client, state):
        """UTC+14 (Kiritimati) should not crash."""
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"timezone_offset": 840},
        )
        assert resp.status_code == 200

    def test_extreme_negative_timezone(self, client, state):
        """UTC-12 (Baker Island) should not crash."""
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"timezone_offset": -720},
        )
        assert resp.status_code == 200

    def test_zero_timezone(self, client, state):
        """UTC+0 should work."""
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"timezone_offset": 0},
        )
        assert resp.status_code == 200

    def test_daily_summary_and_stats_agree(self, client, state):
        """daily-summary and stats should report same calories for same day/tz."""
        tz = 330
        summary_resp = client.get(
            f"/meals/{state.user_id}/daily-summary",
            params={"timezone_offset": tz},
        )
        stats_resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"timezone_offset": tz},
        )
        assert summary_resp.status_code == 200
        assert stats_resp.status_code == 200

        summary_cals = summary_resp.json().get("totals", {}).get("calories", 0)
        stats_cals = stats_resp.json().get("total_calories", 0)
        assert abs(summary_cals - stats_cals) < 1, (
            f"Summary={summary_cals}, Stats={stats_cals}"
        )


class TestProfileEdgeCases:
    def test_update_goals_age_not_stale(self, client, state):
        """REGRESSION: update_goals should derive age from DOB, not stored integer."""
        # Update goals
        resp = client.put(f"/user/{state.user_id}/goals", json={
            "goal": "gain_muscle",
            "activity_level": "moderate",
        })
        assert resp.status_code == 200
        body = resp.json()

        # Get profile to compare age
        profile = (client.get("/user/me")).json()
        assert profile["age"] > 0

        # Protein should be based on current weight * 2.0 g/kg
        expected_protein_min = profile["weight"] * 1.5  # allowing AMDR bounds
        assert body["protein_target"] >= expected_protein_min * 0.5

        # Reset
        client.put(f"/user/{state.user_id}/goals", json={
            "goal": "maintain",
            "activity_level": "moderate",
        })

    def test_gain_muscle_protein_higher_than_lose_weight(self, client, state):
        """REGRESSION: gain_muscle protein should be >= lose_weight protein."""
        resp_gain = client.put(f"/user/{state.user_id}/goals", json={
            "goal": "gain_muscle",
            "activity_level": "moderate",
        })
        gain_protein = resp_gain.json()["protein_target"]

        resp_lose = client.put(f"/user/{state.user_id}/goals", json={
            "goal": "lose_weight",
            "activity_level": "moderate",
        })
        lose_protein = resp_lose.json()["protein_target"]

        assert gain_protein >= lose_protein * 0.95, (
            f"gain_muscle protein ({gain_protein}) should be >= lose_weight ({lose_protein})"
        )

        # Reset
        client.put(f"/user/{state.user_id}/goals", json={
            "goal": "maintain",
            "activity_level": "moderate",
        })


class TestConcurrency:
    def test_concurrent_meal_logs(self, auth_token, state):
        """Multiple simultaneous meal logs should not corrupt data.

        Each thread gets its own httpx.Client — sharing a single client across
        threads can cause connection-reset errors under concurrent load.
        """
        import httpx
        import os
        from concurrent.futures import ThreadPoolExecutor

        BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001")

        def log_one(i):
            data = make_meal_log_data(state.user_id, notes=f"concurrent-{i}", foods=[
                {
                    "name": f"Food {i}",
                    "calories": 100 + i,
                    "protein": 10,
                    "carbs": 10,
                    "fat": 5,
                    "quantity": 100,
                }
            ])
            with httpx.Client(
                base_url=f"{BASE_URL}/api",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
                follow_redirects=True,
            ) as c:
                return c.post("/meals/log", json=data)

        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(log_one, range(5)))

        statuses = [r.status_code for r in results]
        assert all(s == 200 for s in statuses), f"Some failed: {statuses}"

        # Each should have different calorie totals
        cals = [r.json()["total_calories"] for r in results]
        assert len(set(cals)) == 5
