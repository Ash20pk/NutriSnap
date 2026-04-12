"""
Test 12: Chef (recipe generation) endpoint.
"""

import pytest


@pytest.mark.ai
class TestChef:
    def test_generate_recipe(self, client, state):
        """POST /chef/generate should return a recipe."""
        resp = client.post("/chef/generate", json={
            "user_id": state.user_id,
            "ingredients": ["chicken", "rice", "broccoli"],
            "goals": ["high_protein"],
            "cuisine": "asian",
            "dietary_preference": "none",
            "target_meal": "lunch",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "name" in body or "recipe" in body

    def test_generate_empty_ingredients(self, client, state):
        """Empty ingredients list should still return something or a clear error."""
        resp = client.post("/chef/generate", json={
            "user_id": state.user_id,
            "ingredients": [],
            "goals": [],
        })
        assert resp.status_code in (200, 400, 422)

    def test_generate_wrong_user_returns_403(self, client):
        """Another user's request should be forbidden."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.post("/chef/generate", json={
            "user_id": fake_id,
            "ingredients": ["chicken"],
            "goals": [],
        })
        assert resp.status_code == 403
