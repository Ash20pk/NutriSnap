"""
Test 02: Authentication and authorization.
Verifies JWT validation, 401 on missing/invalid tokens, 403 on wrong user.
"""

import pytest


class TestAuth:
    def test_unauthenticated_request_returns_401(self, anon_client):
        """Requests without JWT should get 401."""
        resp = anon_client.get("/user/me")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, anon_client):
        """Requests with a garbage token should get 401."""
        resp = anon_client.get(
            "/user/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, anon_client):
        """Requests with a malformed JWT should get 401."""
        # A valid-looking but expired JWT
        expired = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ."
            "dummysignature"
        )
        resp = anon_client.get(
            "/user/me",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401

    def test_authenticated_request_succeeds(self, client, test_user):
        """Requests with a valid JWT should not get 401."""
        resp = client.get("/user/me")
        # 404 = user not yet onboarded (valid auth, no profile) — that's fine
        assert resp.status_code in (200, 404)

    def test_admin_endpoint_without_key_returns_403(self, anon_client):
        """Accessing admin endpoint without key should return 403."""
        resp = anon_client.get("/admin/label-reviews")
        assert resp.status_code == 403

    def test_admin_endpoint_with_wrong_key_returns_403(self, anon_client):
        """Wrong admin key should return 403."""
        resp = anon_client.get("/admin/label-reviews", headers={"X-Admin-Key": "wrong"})
        assert resp.status_code == 403
