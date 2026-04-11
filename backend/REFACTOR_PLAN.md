# NutriSnap Backend Refactor Plan

## Goal
Transform the monolithic `server.py` into a production-ready, modular backend without breaking any existing functionality.

## Status: Phase 1 Complete ✅

### ✅ Completed
- [x] Created production app structure (`app/` directory)
- [x] Added configuration management (`app/core/config.py`)
- [x] Added structured logging (`app/core/logging_config.py`)
- [x] Created production entrypoint (`app/main.py`)
- [x] Added `/health` endpoint for monitoring
- [x] Created VM deployment files:
  - [x] `gunicorn_conf.py` - Production WSGI server config
  - [x] `deploy/nutrisnap.service` - Systemd service file
  - [x] `deploy/nginx.conf` - Nginx reverse proxy config
  - [x] `deploy/deploy.sh` - Automated deployment script
  - [x] `deploy/DEPLOYMENT.md` - Complete deployment guide
- [x] Added `.env.example` for configuration template
- [x] Updated `requirements.txt` with gunicorn

## Current State

### What Works Right Now
The existing `server.py` continues to work exactly as before. The new `app/main.py` **wraps** it without changing behavior:

```python
# app/main.py imports and mounts the existing server.py
from server import app as legacy_app, api_router
app.include_router(api_router, prefix="/api")
```

This means:
- ✅ All existing endpoints work unchanged
- ✅ All existing auth logic works
- ✅ All existing DB queries work
- ✅ Frontend doesn't need any changes
- ✅ Can deploy immediately with new production setup

### How to Run

**Development (current method still works):**
```bash
cd backend
uvicorn server:app --reload
```

**Development (new production-ready method):**
```bash
cd backend
uvicorn app.main:app --reload
```

**Production (VM deployment):**
```bash
cd backend
gunicorn app.main:app -c gunicorn_conf.py
```

## Next Steps (Incremental Refactor)

### Phase 2: Extract Pure Helpers (No Breaking Changes)
Move standalone utility functions that don't touch DB or external services:

1. **Move to `app/utils/nutrition.py`:**
   - `calculate_calorie_target()` ✅ Already updated with protein-by-bodyweight
   - `_calculate_age_from_dob()`
   - `_normalize_base64_image()`
   - `_extract_json_from_text()`

2. **Move to `app/utils/micronutrients.py`:**
   - Move `nutrition_targets.py` into app structure
   - `_create_empty_micros()`
   - `_accumulate_micros()`
   - `_compute_meal_micros()`

3. **Move to `app/utils/units.py`:**
   - `_convert_unit()`

### Phase 3: Extract DB Layer
Create `app/db/pool.py` and `app/db/queries.py`:

1. **Pool management:**
   - Move `pg_pool` initialization
   - Add graceful shutdown
   - Add connection health checks

2. **Query helpers:**
   - `_uuid()` helper
   - `_meal_from_record()`
   - `_profile_from_record()`
   - Common query patterns

### Phase 4: Extract Services
Create business logic services:

1. **`app/services/profile_service.py`:**
   - User profile CRUD
   - Goals updates
   - Weight tracking

2. **`app/services/meal_service.py`:**
   - Meal logging
   - Meal history
   - Food analysis

3. **`app/services/analytics_service.py`:**
   - Analytics computation
   - AI analysis
   - Caching logic

4. **`app/services/food_service.py`:**
   - Food database operations
   - USDA sync
   - Barcode lookup

### Phase 5: Extract Routes
Move endpoints to `app/api/routes/`:

1. **`health.py`** - Already done in `app/main.py`
2. **`users.py`** - User/profile endpoints
3. **`meals.py`** - Meal logging endpoints
4. **`analytics.py`** - Analytics endpoints
5. **`admin.py`** - Admin/sync endpoints
6. **`foods.py`** - Food database endpoints

### Phase 6: Add Tests
Add regression tests to ensure refactor doesn't break anything:

1. **Integration tests:**
   - Test critical endpoints with real DB
   - Snapshot test JSON responses

2. **Unit tests:**
   - Test pure helpers
   - Test services in isolation

### Phase 7: Final Cleanup
Once all code is extracted:

1. Mark `server.py` as deprecated
2. Update all imports to use new structure
3. Remove `server.py` (or keep as legacy fallback)

## Non-Breaking Guarantees

Throughout this refactor, we maintain:

- ✅ **Same API surface** - All routes, methods, params unchanged
- ✅ **Same auth** - Supabase JWT verification unchanged
- ✅ **Same DB schema** - No migrations required
- ✅ **Same env vars** - All existing config works
- ✅ **Same behavior** - Identical responses and side effects

## Testing Strategy

Before each phase:
1. Run existing endpoints manually
2. Compare responses before/after
3. Check logs for errors
4. Verify DB state unchanged

## Deployment Strategy

The refactor is designed to be deployed incrementally:

1. **Now:** Deploy with new production setup (systemd, nginx, gunicorn)
2. **Phase 2-5:** Deploy each extraction as it's completed
3. **Phase 6:** Add tests and run in CI
4. **Phase 7:** Final cleanup and remove legacy code

## VM Deployment Quick Start

```bash
# On your VM
cd /opt/nutrisnap/backend
sudo ./deploy/deploy.sh --initial

# Configure environment
sudo nano /opt/nutrisnap/backend/.env

# Restart service
sudo systemctl restart nutrisnap

# Check health
curl http://localhost/health
```

See `deploy/DEPLOYMENT.md` for complete instructions.

## Current File Structure

```
backend/
├── app/                          # NEW: Production app structure
│   ├── __init__.py
│   ├── main.py                   # NEW: Production entrypoint
│   ├── core/
│   │   ├── config.py             # NEW: Environment config
│   │   └── logging_config.py     # NEW: Structured logging
│   ├── api/
│   │   └── routes/               # FUTURE: Extracted routes
│   ├── services/                 # FUTURE: Business logic
│   ├── db/                       # FUTURE: Database layer
│   ├── schemas/                  # FUTURE: Pydantic models
│   └── utils/                    # FUTURE: Pure helpers
├── deploy/                       # NEW: Deployment files
│   ├── nutrisnap.service         # Systemd service
│   ├── nginx.conf                # Nginx config
│   ├── deploy.sh                 # Deployment script
│   └── DEPLOYMENT.md             # Deployment guide
├── server.py                     # EXISTING: Current monolith (still works)
├── analytics_ai.py               # EXISTING: AI analytics (updated)
├── nutrition_targets.py          # EXISTING: RDA/AI/UL tables (new)
├── gunicorn_conf.py              # NEW: Gunicorn config
├── requirements.txt              # UPDATED: Added gunicorn
├── .env.example                  # NEW: Config template
└── REFACTOR_PLAN.md              # This file
```

## Notes

- This refactor is **additive** - we're not removing anything yet
- The old way of running (`uvicorn server:app`) still works
- The new way (`gunicorn app.main:app`) is production-ready
- All existing functionality is preserved
- Frontend requires zero changes
