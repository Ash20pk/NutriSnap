"""
Test 14: Quests, badges, streaks, and leaderboard.
"""

import pytest


class TestQuests:
    def test_get_daily_quests(self, client, state):
        """GET /quests/{user_id}/daily should return quest list."""
        resp = client.get(f"/quests/{state.user_id}/daily")
        assert resp.status_code == 200
        body = resp.json()
        assert "quests" in body
        assert isinstance(body["quests"], list)

    def test_quest_has_required_fields(self, client, state):
        """Each quest should have id, title, current, target, is_completed."""
        resp = client.get(f"/quests/{state.user_id}/daily")
        quests = resp.json()["quests"]
        for q in quests:
            for field in ["id", "title", "current", "target", "is_completed"]:
                assert field in q, f"Quest missing {field}: {q}"

    def test_get_quest_stats(self, client, state):
        """GET /quests/{user_id}/stats should return XP, level, streak."""
        resp = client.get(f"/quests/{state.user_id}/stats")
        assert resp.status_code == 200
        body = resp.json()
        assert "total_xp" in body
        assert "level" in body
        assert "current_streak" in body

    def test_get_badges(self, client, state):
        """GET /quests/{user_id}/badges should return badge list."""
        resp = client.get(f"/quests/{state.user_id}/badges")
        assert resp.status_code == 200
        body = resp.json()
        assert "badges" in body
        assert isinstance(body["badges"], list)

    def test_check_badges(self, client, state):
        """POST /quests/{user_id}/check-badges should trigger badge evaluation."""
        resp = client.post(f"/quests/{state.user_id}/check-badges")
        assert resp.status_code == 200
        body = resp.json()
        assert "newly_earned" in body
        assert "xp_earned" in body

    def test_streak_calendar(self, client, state):
        """GET /quests/{user_id}/streak-calendar should return calendar data."""
        resp = client.get(
            f"/quests/{state.user_id}/streak-calendar",
            params={"days": 30},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "days" in body
        assert isinstance(body["days"], list)

    def test_claim_quest_xp(self, client, state):
        """POST /quests/{user_id}/claim/{quest_id} should return XP result."""
        # First get quests to find a completed one
        resp = client.get(f"/quests/{state.user_id}/daily")
        quests = resp.json()["quests"]
        completed = [q for q in quests if q.get("is_completed")]

        if completed:
            qid = completed[0]["id"]
            resp = client.post(f"/quests/{state.user_id}/claim/{qid}")
            assert resp.status_code in (200, 400)  # 400 if already claimed

    def test_leaderboard(self, client):
        """GET /quests/leaderboard should return entries."""
        resp = client.get("/quests/leaderboard", params={"scope": "global"})
        assert resp.status_code == 200
        body = resp.json()
        assert "leaderboard" in body
        assert isinstance(body["leaderboard"], list)

    def test_quests_wrong_user_returns_403(self, client):
        """Another user's quests should be forbidden."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.get(f"/quests/{fake_id}/daily")
        assert resp.status_code == 403
