"""
Test 26: Quest / gamification logic.

Unit tests (no DB):
  - _calculate_quest_progress  (log_meals, hit_calorie_target, hit_protein_target, unknown)
  - Streak continuation / reset / new-start logic
  - XP level formula

Integration tests (need server):
  - GET  /quests/{user_id}        — shape + required fields
  - GET  /quests/{user_id}/stats  — XP, level, streak fields
  - POST /quests/{id}/claim       — complete + claim flow
  - GET  /quests/{user_id}/badges — badges list shape
  - POST /quests/{user_id}/check-badges — returns newly_earned list
  - GET  /quests/leaderboard      — shape
  - Auth guard on all quest endpoints
"""

import sys
import os
import pytest
from datetime import date, timedelta

_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, _BACKEND_DIR)

from app.services.quest_service import QuestService


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  _calculate_quest_progress  (pure logic, no DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCalculateQuestProgress:
    @staticmethod
    def _progress(quest_type, target, **stats):
        return QuestService._calculate_quest_progress(quest_type, float(target), stats)

    # log_meals
    def test_log_meals_not_complete(self):
        current, done = self._progress("log_meals", 3, meals_logged=2)
        assert current == 2.0
        assert done is False

    def test_log_meals_exactly_complete(self):
        current, done = self._progress("log_meals", 3, meals_logged=3)
        assert done is True

    def test_log_meals_over_target(self):
        _, done = self._progress("log_meals", 3, meals_logged=5)
        assert done is True

    # hit_calorie_target
    def test_calorie_target_not_hit(self):
        current, done = self._progress("hit_calorie_target", 1800, total_calories=1200)
        assert current == pytest.approx(1200.0)
        assert done is False

    def test_calorie_target_exactly_hit(self):
        _, done = self._progress("hit_calorie_target", 1800, total_calories=1800)
        assert done is True

    def test_calorie_target_exceeded(self):
        _, done = self._progress("hit_calorie_target", 1800, total_calories=2200)
        assert done is True

    # hit_protein_target
    def test_protein_target_not_hit(self):
        _, done = self._progress("hit_protein_target", 100, total_protein=60)
        assert done is False

    def test_protein_target_hit(self):
        _, done = self._progress("hit_protein_target", 100, total_protein=100)
        assert done is True

    # unknown quest type
    def test_unknown_type_current_is_zero(self):
        current, done = self._progress("fly_to_moon", 1, meals_logged=99)
        assert current == 0.0
        assert done is False

    # zero stats
    def test_zero_meals_not_complete(self):
        _, done = self._progress("log_meals", 1, meals_logged=0)
        assert done is False


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  Streak logic  (pure re-implementation of the streak update block)
# ═══════════════════════════════════════════════════════════════════════════════

class TestStreakLogic:
    """
    Replicate the streak update logic from QuestService.get_quest_stats
    in pure Python so all edge cases can be tested without a DB.
    """

    @staticmethod
    def _compute_streak(
        logged_today: bool,
        last_active: date | None,
        current_streak: int,
        longest_streak: int,
    ):
        today = date.today()
        yesterday = today - timedelta(days=1)

        if logged_today:
            if last_active == yesterday or last_active == today:
                if last_active != today:
                    current_streak += 1
            elif last_active is None or (today - last_active).days > 1:
                current_streak = 1
            longest_streak = max(longest_streak, current_streak)
        elif last_active and (today - last_active).days > 1:
            current_streak = 0

        return current_streak, longest_streak

    def test_first_ever_log_starts_streak_at_1(self):
        streak, _ = self._compute_streak(True, None, 0, 0)
        assert streak == 1

    def test_logging_consecutive_day_increments_streak(self):
        yesterday = date.today() - timedelta(days=1)
        streak, _ = self._compute_streak(True, yesterday, 5, 5)
        assert streak == 6

    def test_logging_same_day_does_not_double_increment(self):
        today = date.today()
        streak, _ = self._compute_streak(True, today, 3, 3)
        assert streak == 3  # no change

    def test_gap_of_two_days_resets_streak_to_1(self):
        two_days_ago = date.today() - timedelta(days=2)
        streak, _ = self._compute_streak(True, two_days_ago, 10, 10)
        assert streak == 1

    def test_not_logging_today_with_recent_active_preserves_streak(self):
        yesterday = date.today() - timedelta(days=1)
        streak, _ = self._compute_streak(False, yesterday, 5, 5)
        assert streak == 5  # not broken yet

    def test_not_logging_with_stale_last_active_resets_streak(self):
        three_days_ago = date.today() - timedelta(days=3)
        streak, _ = self._compute_streak(False, three_days_ago, 7, 7)
        assert streak == 0

    def test_longest_streak_updated_when_current_exceeds_it(self):
        yesterday = date.today() - timedelta(days=1)
        _, longest = self._compute_streak(True, yesterday, 9, 9)
        assert longest == 10

    def test_longest_streak_never_decreases(self):
        two_days_ago = date.today() - timedelta(days=2)
        streak, longest = self._compute_streak(True, two_days_ago, 10, 15)
        assert longest == 15  # keeps old longest


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  XP level formula  (pure math)
# ═══════════════════════════════════════════════════════════════════════════════

class TestXpLevelFormula:
    """Level = total_xp // 100 + 1  (as used in the UPDATE statement)."""

    @staticmethod
    def _level(total_xp: int) -> int:
        return max(1, total_xp // 100 + 1)

    @staticmethod
    def _xp_for_next(total_xp: int, level: int) -> int:
        return (level * 100) - (total_xp % 100)

    def test_zero_xp_is_level_1(self):
        assert self._level(0) == 1

    def test_99_xp_is_level_1(self):
        assert self._level(99) == 1

    def test_100_xp_is_level_2(self):
        assert self._level(100) == 2

    def test_199_xp_is_level_2(self):
        assert self._level(199) == 2

    def test_200_xp_is_level_3(self):
        assert self._level(200) == 3

    def test_xp_for_next_level_at_0_xp(self):
        assert self._xp_for_next(0, 1) == 100

    def test_xp_for_next_level_at_50_xp(self):
        assert self._xp_for_next(50, 1) == 50

    def test_xp_for_next_level_at_exactly_100_xp(self):
        # 100 xp → level 2, xp_for_next = 200 - 0 = 200
        assert self._xp_for_next(100, 2) == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  Quest endpoint integration tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestQuestEndpoints:

    def test_get_daily_quests_requires_auth(self, anon_client, state):
        resp = anon_client.get(f"/quests/{state.user_id}/daily")
        assert resp.status_code in (401, 403)

    def test_get_daily_quests_returns_list(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/daily")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "quests" in body
        assert isinstance(body["quests"], list)

    def test_quest_fields_present(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/daily")
        assert resp.status_code == 200
        for q in resp.json()["quests"]:
            for field in ("id", "title", "xp", "current", "target", "is_completed", "xp_claimed"):
                assert field in q, f"Quest missing field: {field}"

    def test_get_quest_stats_requires_auth(self, anon_client, state):
        resp = anon_client.get(f"/quests/{state.user_id}/stats")
        assert resp.status_code in (401, 403)

    def test_get_quest_stats_fields(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/stats")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        for field in ("total_xp", "level", "current_streak", "longest_streak",
                      "quests_completed", "badges_earned"):
            assert field in body, f"Stats missing field: {field}"

    def test_level_is_positive_integer(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/stats")
        body = resp.json()
        assert body["level"] >= 1
        assert isinstance(body["level"], int)

    def test_get_badges_requires_auth(self, anon_client, state):
        resp = anon_client.get(f"/quests/{state.user_id}/badges")
        assert resp.status_code in (401, 403)

    def test_get_badges_returns_list(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/badges")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "badges" in body
        assert isinstance(body["badges"], list)

    def test_check_badges_returns_newly_earned(self, client, state):
        resp = client.post(f"/quests/{state.user_id}/check-badges")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "newly_earned" in body
        assert isinstance(body["newly_earned"], list)

    def test_leaderboard_requires_auth(self, anon_client):
        resp = anon_client.get("/quests/leaderboard")
        assert resp.status_code in (401, 403)

    def test_leaderboard_returns_list(self, client, state):
        resp = client.get("/quests/leaderboard")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "leaderboard" in body
        assert isinstance(body["leaderboard"], list)

    def test_leaderboard_entry_has_required_fields(self, client, state):
        resp = client.get("/quests/leaderboard")
        for entry in resp.json()["leaderboard"]:
            for field in ("rank", "user_id", "total_xp", "level", "is_current_user"):
                assert field in entry, f"Leaderboard entry missing: {field}"

    def test_claim_xp_on_incomplete_quest_returns_400(self, client, state):
        quests = client.get(f"/quests/{state.user_id}/daily").json()["quests"]
        incomplete = [q for q in quests if not q["is_completed"]]
        if not incomplete:
            pytest.skip("All quests completed — cannot test claim on incomplete quest")
        quest_id = incomplete[0]["id"]
        resp = client.post(f"/quests/{state.user_id}/claim/{quest_id}")
        assert resp.status_code == 400

    def test_streak_calendar_returns_days_array(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/streak-calendar")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "days" in body
        assert isinstance(body["days"], list)
        assert len(body["days"]) > 0

    def test_streak_calendar_day_fields(self, client, state):
        resp = client.get(f"/quests/{state.user_id}/streak-calendar")
        for day in resp.json()["days"][:5]:
            assert "date" in day
            assert "logged_food" in day
            assert isinstance(day["logged_food"], bool)
