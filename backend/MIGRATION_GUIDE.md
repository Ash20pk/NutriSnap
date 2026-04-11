# Migration Guide: From Monolithic server.py to Modular Structure

## Current State

Your backend has been upgraded with:
- ✅ Modern Python project management (`pyproject.toml`)
- ✅ Production-ready deployment setup
- ✅ Proper package structure (`app/` directory)
- ✅ Health monitoring and logging

**The monolithic `server.py` (6400+ lines) still works** - nothing is broken.

## Why Refactor?

### Problems with Current Structure
1. **Single 6400+ line file** - Hard to navigate and maintain
2. **Mixed concerns** - Routes, business logic, DB queries, helpers all together
3. **No project management** - Was missing `pyproject.toml`, proper packaging
4. **Hard to test** - Can't test components in isolation
5. **Team collaboration** - Merge conflicts, unclear ownership

### Benefits of New Structure
1. **Modular** - Each file has single responsibility
2. **Testable** - Can test services/utils independently
3. **Maintainable** - Easy to find and modify code
4. **Scalable** - Can add features without growing monolith
5. **Professional** - Standard Python package structure

## Installation (New Way)

```bash
# Install as editable package with dev tools
pip install -e ".[dev]"

# Or just install dependencies
pip install -r requirements.txt
```

Now you can:
```bash
# Run via package entry point
nutrisnap-server

# Or traditional way
uvicorn app.main:app --reload

# Use Makefile shortcuts
make install-dev
make run
make test
make format
```

## Running the Application

### Both Methods Work

**Old way (still works):**
```bash
uvicorn server:app --reload
```

**New way (recommended):**
```bash
uvicorn app.main:app --reload
# or
make run
# or
nutrisnap-server
```

**Production:**
```bash
gunicorn app.main:app -c gunicorn_conf.py
# or
sudo systemctl start nutrisnap
```

## Migration Path (Gradual)

You don't need to migrate everything at once. The refactor is designed to be incremental:

### Phase 1: ✅ DONE - Infrastructure
- [x] Add `pyproject.toml`
- [x] Create `app/` package structure
- [x] Add production deployment files
- [x] Add health endpoint
- [x] Everything still works

### Phase 2: Extract Utilities (Next)
Move pure helper functions to `app/utils/`:

```python
# app/utils/nutrition.py
from nutrition_targets import compute_micronutrient_targets

def calculate_calorie_target(...):
    # Moved from server.py
    pass

# app/utils/micronutrients.py
def _create_empty_micros():
    # Moved from server.py
    pass

def _compute_meal_micros(...):
    # Moved from server.py
    pass
```

Then update `server.py` to import from new location:
```python
from app.utils.nutrition import calculate_calorie_target
from app.utils.micronutrients import _compute_meal_micros
```

### Phase 3: Extract Database Layer
Move DB operations to `app/db/`:

```python
# app/db/pool.py
import asyncpg
from app.core.config import settings

pg_pool: asyncpg.Pool | None = None

async def init_pool():
    global pg_pool
    pg_pool = await asyncpg.create_pool(settings.DATABASE_URL)

async def close_pool():
    if pg_pool:
        await pg_pool.close()

# app/db/queries.py
def _uuid(id_str: str) -> uuid.UUID:
    # Moved from server.py
    pass

def _meal_from_record(record) -> dict:
    # Moved from server.py
    pass
```

### Phase 4: Extract Services
Move business logic to `app/services/`:

```python
# app/services/analytics_service.py
class AnalyticsService:
    async def get_analytics(self, user_id: str, time_range: str):
        # Moved from server.py
        pass
    
    async def refresh_analytics(self, user_id: str, time_range: str):
        # Moved from server.py
        pass

# app/services/meal_service.py
class MealService:
    async def log_meal(self, meal_data: MealLogCreate):
        # Moved from server.py
        pass
```

### Phase 5: Extract Routes
Move endpoints to `app/api/routes/`:

