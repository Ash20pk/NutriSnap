# Integration Guide - Modular NutriSnap Backend

## Overview

The NutriSnap backend has been successfully refactored into a clean, modular architecture. This guide explains how to use the new modular application.

## Architecture

### 3-Layer Architecture

```
┌─────────────────────────────────────────┐
│         Routes (HTTP Layer)             │
│  - Request/Response handling            │
│  - Authentication                       │
│  - Validation (Pydantic)                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       Services (Business Logic)         │
│  - Analytics computation                │
│  - Profile management                   │
│  - Meal logging & tracking              │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         DB Layer (Data Access)          │
│  - Connection pool management           │
│  - Query helpers                        │
│  - Record conversion                    │
└─────────────────────────────────────────┘
```

## Running the Modular Application

### Development Mode

```bash
# Option 1: Using uvicorn directly
uvicorn app.main:app --reload --port 8000

# Option 2: Using the CLI entry point
python -m app.main

# Option 3: Using make (if installed)
make run
```

### Production Mode

```bash
# Using Gunicorn with Uvicorn workers
gunicorn app.main:app -c gunicorn_conf.py
```

## Available Endpoints

### Analytics Routes (`/api/analytics`)

- `GET /api/analytics/{user_id}` - Get cached analytics
  - Query params: `time_range` (week|month|year), `force_refresh` (bool)
  
- `GET /api/analytics/{user_id}/bundle` - Get meals + analytics
  - Query params: `time_range`, `timezone_offset` (int)
  
- `POST /api/analytics/{user_id}/refresh` - Force refresh analytics
  - Query params: `time_range`, `timezone_offset`

### User/Profile Routes (`/api/user`)

- `POST /api/user/onboarding` - Create user profile
- `GET /api/user/me` - Get current user profile
- `GET /api/user/{user_id}` - Get user by ID
- `PUT /api/user/me/profile` - Update bio/avatar
- `PUT /api/user/{user_id}/goals` - Update goals
- `POST /api/user/me/weight-check` - Record weight check
- `GET /api/user/me/weight-history` - Get weight history
- `POST /api/user/me/username` - Set username

### Meal Routes (`/api/meals`)

- `POST /api/meals/log` - Log a meal
- `GET /api/meals/{user_id}/history` - Get meal history
  - Query params: `days` (int), `timezone_offset` (int)
  
- `GET /api/meals/{user_id}/daily-summary` - Get daily summary
  - Query params: `target_date` (YYYY-MM-DD)
  
- `DELETE /api/meals/{meal_id}` - Delete a meal

### Quest Routes (`/api/quests`)

- `GET /api/quests/{user_id}/daily` - Get daily quests with progress
- `POST /api/quests/{user_id}/claim/{quest_id}` - Claim quest XP
- `GET /api/quests/{user_id}/badges` - Get user badges
- `GET /api/quests/{user_id}/stats` - Get XP, level, streak stats

### Social Routes (`/api/users`)

- `GET /api/users/search` - Search users by name/username
  - Query params: `query` (string)
  
- `POST /api/users/{target_user_id}/follow` - Follow a user
- `DELETE /api/users/{target_user_id}/follow` - Unfollow a user
- `GET /api/users/me/following` - Get list of users you're following
- `GET /api/users/me/followers` - Get list of your followers
- `GET /api/users/{user_id}/public-stats` - Get public user stats

### Food Routes (`/api/foods`)

- `GET /api/foods/search` - Search foods
  - Query params: `query`, `category`, `vegetarian_only` (bool)
  
- `GET /api/foods/categories` - Get all food categories
- `GET /api/foods/barcode/{barcode}` - Barcode lookup
- `GET /api/foods/{food_id}` - Get food details
- `POST /api/foods/label-submissions` - Submit label for review
- `POST /api/foods/custom` - Create custom food
- `GET /api/foods/custom/me` - Get user's custom foods

### Recipe Routes (`/api/recipes`)

- `POST /api/recipes/save` - Save a recipe
- `GET /api/recipes/saved/{user_id}` - Get saved recipes
- `DELETE /api/recipes/{recipe_id}` - Delete recipe
- `PUT /api/recipes/{recipe_id}/favorite` - Toggle favorite
- `PUT /api/recipes/{recipe_id}/cooked` - Increment times cooked

### System Routes

