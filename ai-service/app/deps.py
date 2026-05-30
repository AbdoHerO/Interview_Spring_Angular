"""FastAPI dependencies — auth + shared singletons."""
from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.config import get_settings


async def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    """All endpoints are called by the PHP proxy, which forwards a shared secret.
    This prevents direct public exposure of the Python service."""
    expected = get_settings().internal_shared_secret
    if not expected or expected == "change-me":
        # Service mis-configured: refuse rather than running insecurely.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ai-service not configured")
    if not x_internal_token or x_internal_token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad internal token")
