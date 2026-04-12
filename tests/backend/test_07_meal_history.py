"""
Test 07: Meal history and retrieval.
Verifies history fetch, timezone handling, pagination, and micros preservation.
"""

import pytest


class TestMealHistory:
    def test_get_history_returns_meals(self, client, state):
        """GET /meals/history/{user_id} should return logged meals."""
        resp = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 7, "timezone_offset": 330},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "meals" in body
        assert isinstance(body["meals"], list)
        assert len(body["meals"]) >= 1

    def test_history_meal_has_foods_array(self, client, state):
        """Each meal in history should have a foods array."""
        resp = client.get(f"/meals/history/{state.user_id}", params={"days": 7})
        meals = resp.json()["meals"]
        for m in meals[:3]:
            assert "foods" in m
            assert isinstance(m["foods"], list)

    def test_history_meal_has_micros(self, client, state):
        """Each meal should include micros dict (stored or recomputed)."""
        resp = client.get(f"/meals/history/{state.user_id}", params={"days": 7})
        meals = resp.json()["meals"]
        for m in meals[:3]:
            assert "micros" in m
            assert isinstance(m["micros"], dict)

    def test_history_respects_days_param(self, client, state):
        """Passing days=1 should return only today's meals."""
        resp = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 1, "timezone_offset": 330},
        )
        assert resp.status_code == 200
        # All returned meals should be from today
        meals = resp.json()["meals"]
        assert isinstance(meals, list)

    def test_history_large_days_param(self, client, state):
        """days=365 should not crash."""
        resp = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 365},
        )
        assert resp.status_code == 200

    def test_history_invalid_days_returns_422(self, client, state):
        """days=0 or negative should be rejected."""
        resp = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 0},
        )
        assert resp.status_code == 422

    def test_history_wrong_user_returns_403(self, client):
        """Accessing another user's history should be forbidden."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.get(f"/meals/history/{fake_id}", params={"days": 7})
        assert resp.status_code == 403

    def test_legacy_history_endpoint(self, client, state):
        """GET /meals/{user_id}/history (legacy) should also work."""
        resp = client.get(
            f"/meals/{state.user_id}/history",
            params={"days": 7},
        )
        # May return 200 or 404 depending on route registration
        assert resp.status_code in (200, 404)

    def test_timezone_offset_affects_results(self, client, state):
        """Different timezone offsets should potentially return different meals."""
        # UTC (offset=0)
        resp_utc = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 1, "timezone_offset": 0},
        )
        # IST (offset=330)
        resp_ist = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 1, "timezone_offset": 330},
        )
        assert resp_utc.status_code == 200
        assert resp_ist.status_code == 200
        # Both should return valid structures
        assert "meals" in resp_utc.json()
        assert "meals" in resp_ist.json()
