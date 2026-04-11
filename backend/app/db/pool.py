"""
Database connection pool management.
Handles asyncpg pool initialization, lifecycle, and graceful shutdown.
"""

import os
import asyncpg
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Global pool instance
pg_pool: Optional[asyncpg.Pool] = None


async def init_pool(database_url: str, max_size: int = 10) -> asyncpg.Pool:
    """
    Initialize the asyncpg connection pool.
    
    Args:
        database_url: PostgreSQL connection string
        max_size: Maximum number of connections in the pool
    
    Returns:
        The initialized connection pool
    """
    global pg_pool
    
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")
    
    logger.info(f"Initializing database pool (max_size={max_size})")
    
    pg_pool = await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=max_size,
        command_timeout=30,
        statement_cache_size=0,
    )
    
    logger.info("Database pool initialized successfully")
    return pg_pool


async def close_pool() -> None:
    """
    Close the database connection pool gracefully.
    """
    global pg_pool
    
    if pg_pool is not None:
        logger.info("Closing database pool")
        await pg_pool.close()
        pg_pool = None
        logger.info("Database pool closed")


def get_pool() -> Optional[asyncpg.Pool]:
    """
    Get the current database pool instance.
    
    Returns:
        The current pool or None if not initialized
    """
    return pg_pool


async def check_pool_health() -> bool:
    """
    Check if the database pool is healthy by executing a simple query.
    
    Returns:
        True if pool is healthy, False otherwise
    """
    if pg_pool is None:
        return False
    
    try:
        async with pg_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"Database pool health check failed: {e}")
        return False
