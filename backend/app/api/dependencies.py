"""
FastAPI dependencies for authentication and common utilities.
"""

import os
import logging
from typing import Optional
from fastapi import Header, HTTPException
import jwt
from jwt import PyJWKClient
from jwt import PyJWTError

logger = logging.getLogger(__name__)

# Supabase Auth configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_JWT_AUD = os.environ.get("SUPABASE_JWT_AUD", "authenticated")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_JWT_ISSUER = os.environ.get(
    "SUPABASE_JWT_ISSUER",
    f"{SUPABASE_URL.rstrip('/')}/auth/v1" if SUPABASE_URL else "",
)
SUPABASE_JWKS_URL = os.environ.get(
    "SUPABASE_JWKS_URL",
    f"{SUPABASE_JWT_ISSUER.rstrip('/')}/.well-known/jwks.json" if SUPABASE_JWT_ISSUER else "",
)

_supabase_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _supabase_jwk_client
    if _supabase_jwk_client is None:
        if not SUPABASE_JWKS_URL:
            raise HTTPException(status_code=401, detail="SUPABASE_JWKS_URL not set for asymmetric JWT verification")
        _supabase_jwk_client = PyJWKClient(SUPABASE_JWKS_URL)
    return _supabase_jwk_client


async def get_current_uid(authorization: Optional[str] = Header(None)) -> str:
    """
    Extract and validate user ID from JWT token.
    
    Args:
        authorization: Authorization header with Bearer token
    
    Returns:
        User UUID from token
    
    Raises:
        HTTPException: If token is missing or invalid
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = parts[1]
    
    try:
        header = jwt.get_unverified_header(token)
        alg = str(header.get("alg", ""))

        # Development mode: if no secret AND no issuer configured, just decode without verifying.
        if not SUPABASE_JWT_SECRET and not SUPABASE_JWT_ISSUER:
            logger.warning("Supabase JWT verification not configured (no secret/issuer) - decoding without verification")
            payload = jwt.decode(token, options={"verify_signature": False})
        elif alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(status_code=401, detail="SUPABASE_JWT_SECRET not set for HS256 verification")
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience=SUPABASE_JWT_AUD,
                issuer=SUPABASE_JWT_ISSUER,
            )
        elif alg in ("RS256", "ES256"):
            signing_key = _get_jwk_client().get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience=SUPABASE_JWT_AUD,
                issuer=SUPABASE_JWT_ISSUER,
            )
        else:
            raise HTTPException(status_code=401, detail=f"Invalid token: unsupported alg {alg}")

        uid = payload.get("sub")
        if not uid:
            raise HTTPException(status_code=401, detail="Token missing 'sub' claim")
        return str(uid)
    except HTTPException:
        raise
    except PyJWTError as e:
        logger.error(f"JWT validation error: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception as e:
        logger.error(f"JWT validation error: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_user_match(current_uid: str, target_user_id: str) -> None:
    """
    Verify that the current user matches the target user ID.
    
    Args:
        current_uid: Current authenticated user ID
        target_user_id: Target user ID from request
    
    Raises:
        HTTPException: If user IDs don't match
    """
    if current_uid != target_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this resource")
