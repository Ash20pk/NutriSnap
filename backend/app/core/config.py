"""
Configuration management for NutriSnap backend.
Loads environment variables and provides typed config access.
"""

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Load .env file from backend root
ROOT_DIR = Path(__file__).parent.parent.parent
load_dotenv(ROOT_DIR / '.env')


class Settings:
    """Application settings loaded from environment variables."""
    
    # Database
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "").strip()
    
    # OpenAI
    OPENAI_API_KEY: str = os.environ.get('OPENAI_API_KEY', '')
    OPENAI_MODEL: str = os.environ.get('OPENAI_MODEL', 'gpt-4o')
    OPENAI_CHEAP_MODEL: str = os.environ.get('OPENAI_CHEAP_MODEL', 'gpt-4.1-mini')
    
    # Supabase
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").strip()
    SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    SUPABASE_STORAGE_BUCKET: str = os.environ.get("SUPABASE_STORAGE_BUCKET", "food-labels").strip() or "food-labels"
    SUPABASE_STORAGE_PUBLIC: bool = os.environ.get("SUPABASE_STORAGE_PUBLIC", "true").strip().lower() in ("1", "true", "yes")
    
    # Admin & Security
    ADMIN_SYNC_KEY: str = os.environ.get("ADMIN_SYNC_KEY", "").strip()
    ADMIN_API_KEY: str = os.environ.get("ADMIN_API_KEY", "").strip()
    
    # USDA API
    USDA_API_KEY: str = os.environ.get("USDA_API_KEY", "").strip()
    
    # Foods sync configuration
    FOODS_SYNC_BATCH_SIZE: int = int(os.environ.get("FOODS_SYNC_BATCH_SIZE", "200"))
    FOODS_SYNC_USED_DAYS: int = int(os.environ.get("FOODS_SYNC_USED_DAYS", "30"))
    FOODS_SYNC_STALE_DAYS: int = int(os.environ.get("FOODS_SYNC_STALE_DAYS", "90"))
    
    # Startup behavior
    SEED_FOODS_ON_STARTUP: bool = os.environ.get("SEED_FOODS_ON_STARTUP", "false").strip().lower() in ("1", "true", "yes")
    SEED_USDA_ON_STARTUP: bool = os.environ.get("SEED_USDA_ON_STARTUP", "false").strip().lower() in ("1", "true", "yes")
    
    # USDA bootstrap
    USDA_BOOTSTRAP_TERMS: list[str] = [
        t.strip() for t in 
        os.environ.get("USDA_BOOTSTRAP_TERMS", "rice,egg,chicken breast,banana,apple,milk,bread,oats").split(",") 
        if t.strip()
    ]
    USDA_BOOTSTRAP_PER_TERM: int = int(os.environ.get("USDA_BOOTSTRAP_PER_TERM", "10"))
    
    # Server
    HOST: str = os.environ.get("HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("PORT", "8000"))
    WORKERS: int = int(os.environ.get("WORKERS", "4"))
    
    # CORS
    CORS_ORIGINS: list[str] = [
        origin.strip() 
        for origin in os.environ.get("CORS_ORIGINS", "*").split(",") 
        if origin.strip()
    ]
    
    # Logging
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO").upper()
    LOG_FORMAT: str = os.environ.get("LOG_FORMAT", "text")  # "text" or "json"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return os.environ.get("ENVIRONMENT", "development").lower() == "production"

    def validate_production(self) -> None:
        """
        Fail fast if critical environment variables are missing in production.
        Call this once during application startup.
        """
        if not self.is_production:
            return
        required = {
            "DATABASE_URL": self.DATABASE_URL,
            "OPENAI_API_KEY": self.OPENAI_API_KEY,
            "SUPABASE_URL": self.SUPABASE_URL,
            "SUPABASE_JWT_SECRET": self.SUPABASE_JWT_SECRET,
            "SUPABASE_SERVICE_ROLE_KEY": self.SUPABASE_SERVICE_ROLE_KEY,
            "ADMIN_API_KEY": self.ADMIN_API_KEY,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables for production: {', '.join(missing)}"
            )
        # CORS wildcard is acceptable for mobile-only backends (no browser clients)


# Global settings instance
settings = Settings()
