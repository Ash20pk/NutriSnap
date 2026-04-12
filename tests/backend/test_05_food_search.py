"""
Test 05: Food search and lookup.
Verifies food search, categories, barcode lookup, and health checks.
"""

import pytest


class TestFoodSearch:
    def test_search_foods_returns_list(self, client):
        """GET /foods/search should return a list of foods."""
        resp = client.get("/foods/search", params={"query": "chicken"})
        assert resp.status_code == 200
        body = resp.json()
        assert "foods" in body
        assert isinstance(body["foods"], list)

    def test_search_empty_query_returns_results(self, client):
        """Empty search should return some foods."""
        resp = client.get("/foods/search", params={"query": ""})
        assert resp.status_code == 200
        body = resp.json()
        assert "foods" in body

    def test_search_vegetarian_filter(self, client):
        """Vegetarian filter should work."""
        resp = client.get("/foods/search", params={
            "query": "rice",
            "vegetarian_only": True,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "foods" in body

    def test_food_has_required_fields(self, client, state):
        """Each food should have core nutrition fields."""
        resp = client.get("/foods/search", params={"query": "rice"})
        assert resp.status_code == 200
        foods = resp.json()["foods"]
        if foods:
            food = foods[0]
            state.food_id = food.get("id", "")
            for field in ["name", "calories_per_100g", "protein_per_100g",
                          "carbs_per_100g", "fat_per_100g"]:
                assert field in food, f"Missing field: {field}"
            assert food["calories_per_100g"] >= 0

    def test_get_categories(self, client):
        """GET /foods/categories should return a list."""
        resp = client.get("/foods/categories")
        assert resp.status_code == 200
        body = resp.json()
        assert "categories" in body
        assert isinstance(body["categories"], list)

    def test_barcode_not_found(self, client):
        """Nonexistent barcode should return 404."""
        resp = client.get("/foods/barcode/0000000000000")
        assert resp.status_code == 404

    def test_search_with_special_characters(self, client):
        """Search with special chars should not crash."""
        resp = client.get("/foods/search", params={"query": "rice's & beans <>"})
        assert resp.status_code == 200

    def test_search_unicode(self, client):
        """Search with Unicode should not crash."""
        resp = client.get("/foods/search", params={"query": "пицца"})
        assert resp.status_code == 200
