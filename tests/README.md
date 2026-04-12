# NutriSnap End-to-End Test Suite

## Structure

```
tests/
├── README.md                 # This file
├── conftest.py               # Shared fixtures (auth, DB, test user)
├── backend/                  # Backend API E2E tests (pytest + httpx)
│   ├── test_01_health.py
│   ├── test_02_auth.py
│   ├── test_03_onboarding.py
│   ├── test_04_profile.py
│   ├── test_05_food_search.py
│   ├── test_06_meal_log.py
│   ├── test_07_meal_history.py
│   ├── test_08_nutrition_calc.py
│   ├── test_09_daily_stats.py
│   ├── test_10_ai_meals.py
│   ├── test_11_barcode.py
│   ├── test_12_chef.py
│   ├── test_13_recipes.py
│   ├── test_14_quests.py
│   ├── test_15_social.py
│   ├── test_16_analytics.py
│   ├── test_17_admin.py
│   ├── test_18_middleware.py
│   └── test_19_edge_cases.py
├── frontend/                 # Frontend E2E tests (Maestro)
│   ├── flows/
│   │   ├── 01_intro_screen.yaml
│   │   ├── 02_auth_flow.yaml
│   │   ├── 03_onboarding.yaml
│   │   ├── 04_home_tab.yaml
│   │   ├── 05_log_tab.yaml
│   │   ├── 06_voice_log.yaml
│   │   ├── 07_photo_log.yaml
│   │   ├── 08_text_log.yaml
│   │   ├── 09_barcode_scan.yaml
│   │   ├── 10_analytics_tab.yaml
│   │   ├── 11_chef_tab.yaml
│   │   ├── 12_quest_tab.yaml
│   │   ├── 13_profile_tab.yaml
│   │   ├── 14_social_flow.yaml
│   │   └── 15_weight_check.yaml
│   └── config.yaml
└── requirements-test.txt
```

## Running Backend Tests (with uv — recommended)

```bash
cd /path/to/NutriSnap

# Install uv if you haven't (macOS/Linux)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Option 1: Install test deps from backend/pyproject.toml (recommended)
cd backend && uv pip install -e ".[test]" && cd ..

# Option 2: Use uv run for one-off test runs (no install needed)
uv run --with pytest --with httpx --with pytest-asyncio --with supabase --with python-dotenv \
  pytest tests/backend/ -v --tb=short

# Option 3: Use the convenience script
./tests/run.sh
```

### Legacy pip method

```bash
pip install -r tests/requirements-test.txt
pytest tests/backend/ -v --tb=short
```

### Running tests against your deployed backend

```bash
export TEST_BASE_URL=http://168.144.77.40
export TEST_SUPABASE_URL=https://your-project.supabase.co
export TEST_SUPABASE_KEY=your-service-role-key
export TEST_ADMIN_API_KEY=your-admin-key

# All tests (skip AI tests to avoid OpenAI costs)
uv run pytest tests/backend/ -v -m "not ai" --tb=short

# Specific test file
uv run pytest tests/backend/test_06_meal_log.py -v

# Fast smoke test only
uv run pytest tests/backend/test_01_health.py -v
```

### Environment variables for backend tests

| Variable | Required | Description |
|---|---|---|
| `TEST_BASE_URL` | Yes | Backend URL (e.g. `http://localhost:8000`) |
| `TEST_SUPABASE_URL` | Yes | Supabase project URL |
| `TEST_SUPABASE_KEY` | Yes | Supabase service role key (for test user creation) |
| `TEST_ADMIN_API_KEY` | Yes | Admin API key for admin endpoint tests |
| `TEST_USER_EMAIL` | No | Test user email (default: `e2e-test@nutrisnap.local`) |
| `TEST_USER_PASSWORD` | No | Test user password (default: auto-generated) |

## Running Frontend Tests (Maestro)

```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run all flows
maestro test tests/frontend/flows/

# Run a single flow
maestro test tests/frontend/flows/04_home_tab.yaml
```

Maestro tests require:
- iOS Simulator or Android Emulator running
- Expo dev build installed on the device
- Backend running and reachable from the device
