"""
Shared fixtures for NutriSnap E2E tests.

Uses synchronous httpx.Client throughout — no async fixtures.
This avoids all event loop scope issues across pytest-asyncio versions.
"""

import os
import uuid
from pathlib import Path
from typing import Generator, Dict, Any

import httpx
import pytest
from dotenv import load_dotenv

# Load tests/.env regardless of where pytest is invoked from
_TESTS_DIR = Path(__file__).parent
load_dotenv(_TESTS_DIR / ".env", override=False)

# ── Configuration ────────────────────────────────────────────────

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")
SUPABASE_URL = os.environ.get("TEST_SUPABASE_URL", os.environ.get("SUPABASE_URL", ""))
SUPABASE_SERVICE_KEY = os.environ.get(
    "TEST_SUPABASE_KEY", os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
)
ADMIN_API_KEY = os.environ.get("TEST_ADMIN_API_KEY", os.environ.get("ADMIN_API_KEY", ""))
TEST_EMAIL = os.environ.get("TEST_USER_EMAIL", "e2e-test@nutrisnap.local")
TEST_PASSWORD = os.environ.get("TEST_USER_PASSWORD", f"TestPass!{uuid.uuid4().hex[:8]}")


# ── Markers ──────────────────────────────────────────────────────

def pytest_configure(config):
    config.addinivalue_line("markers", "ai: tests that call OpenAI (cost money)")
    config.addinivalue_line("markers", "slow: tests that take >5s")


# ── Supabase admin helpers (sync) ────────────────────────────────

def _supabase_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def create_test_user(email: str, password: str) -> Dict[str, Any]:
    with httpx.Client(timeout=15.0) as c:
        resp = c.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            json={"email": email, "password": password, "email_confirm": True},
            headers=_supabase_headers(),
        )
        if resp.status_code == 422:
            # Already exists — look it up
            list_resp = c.get(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                params={"email": email},
                headers=_supabase_headers(),
            )
            users = list_resp.json().get("users", [])
            if users:
                return users[0]
        resp.raise_for_status()
        return resp.json()


def delete_test_user(user_id: str) -> None:
    with httpx.Client(timeout=15.0) as c:
        resp = c.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=_supabase_headers(),
        )
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()


def get_test_token(email: str, password: str) -> str:
    with httpx.Client(timeout=15.0) as c:
        resp = c.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers=_supabase_headers(),
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


# ── Fixtures (all sync, session-scoped) ──────────────────────────

@pytest.fixture(scope="session")
def test_user() -> Generator[Dict[str, Any], None, None]:
    user = create_test_user(TEST_EMAIL, TEST_PASSWORD)
    user["email"] = TEST_EMAIL
    user["password"] = TEST_PASSWORD
    yield user
    delete_test_user(user["id"])


@pytest.fixture(scope="session")
def auth_token(test_user) -> str:
    return get_test_token(test_user["email"], test_user["password"])


@pytest.fixture(scope="session")
def client(auth_token) -> Generator[httpx.Client, None, None]:
    with httpx.Client(
        base_url=f"{BASE_URL}/api",
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
        follow_redirects=True,
    ) as c:
        yield c


@pytest.fixture(scope="session")
def anon_client() -> Generator[httpx.Client, None, None]:
    with httpx.Client(
        base_url=f"{BASE_URL}/api",
        headers={"Content-Type": "application/json"},
        timeout=30.0,
        follow_redirects=True,
    ) as c:
        yield c


@pytest.fixture(scope="session")
def admin_client() -> Generator[httpx.Client, None, None]:
    with httpx.Client(
        base_url=f"{BASE_URL}/api",
        headers={
            "X-Admin-Key": ADMIN_API_KEY,
            "Content-Type": "application/json",
        },
        timeout=30.0,
        follow_redirects=True,
    ) as c:
        yield c


# ── Test data factories ──────────────────────────────────────────

def make_onboarding_data(**overrides) -> Dict[str, Any]:
    data = {
        "name": "E2E Test User",
        "date_of_birth": "1995-06-15",
        "gender": "male",
        "height": 175.0,
        "weight": 72.0,
        "goal": "maintain",
        "activity_level": "moderate",
        "dietary_preference": "none",
    }
    data.update(overrides)
    return data


def make_meal_log_data(user_id: str, **overrides) -> Dict[str, Any]:
    data = {
        "user_id": user_id,
        "meal_type": "lunch",
        "foods": [
            {
                "food_id": None,
                "name": "Grilled Chicken Breast",
                "calories": 247.5,
                "protein": 46.5,
                "carbs": 0.0,
                "fat": 5.4,
                "calories_per_100g": 165.0,
                "protein_per_100g": 31.0,
                "carbs_per_100g": 0.0,
                "fat_per_100g": 3.6,
                "quantity": 150.0,
                "displayQuantity": 150.0,
                "displayUnit": "g",
            },
            {
                "food_id": None,
                "name": "Brown Rice",
                "calories": 246.0,
                "protein": 5.4,
                "carbs": 51.2,
                "fat": 2.0,
                "calories_per_100g": 123.0,
                "protein_per_100g": 2.7,
                "carbs_per_100g": 25.6,
                "fat_per_100g": 1.0,
                "quantity": 200.0,
                "displayQuantity": 200.0,
                "displayUnit": "g",
            },
        ],
        "logging_method": "manual",
        "notes": "E2E test meal",
    }
    data.update(overrides)
    return data


# ── Shared session state ─────────────────────────────────────────

class SessionState:
    user_id: str = ""
    meal_id: str = ""
    recipe_id: str = ""
    food_id: str = ""
    calorie_target: float = 0.0
    protein_target: float = 0.0
    carbs_target: float = 0.0
    fat_target: float = 0.0


@pytest.fixture(scope="session")
def state() -> SessionState:
    return SessionState()
