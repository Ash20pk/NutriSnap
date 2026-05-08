"""
Main FastAPI application entry point.
Clean modular application using services and route modules.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.middleware import AIRateLimitMiddleware, RequestSizeLimitMiddleware
from app.db.pool import init_pool, close_pool, check_pool_health

# Import route modules
from app.api.routes import analytics, users, meals, quests, social, foods, recipes, ai_meals, labels, admin, chef, water

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    settings.validate_production()
    logger.info("Starting NutriSnap Backend API (Modular)")
    logger.info(f"Environment: {'production' if settings.is_production else 'development'}")
    logger.info(f"Database: {settings.DATABASE_URL[:30]}..." if settings.DATABASE_URL else "Database: Not configured")
    
    # Initialize database pool
    await init_pool(settings.DATABASE_URL)
    logger.info("Database pool initialized")
    
    yield
    
    # Shutdown
    logger.info("Shutting down NutriSnap Backend API")
    await close_pool()
    logger.info("Database pool closed")


# Create FastAPI application
app = FastAPI(
    title="NutriSnap API",
    description="AI-powered nutrition tracking and analysis",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reject oversized request bodies before they reach handlers
app.add_middleware(RequestSizeLimitMiddleware)

# Per-user token-bucket rate limiting on AI endpoints
app.add_middleware(AIRateLimitMiddleware)

# Include route modules
app.include_router(analytics.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(meals.router, prefix="/api")
app.include_router(quests.router, prefix="/api")
app.include_router(social.router, prefix="/api")
app.include_router(foods.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")
app.include_router(ai_meals.router, prefix="/api")
app.include_router(labels.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(chef.router, prefix="/api")
app.include_router(water.router, prefix="/api")


# Health check endpoint
@app.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    Returns 200 if the service is healthy.
    """
    health_status = {
        "status": "healthy",
        "version": "2.0.0",
        "database": "disconnected",
        "architecture": "modular"
    }
    
    # Check database connection
    try:
        is_healthy = await check_pool_health()
        if is_healthy:
            health_status["database"] = "connected"
        else:
            health_status["status"] = "degraded"
            health_status["database"] = "error"
    except Exception as e:
        logger.error(f"Health check database error: {e}")
        health_status["status"] = "degraded"
        health_status["database"] = "error"
    
    return health_status


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "NutriSnap API v2.0 - Complete Modular Architecture",
        "docs": "/docs" if not settings.is_production else "disabled",
        "health": "/health",
        "architecture": {
            "services": ["analytics", "profile", "meal", "quest", "social", "food", "recipe", "ai_meal", "label", "admin"],
            "routes": ["analytics", "users", "meals", "quests", "social", "foods", "recipes", "ai_meals", "labels", "admin"],
            "layers": ["routes", "services", "db"]
        },
        "endpoints": {
            "analytics": "/api/analytics",
            "users": "/api/user",
            "meals": "/api/meals",
            "ai_meals": "/api/meals (AI-powered)",
            "quests": "/api/quests",
            "social": "/api/users",
            "foods": "/api/foods",
            "labels": "/api/foods (label processing)",
            "recipes": "/api/recipes",
            "admin": "/api/admin"
        }
    }


# For development: uvicorn app.main:app --reload
# For production: gunicorn app.main:app -c gunicorn_conf.py


def main():
    """CLI entry point for running the server."""
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=not settings.is_production,
        log_level=settings.LOG_LEVEL.lower()
    )
