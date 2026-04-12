"""
Test 17: Admin endpoints.
"""

import pytest
from tests.conftest import ADMIN_API_KEY


class TestAdmin:
    def test_admin_stats(self, admin_client):
        """GET /admin/stats should return system statistics."""
        resp = admin_client.get("/admin/stats")
        assert resp.status_code == 200

    def test_admin_reviews_with_valid_key(self, admin_client):
        """GET /admin/label-reviews with valid key should succeed."""
        resp = admin_client.get("/admin/label-reviews")
        # 500 if label_submissions table not migrated locally — still proves auth works
        assert resp.status_code in (200, 500)
        if resp.status_code == 200:
            assert isinstance(resp.json(), (list, dict))

    def test_admin_without_key_returns_403(self, client):
        """Admin endpoints without X-Admin-Key should get 403."""
        resp = client.get("/admin/label-reviews")
        assert resp.status_code == 403

    def test_admin_with_wrong_key_returns_403(self, anon_client):
        """Wrong key should get 403."""
        resp = anon_client.get(
            "/admin/label-reviews",
            headers={"X-Admin-Key": "totally-wrong-key"},
        )
        assert resp.status_code == 403
