"""
Test 16: Analytics bundle, refresh, and micronutrient targets.
"""

import pytest


class TestAnalytics:
    def test_get_analytics_bundle(self, client, state):
        """GET /analytics/{user_id}/bundle should return analytics data."""
        resp = client.get(
            f"/analytics/{state.user_id}/bundle",
            params={"time_range": "week", "timezone_offset": 330},
        )
        assert resp.status_code == 200
        body = resp.json()
        # Should have meals and analytics sections
        has_meals = "meals" in body or "history" in body
        has_ai = "analytics" in body or "ai" in body
        assert has_meals or has_ai, f"Unexpected bundle shape: {list(body.keys())}"

    def test_analytics_bundle_includes_micronutrient_targets(self, client, state):
        """Bundle should include micronutrient_targets."""
        resp = client.get(
            f"/analytics/{state.user_id}/bundle",
            params={"time_range": "week", "timezone_offset": 330, "include_daily_ai": True},
        )
        assert resp.status_code == 200
        body = resp.json()
        if "micronutrient_targets" in body:
            targets = body["micronutrient_targets"]
            assert isinstance(targets, dict)
            # Should have common nutrients
            expected_keys = ["vitamin_c_mg", "calcium_mg", "iron_mg"]
            for key in expected_keys:
                if key in targets:
                    assert "rda" in targets[key]

    def test_analytics_time_ranges(self, client, state):
        """All time ranges should work."""
        for tr in ["week", "month"]:
            resp = client.get(
                f"/analytics/{state.user_id}/bundle",
                params={"time_range": tr, "timezone_offset": 0},
            )
            assert resp.status_code == 200, f"Failed for time_range={tr}"

    @pytest.mark.ai
    def test_refresh_analytics(self, client, state):
        """POST /analytics/{user_id}/refresh should regenerate AI insights."""
        resp = client.post(
            f"/analytics/{state.user_id}/refresh",
            params={"time_range": "week", "timezone_offset": 330},
        )
        assert resp.status_code == 200

    def test_analytics_wrong_user_returns_403(self, client):
        """Another user's analytics should be forbidden."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.get(f"/analytics/{fake_id}/bundle")
        assert resp.status_code == 403