```python
# app/api/routes/analytics.py
from fastapi import APIRouter
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/{user_id}")
async def get_analytics(user_id: str, ...):
    service = AnalyticsService()
    return await service.get_analytics(user_id, ...)

# app/api/routes/meals.py
router = APIRouter(prefix="/meals", tags=["meals"])

@router.post("/log")
async def log_meal(meal_data: MealLogCreate, ...):
    # Moved from server.py
    pass
```

Then in `app/main.py`:
```python
from app.api.routes import analytics, meals, users

app.include_router(analytics.router, prefix="/api")
app.include_router(meals.router, prefix="/api")
app.include_router(users.router, prefix="/api")
```

### Phase 6: Deprecate server.py
Once all code is extracted:
1. Mark `server.py` as deprecated
2. Keep it for a release cycle as fallback
3. Eventually delete it

## Testing Strategy

Before each extraction:
```bash
# 1. Run existing endpoints
curl http://localhost:8000/health
curl http://localhost:8000/api/user/me

# 2. Check logs for errors
tail -f logs/app.log

# 3. Run tests (once added)
make test
```

## Rollback Plan

If something breaks:
```bash
# Revert to old way
uvicorn server:app --reload

# Or rollback git commit
git revert <commit-hash>
```

## Key Files

### New Structure
```
backend/
├── pyproject.toml          # NEW: Project config
├── Makefile                # NEW: Dev shortcuts
├── README.md               # NEW: Documentation
├── app/                    # NEW: Main package
│   ├── main.py            # NEW: Production entrypoint
│   ├── core/              # NEW: Config & logging
│   ├── api/routes/        # FUTURE: Extracted routes
│   ├── services/          # FUTURE: Business logic
│   ├── db/                # FUTURE: Database layer
│   └── utils/             # FUTURE: Helpers
├── deploy/                # NEW: Deployment files
├── server.py              # OLD: Still works (6400 lines)
├── analytics_ai.py        # EXISTING: Updated
└── nutrition_targets.py   # EXISTING: New
```

### What to Use

| Task | Old Way | New Way |
|------|---------|---------|
| Install deps | `pip install -r requirements.txt` | `pip install -e ".[dev]"` |
| Run dev | `uvicorn server:app --reload` | `make run` or `nutrisnap-server` |
| Run prod | `uvicorn server:app` | `gunicorn app.main:app -c gunicorn_conf.py` |
| Format code | Manual | `make format` |
| Run tests | Manual | `make test` |
| Deploy | Manual | `./deploy/deploy.sh` |

## FAQ

**Q: Do I need to change anything right now?**
A: No. Everything still works. The new structure is additive.

**Q: When should I migrate?**
A: Gradually, as you add new features or fix bugs. No rush.

**Q: What if I break something?**
A: The old `server.py` still works. Just revert your changes.

**Q: Do I need to update the frontend?**
A: No. API endpoints are identical.

**Q: What about the database?**
A: No schema changes needed. Same queries, same data.

**Q: Can I deploy the new structure now?**
A: Yes! See `deploy/DEPLOYMENT.md` for VM deployment.

## Next Steps

1. **Try the new installation:**
   ```bash
   pip install -e ".[dev]"
   make run
   ```

2. **Test the health endpoint:**
   ```bash
   curl http://localhost:8000/health
   ```

3. **Read the deployment guide:**
   ```bash
   cat deploy/DEPLOYMENT.md
   ```

4. **Start extracting (optional):**
   - Pick one utility function
   - Move it to `app/utils/`
   - Update imports
   - Test everything still works

## Summary

- ✅ **Nothing is broken** - Old way still works
- ✅ **Proper Python package** - Has `pyproject.toml`
- ✅ **Production ready** - Can deploy to VM now
- ✅ **Gradual migration** - Refactor at your own pace
- ✅ **No frontend changes** - API is identical

The monolithic `server.py` will be gradually replaced, but there's no rush. Each extraction is a separate, testable change.
