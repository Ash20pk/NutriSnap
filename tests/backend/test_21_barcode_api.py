"""
Test 21: Barcode API — response shape, caching logic, and custom food creation.

These are pure-logic unit tests (no DB, no OpenAI) that verify:
  - Barcode endpoint response envelope shape
  - OpenFood Facts completeness check before caching
  - Custom food endpoint payload validation
  - /foods/custom and /foods/custom/me happy paths (integration, needs server)
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  OFF completeness gate  (unit — no DB, no OpenAI)
# ═══════════════════════════════════════════════════════════════════════════════

class TestOFFCompletenessGate:
    """
    Replicate the completeness check from foods.py:get_food_by_barcode.
    A result is 'complete' if at least one macro > 0 AND ingredients is truthy.
    """

    @staticmethod
    def _is_complete(result: dict) -> bool:
        calories = result.get("calories_per_100g") or 0
        protein  = result.get("protein_per_100g")  or 0
        carbs    = result.get("carbs_per_100g")    or 0
        fat      = result.get("fat_per_100g")      or 0
        has_nutrition   = any(v > 0 for v in [calories, protein, carbs, fat])
        has_ingredients = bool(result.get("ingredients"))
        return has_nutrition and has_ingredients

    def test_complete_result_passes(self):
        result = {
            "name": "Creatine Monohydrate",
            "calories_per_100g": 0.0,
            "protein_per_100g": 88.0,
            "carbs_per_100g": 0.0,
            "fat_per_100g": 0.0,
            "ingredients": "100% Creatine Monohydrate",
            "source": "openfoodfacts",
        }
        assert self._is_complete(result) is True

    def test_missing_ingredients_is_incomplete(self):
        result = {
            "name": "Mystery Protein Bar",
            "calories_per_100g": 400.0,
            "protein_per_100g": 30.0,
            "carbs_per_100g": 40.0,
            "fat_per_100g": 10.0,
            "ingredients": None,
            "source": "openfoodfacts",
        }
        assert self._is_complete(result) is False

    def test_all_zero_macros_is_incomplete(self):
        result = {
            "name": "Unknown Food",
            "calories_per_100g": 0.0,
            "protein_per_100g": 0.0,
            "carbs_per_100g": 0.0,
            "fat_per_100g": 0.0,
            "ingredients": "Water, sugar",
            "source": "openfoodfacts",
        }
        assert self._is_complete(result) is False

    def test_empty_ingredients_string_is_incomplete(self):
        result = {
            "name": "Empty Label",
            "calories_per_100g": 200.0,
            "protein_per_100g": 10.0,
            "carbs_per_100g": 30.0,
            "fat_per_100g": 5.0,
            "ingredients": "",
            "source": "openfoodfacts",
        }
        assert self._is_complete(result) is False

    def test_single_nonzero_macro_is_enough(self):
        """Only calories > 0 with ingredients is sufficient."""
        result = {
            "name": "Pure Sugar",
            "calories_per_100g": 400.0,
            "protein_per_100g": 0.0,
            "carbs_per_100g": 0.0,
            "fat_per_100g": 0.0,
            "ingredients": "Sugar",
        }
        assert self._is_complete(result) is True

    def test_none_macro_values_treated_as_zero(self):
        """None values (from OFF) must be treated as 0."""
        result = {
            "name": "Partial Data",
            "calories_per_100g": None,
            "protein_per_100g": None,
            "carbs_per_100g": None,
            "fat_per_100g": None,
            "ingredients": "Something",
        }
        assert self._is_complete(result) is False


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  OFF response normalisation  (unit — simulates _fetch_from_openfoodfacts)
# ═══════════════════════════════════════════════════════════════════════════════

class TestOFFNormalisation:
    """
    Replicate the field-mapping logic inside _fetch_from_openfoodfacts
    without making a real HTTP request.
    """

    @staticmethod
    def _normalise_off_product(product: dict) -> dict:
        """Inline replica of the mapping in food_service._fetch_from_openfoodfacts."""
        n = product.get("nutriments", {})

        def _f(key):
            val = n.get(key)
            return float(val) if val is not None else None

        sodium_g = _f("sodium_100g")
        sodium_mg = round(sodium_g * 1000, 2) if sodium_g is not None else None

        name = (product.get("product_name") or "").strip() or None
        if not name:
            return {}

        return {
            "name": name,
            "brand": (product.get("brands") or "").split(",")[0].strip() or None,
            "image_url": product.get("image_front_url") or product.get("image_url"),
            "calories_per_100g": _f("energy-kcal_100g") or _f("energy_kcal_100g") or 0,
            "protein_per_100g": _f("proteins_100g") or 0,
            "carbs_per_100g": _f("carbohydrates_100g") or 0,
            "fat_per_100g": _f("fat_100g") or 0,
            "fiber_g_per_100g": _f("fiber_100g"),
            "sugar_g_per_100g": _f("sugars_100g"),
            "sodium_mg_per_100g": sodium_mg,
            "ingredients": product.get("ingredients_text") or None,
            "source": "openfoodfacts",
        }

    def test_sodium_converted_from_grams_to_mg(self):
        """OFF returns sodium in g/100g; we convert to mg."""
        product = {
            "product_name": "Table Salt",
            "nutriments": {"sodium_100g": 0.388},  # 388 mg as grams
        }
        r = self._normalise_off_product(product)
        assert r["sodium_mg_per_100g"] == pytest.approx(388.0, abs=0.1)

    def test_name_stripped_and_used(self):
        product = {
            "product_name": "  Whole Milk  ",
            "nutriments": {"energy-kcal_100g": 61, "proteins_100g": 3.2},
        }
        r = self._normalise_off_product(product)
        assert r["name"] == "Whole Milk"

    def test_empty_name_returns_empty_dict(self):
        product = {"product_name": "", "nutriments": {}}
        r = self._normalise_off_product(product)
        assert r == {}

    def test_brand_takes_first_comma_separated(self):
        product = {
            "product_name": "Granola",
            "brands": "Quaker, Pepsico",
            "nutriments": {},
        }
        r = self._normalise_off_product(product)
        assert r["brand"] == "Quaker"

    def test_energy_kcal_field_fallback(self):
        """Falls back to energy_kcal_100g if energy-kcal_100g absent."""
        product = {
            "product_name": "Oats",
            "nutriments": {"energy_kcal_100g": 389, "proteins_100g": 13.0},
        }
        r = self._normalise_off_product(product)
        assert r["calories_per_100g"] == pytest.approx(389.0, abs=0.1)

    def test_missing_sodium_stays_none(self):
        product = {
            "product_name": "Unsalted Butter",
            "nutriments": {"fat_100g": 81.0},
        }
        r = self._normalise_off_product(product)
        assert r["sodium_mg_per_100g"] is None

    def test_source_always_openfoodfacts(self):
        product = {
            "product_name": "Any Food",
            "nutriments": {"proteins_100g": 5.0},
        }
        r = self._normalise_off_product(product)
        assert r["source"] == "openfoodfacts"


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  Barcode endpoint integration  (needs live server)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBarcodeEndpoint:
    def test_unknown_barcode_returns_404(self, client):
        resp = client.get("/foods/barcode/0000000000000")
        assert resp.status_code == 404

    def test_response_envelope_shape_on_miss(self, client):
        """404 body should be a JSON detail, not a bare string."""
        resp = client.get("/foods/barcode/0000000000000")
        assert resp.headers["content-type"].startswith("application/json")
        body = resp.json()
        assert "detail" in body

    def test_include_health_check_param_accepted(self, client):
        """Passing include_health_check=false must not crash."""
        resp = client.get(
            "/foods/barcode/0000000000000",
            params={"include_health_check": False},
        )
        assert resp.status_code == 404

    def test_auth_required(self, anon_client):
        """Unauthenticated request should be rejected."""
        resp = anon_client.get("/foods/barcode/0000000000000")
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  Custom food creation  (integration — needs live server + DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCustomFoodCreation:
    VALID_PAYLOAD = {
        "name": "E2E Test Protein Powder",
        "calories_per_100g": 380.0,
        "protein_per_100g": 80.0,
        "carbs_per_100g": 5.0,
        "fat_per_100g": 3.0,
        "category": "custom",
        "fiber_g_per_100g": 0.5,
        "sugar_g_per_100g": 2.0,
        "sodium_mg_per_100g": 150.0,
    }

    def test_create_custom_food_returns_200(self, client, state):
        resp = client.post("/foods/custom", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "id" in body
        assert body["name"] == self.VALID_PAYLOAD["name"]
        state.food_id = body["id"]

    def test_created_food_has_correct_macros(self, client, state):
        resp = client.post("/foods/custom", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["calories_per_100g"] == pytest.approx(380.0, abs=0.1)
        assert body["protein_per_100g"]  == pytest.approx(80.0,  abs=0.1)
        assert body["carbs_per_100g"]    == pytest.approx(5.0,   abs=0.1)
        assert body["fat_per_100g"]      == pytest.approx(3.0,   abs=0.1)

    def test_created_food_appears_in_my_custom_foods(self, client):
        # Create first
        resp = client.post("/foods/custom", json={
            **self.VALID_PAYLOAD,
            "name": "Unique E2E Food 99999",
        })
        assert resp.status_code == 200
        created_id = resp.json()["id"]

        # Fetch list
        resp = client.get("/foods/custom/me")
        assert resp.status_code == 200
        ids = [f["id"] for f in resp.json()["foods"]]
        assert created_id in ids

    def test_create_requires_name(self, client):
        payload = {k: v for k, v in self.VALID_PAYLOAD.items() if k != "name"}
        resp = client.post("/foods/custom", json=payload)
        assert resp.status_code == 422

    def test_create_requires_calories(self, client):
        payload = {k: v for k, v in self.VALID_PAYLOAD.items() if k != "calories_per_100g"}
        resp = client.post("/foods/custom", json=payload)
        assert resp.status_code == 422

    def test_custom_food_source_is_user_custom(self, client, state):
        resp = client.post("/foods/custom", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("source") == "user_custom"

    def test_custom_food_not_verified(self, client):
        resp = client.post("/foods/custom", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert resp.json().get("verified") is False

    def test_get_custom_foods_requires_auth(self, anon_client):
        resp = anon_client.get("/foods/custom/me")
        assert resp.status_code in (401, 403)

    def test_get_custom_foods_returns_list_shape(self, client):
        resp = client.get("/foods/custom/me")
        assert resp.status_code == 200
        body = resp.json()
        assert "foods" in body
        assert "count" in body
        assert isinstance(body["foods"], list)
        assert body["count"] == len(body["foods"])
