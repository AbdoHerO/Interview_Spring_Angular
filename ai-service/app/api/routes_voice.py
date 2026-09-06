"""Realtime voice routes — HMAC ticket + WebSocket endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from loguru import logger

from app.deps import require_internal_token
from app.services import voice_token
from app.services.realtime_voice import run_voice_session
from app.services.session_store import get_session_store

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/ticket", dependencies=[Depends(require_internal_token)])
async def issue_ticket(session_id: str):
    """Internal endpoint called by ai_proxy.php to mint a short-lived ticket
    that authorizes the browser to open the voice WebSocket directly."""
    s = await get_session_store().load(session_id)
    if not s:
        raise HTTPException(404, "interview session not found")
    return {"token": voice_token.issue(session_id), "ttl_seconds": 600}


@router.websocket("/ws")
async def voice_ws(websocket: WebSocket, token: str = Query(...)):
    """Browser-facing WebSocket. The browser must present a ticket issued by
    /ticket (and obtained through the PHP proxy)."""
    try:
        session_id = voice_token.verify(token)
    except voice_token.TokenError as e:
        await websocket.close(code=4401, reason=f"bad token: {e}")
        return

    await websocket.accept()
    logger.info(f"voice ws accepted for session={session_id}")
    await run_voice_session(websocket, session_id)
