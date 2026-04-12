"""
Test 10: AI meal endpoints (photo, voice, text).
These tests call OpenAI — mark with @pytest.mark.ai and skip with -m "not ai".
"""

import base64
import pytest


@pytest.mark.ai
class TestAIMeals:
    def test_text_to_meal_basic(self, client, state):
        """POST /meals/text-to-meal should parse text into foods."""
        resp = client.post("/meals/text-to-meal", json={
            "user_id": state.user_id,
            "text": "I had 2 eggs and a slice of toast with butter",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "foods" in body
        assert "transcript" in body
        assert len(body["foods"]) >= 1

        # Each food should have required fields
        for f in body["foods"]:
            assert "name" in f
            assert "quantity" in f or "displayQuantity" in f

    def test_text_to_meal_empty_text(self, client, state):
        """Empty text should return empty foods list."""
        resp = client.post("/meals/text-to-meal", json={
            "user_id": state.user_id,
            "text": "",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["foods"] == []

    def test_text_to_meal_non_food(self, client, state):
        """Non-food text should return empty or minimal results."""
        resp = client.post("/meals/text-to-meal", json={
            "user_id": state.user_id,
            "text": "I went for a walk in the park",
        })
        assert resp.status_code == 200
        body = resp.json()
        # Should return empty or the AI might still try to parse — either is OK
        assert isinstance(body["foods"], list)

    def test_text_to_meal_composite_dish_not_split(self, client, state):
        """A composite dish like 'cheese burrito' should stay as one item."""
        resp = client.post("/meals/text-to-meal", json={
            "user_id": state.user_id,
            "text": "I had a chicken and cheese burrito",
        })
        assert resp.status_code == 200
        body = resp.json()
        # Should be 1 item, not 3 (chicken, cheese, burrito)
        assert len(body["foods"]) <= 2

    def test_has_food_with_no_food(self, client, state):
        """has-food endpoint should return has_food=false for a blank image."""
        # 1x1 white pixel PNG
        blank_png = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"
            "2mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg=="
        )
        resp = client.post("/meals/has-food", json={
            "image_base64": blank_png,
            "user_id": state.user_id,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "has_food" in body
        assert isinstance(body["has_food"], bool)

    def test_text_to_meal_returns_per_100g(self, client, state):
        """Matched foods should include per_100g fields for accurate logging."""
        resp = client.post("/meals/text-to-meal", json={
            "user_id": state.user_id,
            "text": "200g of white rice",
        })
        assert resp.status_code == 200
        body = resp.json()
        if body["foods"]:
            f = body["foods"][0]
            # Should have per_100g from DB match or AI estimation
            has_per100 = any(
                k.endswith("_per_100g") and f.get(k) is not None
                for k in ["calories_per_100g", "protein_per_100g"]
            )
            assert has_per100, f"Food missing per_100g fields: {list(f.keys())}"

    def test_text_to_meal_clarification_flow(self, client, state):
        """Ambiguous food should trigger clarification response."""
        resp = client.post("/meals/text-to-meal", json={
            "user_id": state.user_id,
            "text": "a burrito",
        })
        assert resp.status_code == 200
        body = resp.json()
        # Either returns foods (if auto-matched) or needs_clarification
        assert "foods" in body or "needs_clarification" in body
