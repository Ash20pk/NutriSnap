"""
Test 09: Daily stats and daily summary endpoints.
Verifies aggregation, timezone correctness, and target inclusion.
"""

import pytest
from datetime import date


class TestDailyStats:
    def test_get_daily_stats(self, client, state):
        """GET /meals/stats/{user_id} should return today's stats."""
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"timezone_offset": 330},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "total_calories" in body
        assert "total_protein" in body
        assert "total_carbs" in body
        assert "total_fat" in body
        assert "targets" in body
        assert "meals_logged" in body
        assert body["meals_logged"] >= 0
        assert body["targets"]["calories"] > 0

    def test_daily_stats_with_date_param(self, client, state):
        """Specifying a date should work."""
        today = date.today().isoformat()
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"date": today, "timezone_offset": 330},
        )
        assert resp.status_code == 200

    def test_daily_stats_future_date_returns_zero(self, client, state):
        """A future date should return 0 meals."""
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"date": "2099-01-01", "timezone_offset": 0},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meals_logged"] == 0
        assert body["total_calories"] == 0

    def test_daily_stats_invalid_date_returns_400(self, client, state):
        """Invalid date string should return 400."""
        resp = client.get(
            f"/meals/stats/{state.user_id}",
            params={"date": "not-a-date"},
        )
        assert resp.status_code == 400

    def test_daily_stats_wrong_user_returns_403(self, client):
        """Stats for another user should return 403."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.get(f"/meals/stats/{fake_id}")
        assert resp.status_code == 403


class TestDailySummary:
    def test_get_daily_summary(self, client, state):
        """GET /meals/{user_id}/daily-summary should return summary with targets."""
        resp = client.get(
            f"/meals/{state.user_id}/daily-summary",
            params={"timezone_offset": 330},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "totals" in body
        assert "targets" in body
        assert "meals_logged" in body
        assert body["totals"]["calories"] >= 0
        assert body["targets"]["calories"] > 0

    def test_daily_summary_with_target_date(self, client, state):
        """Specifying target_date should work."""
        today = date.today().isoformat()
        resp = client.get(
            f"/meals/{state.user_id}/daily-summary",
            params={"target_date": today, "timezone_offset": 330},
        )
        assert resp.status_code == 200

    def test_daily_summary_timezone_offset(self, client, state):
        """Summary should accept timezone_offset for correct day boundaries."""
        # IST (UTC+5:30 = +330 min)
        resp = client.get(
            f"/meals/{state.user_id}/daily-summary",
            params={"timezone_offset": 330},
        )
        assert resp.status_code == 200

        # US Eastern (UTC-5 = -300 min)
        resp2 = client.get(
            f"/meals/{state.user_id}/daily-summary",
            params={"timezone_offset": -300},
        )
        assert resp2.status_code == 200

    def test_daily_summary_totals_match_logged_meals(self, client, state):
        """Summary totals should roughly match sum of meals logged today."""
        tz = 330
        # Get summary
        summary_resp = client.get(
            f"/meals/{state.user_id}/daily-summary",
            params={"timezone_offset": tz},
        )
        summary = summary_resp.json()

        # Get history for today
        history_resp = client.get(
            f"/meals/history/{state.user_id}",
            params={"days": 1, "timezone_offset": tz},
        )
        meals = history_resp.json()["meals"]

        # Sum up history cals
        history_cals = sum(m.get("total_calories", 0) for m in meals)

        # Should match within rounding
        assert abs(summary["totals"]["calories"] - history_cals) < 1
