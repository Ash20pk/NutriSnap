"""
Test 24: Analytics service cache decision logic (unit — no DB, no AI).

Covers:
  - _days_for_time_range / _ttl_for_time_range
  - _analytics_input_hash  (determinism + sensitivity)
  - _compute_daily_highlights  (totals, macro progress %, nutrient highlights)
  - _parse_analytics_cache_fields  (string JSON, dict passthrough, null fallback)
  - Cache valid/stale/miss decision tree (pure logic)
"""

import sys
import os
import json
import hashlib
import pytest
from datetime import datetime, timedelta, timezone, date

_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, _BACKEND_DIR)

from app.services.analytics_service import AnalyticsService


# ─── helpers ───────────────────────────────────────────────────────────────────

def _make_meal(
    cal: float = 500.0,
    protein: float = 30.0,
    carbs: float = 60.0,
    fat: float = 15.0,
    meal_id: str = "meal-1",
    ts: datetime | None = None,
) -> dict:
    return {
        "id": meal_id,
        "timestamp": ts or datetime.now(timezone.utc),
        "total_calories": cal,
        "total_protein": protein,
        "total_carbs": carbs,
        "total_fat": fat,
        "foods": [],
        "micros": {},
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 1. days_for_time_range
# ═══════════════════════════════════════════════════════════════════════════════

class TestDaysForTimeRange:
    @pytest.mark.parametrize("tr,expected", [
        ("daily",  1),
        ("week",   7),
        ("month",  30),
        ("year",   365),
        ("unknown", 365),  # fallback
    ])
    def test_days(self, tr, expected):
        assert AnalyticsService._days_for_time_range(tr) == expected


# ═══════════════════════════════════════════════════════════════════════════════
# 2. ttl_for_time_range
# ═══════════════════════════════════════════════════════════════════════════════

class TestTtlForTimeRange:
    def test_week_ttl_is_7_days(self):
        delta = AnalyticsService._ttl_for_time_range("week")
        assert delta == timedelta(days=7)

    def test_month_ttl_is_30_days(self):
        assert AnalyticsService._ttl_for_time_range("month") == timedelta(days=30)

    def test_year_ttl_is_365_days(self):
        assert AnalyticsService._ttl_for_time_range("year") == timedelta(days=365)

    def test_daily_ttl_expires_before_next_utc_midnight(self):
        delta = AnalyticsService._ttl_for_time_range("daily")
        now = datetime.now(timezone.utc)
        expires = now + delta
        next_midnight = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        # Should be within 1 second of next midnight
        assert abs((expires - next_midnight).total_seconds()) < 2

    def test_daily_ttl_is_positive(self):
        assert AnalyticsService._ttl_for_time_range("daily").total_seconds() > 0


# ═══════════════════════════════════════════════════════════════════════════════
# 3. _analytics_input_hash
# ═══════════════════════════════════════════════════════════════════════════════

class TestAnalyticsInputHash:
    def test_empty_list_returns_string(self):
        h = AnalyticsService._analytics_input_hash([])
        assert isinstance(h, str)
        assert len(h) == 64  # sha256 hex

    def test_same_meals_same_hash(self):
        meals = [_make_meal(cal=300, meal_id="x")]
        assert AnalyticsService._analytics_input_hash(meals) == \
               AnalyticsService._analytics_input_hash(meals)

    def test_different_calories_different_hash(self):
        m1 = [_make_meal(cal=300)]
        m2 = [_make_meal(cal=301)]
        assert AnalyticsService._analytics_input_hash(m1) != \
               AnalyticsService._analytics_input_hash(m2)

    def test_different_protein_different_hash(self):
        m1 = [_make_meal(protein=30)]
        m2 = [_make_meal(protein=31)]
        assert AnalyticsService._analytics_input_hash(m1) != \
               AnalyticsService._analytics_input_hash(m2)

    def test_order_matters(self):
        m1 = _make_meal(cal=300, meal_id="a")
        m2 = _make_meal(cal=500, meal_id="b")
        assert AnalyticsService._analytics_input_hash([m1, m2]) != \
               AnalyticsService._analytics_input_hash([m2, m1])

    def test_adding_meal_changes_hash(self):
        meals = [_make_meal(meal_id="a")]
        h1 = AnalyticsService._analytics_input_hash(meals)
        meals.append(_make_meal(meal_id="b"))
        h2 = AnalyticsService._analytics_input_hash(meals)
        assert h1 != h2


# ═══════════════════════════════════════════════════════════════════════════════
# 4. _compute_daily_highlights
# ═══════════════════════════════════════════════════════════════════════════════

class TestComputeDailyHighlights:
    """Pure-math method — no DB required."""

    @staticmethod
    def _highlights(meals, micro_targets=None, macro_targets=None, tz_offset=0):
        return AnalyticsService._compute_daily_highlights(
            meals,
            micro_targets or {},
            macro_targets or {},
            tz_offset,
        )

    def test_empty_meals_gives_zero_totals(self):
        h = self._highlights([])
        assert h["totals"]["calories"] == 0.0
        assert h["totals"]["protein"] == 0.0

    def test_today_meals_summed(self):
        now = datetime.now(timezone.utc)
        meals = [
            _make_meal(cal=400, protein=30, ts=now),
            _make_meal(cal=300, protein=20, ts=now),
        ]
        h = self._highlights(meals)
        assert h["totals"]["calories"] == pytest.approx(700.0, abs=0.1)
        assert h["totals"]["protein"] == pytest.approx(50.0, abs=0.1)

    def test_meals_count_correct(self):
        now = datetime.now(timezone.utc)
        meals = [_make_meal(ts=now), _make_meal(ts=now)]
        h = self._highlights(meals)
        assert h["meals_count"] == 2

    def test_old_meals_excluded_from_today(self):
        yesterday = datetime.now(timezone.utc) - timedelta(days=2)
        today = datetime.now(timezone.utc)
        meals = [
            _make_meal(cal=500, ts=yesterday),
            _make_meal(cal=200, ts=today),
        ]
        h = self._highlights(meals)
        assert h["totals"]["calories"] == pytest.approx(200.0, abs=0.1)

    def test_macro_progress_computed_when_targets_set(self):
        now = datetime.now(timezone.utc)
        meal = _make_meal(cal=1000, protein=50, carbs=100, fat=30, ts=now)
        macro_targets = {
            "daily_calorie_target": 2000,
            "protein_target": 100,
            "carbs_target": 200,
            "fat_target": 60,
        }
        h = self._highlights([meal], macro_targets=macro_targets)
        mp = h["macro_progress"]
        assert mp["calories_pct"] == pytest.approx(50.0, abs=0.1)
        assert mp["protein_pct"] == pytest.approx(50.0, abs=0.1)

    def test_macro_progress_is_none_when_no_targets(self):
        now = datetime.now(timezone.utc)
        h = self._highlights([_make_meal(ts=now)])
        assert h["macro_progress"]["calories_pct"] is None

    def test_sugar_highlight_present_when_nonzero(self):
        now = datetime.now(timezone.utc)
        meal = _make_meal(ts=now)
        meal["micros"] = {"sugar_g": 25.0}
        h = self._highlights([meal])
        types = [x["type"] for x in h["highlights"]]
        assert "sugar" in types

    def test_sodium_highlight_present_when_nonzero(self):
        now = datetime.now(timezone.utc)
        meal = _make_meal(ts=now)
        meal["micros"] = {"sodium_mg": 800.0}
        h = self._highlights([meal])
        types = [x["type"] for x in h["highlights"]]
        assert "sodium" in types

    def test_fiber_highlight_present_when_nonzero(self):
        now = datetime.now(timezone.utc)
        meal = _make_meal(ts=now)
        meal["micros"] = {"fiber_g": 8.0}
        h = self._highlights([meal])
        types = [x["type"] for x in h["highlights"]]
        assert "fiber" in types

    def test_no_highlights_when_all_micros_zero(self):
        now = datetime.now(timezone.utc)
        meal = _make_meal(ts=now)
        meal["micros"] = {"sugar_g": 0, "sodium_mg": 0, "fiber_g": 0}
        h = self._highlights([meal])
        assert h["highlights"] == []

    def test_result_has_required_keys(self):
        h = self._highlights([])
        for key in ("date", "meals_count", "totals", "macro_progress", "highlights", "updated_at"):
            assert key in h, f"Missing key: {key}"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. _parse_analytics_cache_fields
# ═══════════════════════════════════════════════════════════════════════════════

class TestParseAnalyticsCacheFields:
    """String JSON from DB → dicts/lists."""

    @staticmethod
    def _parse(overrides: dict) -> dict:
        base = {
            "insights": None,
            "bio_impact": None,
            "health_insights": None,
            "bio_alerts": None,
            "red_flags": None,
        }
        base.update(overrides)
        return AnalyticsService._parse_analytics_cache_fields(base)

    def test_string_json_insights_parsed(self):
        r = self._parse({"insights": '{"summary": "good"}'})
        assert r["insights"] == {"summary": "good"}

    def test_dict_insights_passed_through(self):
        r = self._parse({"insights": {"key": "val"}})
        assert r["insights"] == {"key": "val"}

    def test_null_insights_returns_empty_dict(self):
        r = self._parse({"insights": None})
        assert r["insights"] == {}

    def test_null_bio_alerts_returns_empty_list(self):
        r = self._parse({"bio_alerts": None})
        assert r["bio_alerts"] == []

    def test_string_json_array_bio_alerts(self):
        r = self._parse({"bio_alerts": '["low iron"]'})
        assert r["bio_alerts"] == ["low iron"]

    def test_all_fields_present_in_output(self):
        r = self._parse({})
        for key in ("insights", "bio_impact", "health_insights", "bio_alerts", "red_flags"):
            assert key in r

    def test_invalid_json_string_falls_back_to_empty(self):
        r = self._parse({"insights": "not-valid-json{"})
        assert r["insights"] == {}


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Cache validity decision logic  (pure Python re-implementation)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheValidityLogic:
    """
    Replicate the cache-valid branch in get_analytics_bundle in pure Python
    so we can test all combinations without a DB.
    """

    @staticmethod
    def _is_cache_valid(
        expires_at: datetime,
        meals_analyzed: int,
        current_meal_count: int,
        cached_input_hash: str | None,
        current_input_hash: str,
    ) -> bool:
        cache_not_expired = expires_at > datetime.now(timezone.utc)
        meals_unchanged = current_meal_count <= meals_analyzed
        input_unchanged = bool(cached_input_hash) and cached_input_hash == current_input_hash
        return cache_not_expired and meals_unchanged and input_unchanged

    def test_fresh_cache_matching_meals_is_valid(self):
        h = "abc123"
        assert self._is_cache_valid(
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            meals_analyzed=5,
            current_meal_count=5,
            cached_input_hash=h,
            current_input_hash=h,
        )

    def test_expired_cache_is_invalid(self):
        h = "abc123"
        assert not self._is_cache_valid(
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            meals_analyzed=5,
            current_meal_count=5,
            cached_input_hash=h,
            current_input_hash=h,
        )

    def test_new_meals_added_invalidates_cache(self):
        h = "abc123"
        assert not self._is_cache_valid(
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            meals_analyzed=4,
            current_meal_count=6,  # 2 new meals
            cached_input_hash=h,
            current_input_hash=h,
        )

    def test_input_hash_mismatch_invalidates_cache(self):
        assert not self._is_cache_valid(
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            meals_analyzed=5,
            current_meal_count=5,
            cached_input_hash="old_hash",
            current_input_hash="new_hash",
        )

    def test_no_cached_hash_invalidates_cache(self):
        assert not self._is_cache_valid(
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            meals_analyzed=5,
            current_meal_count=5,
            cached_input_hash=None,
            current_input_hash="some_hash",
        )

    def test_fewer_meals_than_analyzed_is_still_valid(self):
        h = "abc"
        assert self._is_cache_valid(
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            meals_analyzed=10,
            current_meal_count=8,  # meals were deleted — still valid
            cached_input_hash=h,
            current_input_hash=h,
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 7. Integration: analytics endpoint shape (no AI)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAnalyticsEndpointShape:
    def test_get_analytics_requires_auth(self, anon_client, state):
        resp = anon_client.get(f"/analytics/{state.user_id}?time_range=week")
        assert resp.status_code in (401, 403)

    def test_analytics_bundle_requires_auth(self, anon_client, state):
        resp = anon_client.get(f"/analytics/{state.user_id}/bundle")
        assert resp.status_code in (401, 403)

    def test_analytics_bundle_returns_meals_and_analytics(self, client, state):
        resp = client.get(f"/analytics/{state.user_id}/bundle?time_range=week")
        assert resp.status_code == 200
        body = resp.json()
        assert "meals" in body
        assert "analytics" in body
        assert "daily_highlights" in body
        assert isinstance(body["meals"], list)

    def test_daily_highlights_has_required_fields(self, client, state):
        resp = client.get(f"/analytics/{state.user_id}/bundle?time_range=week")
        assert resp.status_code == 200
        dh = resp.json()["daily_highlights"]
        for key in ("date", "meals_count", "totals", "macro_progress", "highlights"):
            assert key in dh, f"daily_highlights missing: {key}"

    def test_analytics_no_meals_returns_empty_structure(self, client, state):
        resp = client.get(f"/analytics/{state.user_id}?time_range=week")
        assert resp.status_code == 200
        body = resp.json()
        assert "insights" in body
        assert "bio_impact" in body
        assert "bio_alerts" in body
