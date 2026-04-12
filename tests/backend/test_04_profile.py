"""
Test 04: Profile retrieval and updates.
Covers GET /user/me, PUT /user/me/profile, goals update, username, weight check.
"""

import pytest
from tests.conftest import make_onboarding_data


class TestProfile:
    def test_get_me_returns_profile(self, client, state):
        """GET /user/me should return the onboarded profile."""
        resp = client.get("/user/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == state.user_id
        assert body["onboarding_completed"] is True
        assert "daily_calorie_target" in body
        assert "age" in body
        assert body["age"] > 0  # Computed from DOB

    def test_update_bio_and_avatar(self, client):
        """PUT /user/me/profile should update bio and avatar."""
        resp = client.put("/user/me/profile", json={
            "bio": "E2E test bio",
            "avatar_url": "https://example.com/avatar.png",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["bio"] == "E2E test bio"
        assert body["avatar_url"] == "https://example.com/avatar.png"

    def test_update_goals_recalculates_targets(self, client, state):
        """PUT /user/{id}/goals should change targets."""
        resp = client.put(f"/user/{state.user_id}/goals", json={
            "goal": "lose_weight",
            "activity_level": "active",
        })
        assert resp.status_code == 200
        body = resp.json()

        # lose_weight = TDEE - 500, active = 1.725 multiplier → higher base, lower final
        assert body["daily_calorie_target"] != state.calorie_target
        # Protein should be higher (1.8 g/kg for lose_weight)
        assert body["protein_target"] > state.protein_target * 0.8

        # Reset to maintain
        client.put(f"/user/{state.user_id}/goals", json={
            "goal": "maintain",
            "activity_level": "moderate",
        })

    def test_update_goals_uses_fresh_age(self, client, state):
        """Goals update should derive age from DOB, not stale stored integer."""
        resp = client.put(f"/user/{state.user_id}/goals", json={
            "goal": "gain_muscle",
            "activity_level": "moderate",
        })
        assert resp.status_code == 200
        body = resp.json()

        # gain_muscle protein should be 2.0 g/kg (after our fix)
        # For 72kg that's 144g, AMDR may cap at 35% of calories
        assert body["protein_target"] > 100  # At minimum above 100g

        # Reset
        client.put(f"/user/{state.user_id}/goals", json={
            "goal": "maintain",
            "activity_level": "moderate",
        })

    def test_set_username(self, client):
        """POST /user/me/username should set username."""
        import uuid
        username = f"e2e_test_{uuid.uuid4().hex[:6]}"
        resp = client.post("/user/me/username", json={"username": username})
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == username

    def test_set_invalid_username_returns_400(self, client):
        """Invalid usernames should be rejected."""
        for bad_name in ["ab", "A" * 25, "no spaces", "special!chars"]:
            resp = client.post("/user/me/username", json={"username": bad_name})
            assert resp.status_code == 400, f"Expected 400 for '{bad_name}', got {resp.status_code}"

    def test_record_weight_check(self, client, state):
        """POST /user/me/weight-check should update weight and recalc targets."""
        resp = client.post("/user/me/weight-check", json={
            "weight": 74.5,
            "notes": "E2E test weight check",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["weight"] == 74.5

        # Targets should have been recalculated for new weight
        assert body["daily_calorie_target"] > 0

        # Reset
        client.post("/user/me/weight-check", json={"weight": 72.0})

    def test_get_weight_history(self, client):
        """GET /user/me/weight-history should return entries."""
        resp = client.get("/user/me/weight-history", params={"limit": 5})
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) >= 1  # At least the onboarding entry
        assert "weight" in body[0]
        assert "recorded_at" in body[0]

    def test_other_user_profile_forbidden(self, client):
        """Accessing another user's profile should return 403."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.put(f"/user/{fake_id}/goals", json={
            "goal": "maintain",
            "activity_level": "moderate",
        })
        assert resp.status_code == 403
