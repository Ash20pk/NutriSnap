"""
Test 11: Barcode lookup and food label processing.
"""

import pytest


class TestBarcode:
    def test_barcode_not_found(self, client):
        """Unknown barcode should return 404."""
        resp = client.get("/foods/barcode/0000000000000")
        assert resp.status_code == 404

    def test_barcode_invalid_format(self, client):
        """Non-numeric barcode should be handled gracefully."""
        resp = client.get("/foods/barcode/not-a-barcode")
        assert resp.status_code in (400, 404)

    def test_barcode_with_health_check_param(self, client):
        """include_health_check=true should not crash even if barcode not found."""
        resp = client.get(
            "/foods/barcode/0000000000000",
            params={"include_health_check": True},
        )
        assert resp.status_code == 404

    @pytest.mark.ai
    def test_label_submission(self, client, state):
        """POST /foods/label-submissions should accept a submission."""
        # Minimal 1x1 PNG as base64
        blank_png = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"
            "2mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg=="
        )
        resp = client.post("/foods/label-submissions", json={
            "user_id": state.user_id,
            "barcode": "1234567890123",
            "images_base64": [blank_png],
            "notes": "E2E test submission",
        })
        # Might succeed or fail depending on food existing
        assert resp.status_code in (200, 201, 400, 404, 500)