- `GET /` - Root endpoint with API info
- `GET /health` - Health check for monitoring
- `GET /docs` - OpenAPI documentation (dev only)

## Authentication

All routes require authentication via JWT token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/api/user/me
```

### Development Mode

If `SUPABASE_JWT_SECRET` is not set, the app runs in development mode and accepts any token without validation (for testing only).

### Production Mode

Set the following environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_JWT_AUD=authenticated
SUPABASE_JWT_ISSUER=https://your-project.supabase.co/auth/v1
```

## Environment Variables

### Required

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### Optional

```bash
# Server
HOST=0.0.0.0
PORT=8000
WORKERS=4

# CORS
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=text  # or "json"

# Environment
ENVIRONMENT=development  # or "production"

# OpenAI (for analytics)
OPENAI_API_KEY=sk-...

# Supabase Auth
SUPABASE_URL=https://...
SUPABASE_JWT_SECRET=...
```

## Testing the Integration

### 1. Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "database": "connected",
  "architecture": "modular"
}
```

### 2. API Documentation

Visit `http://localhost:8000/docs` in development mode to see interactive API documentation.

### 3. Test Endpoints

```bash
# Get user profile (requires auth token)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/user/me

# Log a meal (requires auth token)
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_UUID",
    "meal_type": "lunch",
    "foods": [...],
    "logging_method": "manual"
  }' \
  http://localhost:8000/api/meals/log
```

## Migration from Legacy server.py

### Side-by-Side Running

You can run both the legacy `server.py` and the new modular app simultaneously on different ports:

```bash
# Legacy app on port 8000
uvicorn server:app --port 8000

# Modular app on port 8001
uvicorn app.main:app --port 8001
```

### Gradual Migration

1. **Start with new endpoints**: Use the modular app for new features
2. **Test thoroughly**: Ensure all endpoints work as expected
3. **Switch traffic**: Update your frontend to use the new endpoints
4. **Deprecate legacy**: Once stable, deprecate `server.py`

## Module Structure

```
app/
├── __init__.py
├── main.py                    # FastAPI app with route integration
├── api/
│   ├── dependencies.py        # Auth and common dependencies
│   └── routes/
│       ├── analytics.py       # Analytics endpoints
│       ├── users.py           # User/profile endpoints
│       └── meals.py           # Meal endpoints
├── services/
│   ├── analytics_service.py   # Analytics business logic
│   ├── profile_service.py     # Profile business logic
│   └── meal_service.py        # Meal business logic
├── db/
│   ├── pool.py                # Connection pool management
│   └── queries.py             # Query helpers
├── utils/
│   ├── nutrition.py           # Nutrition calculations
│   ├── micronutrients.py      # Micronutrient helpers
│   ├── parsers.py             # Text/image parsing
│   └── nutrition_targets.py   # RDA/AI/UL tables
└── core/
    ├── config.py              # Configuration
    └── logging_config.py      # Logging setup
```

## Benefits of Modular Architecture

1. **Maintainability**: Easy to find and modify code
2. **Testability**: Each layer can be tested independently
3. **Scalability**: Simple to add new features/domains
4. **Reusability**: Services can be used by multiple routes
5. **Type Safety**: Pydantic validation throughout
6. **Clean Separation**: Each layer has one responsibility

## Troubleshooting

### Database Connection Issues

Check that `DATABASE_URL` is set correctly:
```bash
echo $DATABASE_URL
```

### Import Errors

Ensure you're running from the backend directory:
```bash
cd /path/to/NutriSnap/backend
python -m app.main
```

### Authentication Errors

In development, set `SUPABASE_JWT_SECRET=""` to disable validation:
```bash
export SUPABASE_JWT_SECRET=""
uvicorn app.main:app --reload
```

### Port Already in Use

Change the port:
```bash
uvicorn app.main:app --port 8001
```

## Next Steps

1. **Add remaining routes**: Quest system, food search, social features
2. **Add integration tests**: Test end-to-end functionality
3. **Performance optimization**: Add caching, optimize queries
4. **Monitoring**: Add metrics and tracing
5. **Documentation**: Add more examples and use cases

## Support

For issues or questions:
- Check the logs: `tail -f logs/nutrisnap.log`
- Review the code: All modules are well-documented
- Test endpoints: Use `/docs` for interactive testing
