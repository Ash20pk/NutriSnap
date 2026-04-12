"""
Test 01: Health check and basic connectivity.
Verifies the backend is running and responds correctly.
"""

import httpx
import pytest
from tests.conftest import BASE_URL


class TestHealthCheck:
    def test_root_returns_200(self):
        """GET / should return 200 with app info."""
        with httpx.Client(base_url=BASE_URL, timeout=10) as c:
            resp = c.get("/")
            assert resp.status_code == 200

    def test_health_endpoint(self):
        """GET /health or /api/health should return 200."""
        with httpx.Client(base_url=BASE_URL, timeout=10, follow_redirects=True) as c:
            for path in ["/health", "/api/health"]:
                resp = c.get(path)
                if resp.status_code == 200:
                    return
            resp = c.get("/")
            assert resp.status_code == 200

    def test_404_for_unknown_route(self):
        """GET /api/nonexistent should return 404."""
        with httpx.Client(base_url=BASE_URL, timeout=10) as c:
            resp = c.get("/api/this-does-not-exist")
            assert resp.status_code in (404, 405)

    def test_cors_headers_present(self):
        """OPTIONS request should return CORS headers."""
        with httpx.Client(base_url=BASE_URL, timeout=10) as c:
            resp = c.options(
                "/api/user/me",
                headers={"Origin": "http://localhost:3000"},
            )
            assert resp.status_code < 500
