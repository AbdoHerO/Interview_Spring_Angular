"""HMAC-signed short-lived ticket used to authorize browser WebSocket
connections without proxying WS through PHP.

Token format:  <session_id>.<expiry_epoch_seconds>.<hex_hmac_sha256>
The HMAC is computed over "<session_id>.<expiry_epoch_seconds>" with the
shared secret already wired between PHP and this service.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from app.config import get_settings


class TokenError(ValueError):
    pass


def _sign(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def issue(session_id: str, ttl_seconds: int = 600) -> str:
    s = get_settings()
    exp = int(time.time()) + max(60, ttl_seconds)
    payload = f"{session_id}.{exp}"
    return f"{payload}.{_sign(payload, s.internal_shared_secret)}"


def verify(token: str) -> str:
    """Returns the session_id on success; raises TokenError otherwise."""
    if not token or token.count(".") != 2:
        raise TokenError("malformed token")
    session_id, exp_str, sig = token.split(".", 2)
    try:
        exp = int(exp_str)
    except ValueError as e:
        raise TokenError("bad expiry") from e
    if exp < time.time():
        raise TokenError("token expired")
    s = get_settings()
    expected = _sign(f"{session_id}.{exp}", s.internal_shared_secret)
    if not hmac.compare_digest(expected, sig):
        raise TokenError("bad signature")
    return session_id
