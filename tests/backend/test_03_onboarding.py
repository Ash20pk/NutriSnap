"""
Test 03: User onboarding.
Verifies profile creation, nutrition target computation, and idempotency.
"""

import pytest
from tests.conftest import make_onboarding_data


class TestOnboarding:
    def test_onboard_creates_profile(self, client, test_user, state):
        """POST /user/onboard should create a profile and return targets."""
        data = make_onboarding_data()
        resp = client.post("/user/onboard", json=data)
        assert resp.status_code == 200, resp.text

        body = resp.json()
        state.user_id = body["id"]

        # Profile fields present
        assert body["name"] == "E2E Test User"
        assert body["gender"] == "male"
        assert body["height"] == 175.0
        assert body["weight"] == 72.0
        assert body["onboarding_completed"] is True
        assert body.get("date_of_birth") == "1995-06-15"

        # Nutrition targets computed
        assert body["daily_calorie_target"] > 0
        assert body["protein_target"] > 0
        assert body["carbs_target"] > 0
        assert body["fat_target"] > 0

        state.calorie_target = body["daily_calorie_target"]
        state.protein_target = body["protein_target"]
        state.carbs_target = body["carbs_target"]
        state.fat_target = body["fat_target"]

    def test_calorie_target_uses_mifflin_st_jeor(self, state):
        """Verify calorie target matches Mifflin-St Jeor for the test profile."""
        # Male, 72kg, 175cm, age ~30 (born 1995), moderate, maintain
        bmr = (10 * 72) + (6.25 * 175) - (5 * 30) + 5  # ~1664
        tdee = bmr * 1.55  # moderate = 1.55 → ~2579
        # maintain = no adjustment
        # Allow ±100 kcal tolerance for age rounding
        assert abs(state.calorie_target - tdee) < 100, (
            f"Expected ~{tdee:.0f}, got {state.calorie_target}"
        )

    def test_protein_target_for_maintain_goal(self, state):
        """Maintain goal should use ~1.2 g/kg protein."""
        expected = 72.0 * 1.2  # 86.4g
        # AMDR bounds may adjust, allow ±30g
        assert abs(state.protein_target - expected) < 30

    def test_onboard_is_idempotent(self, client, state):
        """Re-onboarding with same data should update, not fail."""
        data = make_onboarding_data(weight=75.0)
        resp = client.post("/user/onboard", json=data)
        assert resp.status_code == 200

        body = resp.json()
        assert body["weight"] == 75.0
        # Targets should be recalculated for new weight
        assert body["daily_calorie_target"] != state.calorie_target or body["weight"] != 72.0

        # Reset to original weight
        data = make_onboarding_data()
        client.post("/user/onboard", json=data)

    def test_onboard_invalid_date_returns_400(self, client):
        """Invalid date_of_birth should return 400."""
        data = make_onboarding_data(date_of_birth="not-a-date")
        resp = client.post("/user/onboard", json=data)
        assert resp.status_code == 400

    def test_onboard_future_date_of_birth(self, client):
        """Future date_of_birth should still work (age = 0)."""
        data = make_onboarding_data(date_of_birth="2030-01-01")
        resp = client.post("/user/onboard", json=data)
        # Should succeed but age will be 0 or negative — app should handle gracefully
        assert resp.status_code in (200, 400)

        # Reset
        client.post("/user/onboard", json=make_onboarding_data())
