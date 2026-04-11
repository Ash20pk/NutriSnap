"""
Production middleware for NutriSnap backend.

- RequestSizeLimitMiddleware: rejects bodies larger than MAX_UPLOAD_SIZE_MB
- RateLimitMiddleware: per-user token-bucket rate limiting for AI endpoints
"""

import asyncio
import logging
import os
import time
from collections import defaultdict
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

# ── Request body size limit ───────────────────────────────────────────────────

MAX_UPLOAD_MB = float(os.environ.get("MAX_UPLOAD_SIZE_MB", "10"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Reject requests whose Content-Length exceeds MAX_UPLOAD_SIZE_MB.
    Protects AI endpoints from accidental or malicious huge payloads.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_UPLOAD_BYTES) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_bytes:
            mb = self.max_bytes / (1024 * 1024)
            logger.warning(
                "Request body too large: %s bytes from %s %s",
                content_length,
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large. Maximum allowed size is {mb:.0f} MB."},
            )
        return await call_next(request)


# ── Per-user AI rate limiter ───────────────────────────────────────────────────
#
# Token-bucket: each user gets RATE_LIMIT_BURST tokens, refilled at
# RATE_LIMIT_PER_MINUTE tokens/minute. Stored in-process (per-worker).
# Good enough for single-instance or low multi-worker deployments.
# For true multi-instance enforcement, replace _buckets with a Redis backend.

_AI_PATHS = {
    "/api/meals/log-photo",
    "/api/meals/voice-to-meal",
    "/api/meals/text-to-meal",
    "/api/meals/has-food",
    "/api/chef/generate",
    "/api/foods/label",
    "/api/foods/health-check",
}

RATE_LIMIT_PER_MINUTE = int(os.environ.get("AI_RATE_LIMIT_PER_MINUTE", "20"))
RATE_LIMIT_BURST = int(os.environ.get("AI_RATE_LIMIT_BURST", "5"))

# bucket: user_id -> (tokens: float, last_refill_time: float)
_buckets: dict[str, tuple[float, float]] = defaultdict(lambda: (float(RATE_LIMIT_BURST), time.monotonic()))
_bucket_lock = asyncio.Lock()


class AIRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Token-bucket rate limiter applied only to AI-heavy endpoints.
    Reads user ID from the 'sub' claim path via request.state after auth,
    falling back to client IP for unauthenticated hits.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._refill_rate = RATE_LIMIT_PER_MINUTE / 60.0  # tokens per second

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if path not in _AI_PATHS:
            return await call_next(request)

        # Identify the caller: prefer authenticated UID set by dependencies,
        # fall back to IP so unauthenticated requests are still limited.
        uid: str = getattr(request.state, "uid", None) or (
            request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
        )

        allowed = await self._consume(uid)
        if not allowed:
            logger.warning("Rate limit exceeded for uid=%s on %s", uid, path)
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Too many requests. Maximum {RATE_LIMIT_PER_MINUTE} AI calls per minute."
                },
                headers={"Retry-After": "60"},
            )

        return await call_next(request)

    async def _consume(self, uid: str) -> bool:
        async with _bucket_lock:
            tokens, last_time = _buckets[uid]
            now = time.monotonic()
            # Refill
            elapsed = now - last_time
            tokens = min(float(RATE_LIMIT_BURST), tokens + elapsed * self._refill_rate)
            if tokens < 1.0:
                _buckets[uid] = (tokens, now)
                return False
            _buckets[uid] = (tokens - 1.0, now)
            return True
