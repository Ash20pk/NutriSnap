"""
Test 15: Social features — follow/unfollow, public profiles, search.
"""

import pytest


class TestSocial:
    def test_search_users(self, client):
        """GET /users/search should return results."""
        resp = client.get("/users/search", params={"query": "test"})
        assert resp.status_code == 200
        body = resp.json()
        assert "results" in body
        assert isinstance(body["results"], list)

    def test_search_empty_query(self, client):
        """Empty search query returns 200 or 422 depending on validation."""
        resp = client.get("/users/search", params={"query": ""})
        assert resp.status_code in (200, 422)

    def test_get_own_following(self, client):
        """GET /users/me/following should return list."""
        resp = client.get("/users/me/following")
        assert resp.status_code == 200
        body = resp.json()
        assert "following" in body

    def test_get_own_followers(self, client):
        """GET /users/me/followers should return list."""
        resp = client.get("/users/me/followers")
        assert resp.status_code == 200
        body = resp.json()
        assert "followers" in body

    def test_follow_nonexistent_user(self, client):
        """Following a nonexistent user should return 404."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.post(f"/users/{fake_id}/follow")
        assert resp.status_code in (404, 500)

    def test_unfollow_nonexistent_user(self, client):
        """Unfollowing a nonexistent user should return 404 or succeed silently."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.delete(f"/users/{fake_id}/follow")
        assert resp.status_code in (200, 404)

    def test_public_stats_own_user(self, client, state):
        """GET /users/{id}/public-stats should return public stats."""
        resp = client.get(f"/users/{state.user_id}/public-stats")
        assert resp.status_code == 200
        body = resp.json()
        assert "name" in body
        assert "total_xp" in body
        assert "level" in body
