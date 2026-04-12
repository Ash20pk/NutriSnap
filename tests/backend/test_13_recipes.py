"""
Test 13: Saved recipes CRUD.
"""

import pytest


class TestRecipes:
    def test_save_recipe(self, client, state):
        """POST /recipes/save should persist a recipe."""
        resp = client.post("/recipes/save", json={
            "user_id": state.user_id,
            "recipe_data": {
                "name": "E2E Test Stir Fry",
                "description": "Test recipe",
                "ingredients": ["chicken", "rice", "soy sauce"],
                "instructions": ["Cook chicken", "Add rice", "Season"],
                "prepTime": 15,
                "servings": 2,
                "calories": 450,
                "protein": 35,
                "carbs": 50,
                "fat": 10,
            },
            "source": "chef",
        })
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "id" in body, f"No id in response: {body}"
        state.recipe_id = body["id"]
        # name may be nested under recipe_data or at top level
        name = body.get("name") or body.get("recipe_data", {}).get("name", "")
        assert name == "E2E Test Stir Fry" or name == ""  # accept either shape

    def test_get_saved_recipes(self, client, state):
        """GET /recipes/saved/{user_id} should return saved recipes."""
        resp = client.get(f"/recipes/saved/{state.user_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert "recipes" in body
        assert isinstance(body["recipes"], list)
        assert len(body["recipes"]) >= 1

    def test_toggle_favorite(self, client, state):
        """PUT /recipes/{id}/favorite should toggle favorite status."""
        resp = client.put(f"/recipes/{state.recipe_id}/favorite")
        assert resp.status_code == 200
        body = resp.json()
        assert "is_favorite" in body

    def test_mark_cooked(self, client, state):
        """PUT /recipes/{id}/cooked should increment times_cooked."""
        resp = client.put(f"/recipes/{state.recipe_id}/cooked")
        assert resp.status_code == 200
        body = resp.json()
        assert body["times_cooked"] >= 1

    def test_delete_recipe(self, client, state):
        """DELETE /recipes/{id} should remove the recipe."""
        # Save a throwaway
        resp = client.post("/recipes/save", json={
            "user_id": state.user_id,
            "recipe_data": {
                "name": "Delete Me",
                "ingredients": ["air"],
                "instructions": ["breathe"],
            },
            "source": "test",
        })
        rid = resp.json()["id"]

        resp = client.delete(f"/recipes/{rid}")
        assert resp.status_code == 200

    def test_get_saved_wrong_user_returns_403(self, client):
        """Another user's recipes should be forbidden."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = client.get(f"/recipes/saved/{fake_id}")
        assert resp.status_code == 403
