"""Session store for interview state. Pluggable backend: JSON file or Redis.

Default = JSON (shared-hosting friendly). Each session is a single file.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Optional

from app.config import get_settings
from app.models.schemas import InterviewState


class SessionStore:
    async def save(self, state: InterviewState) -> None: ...
    async def load(self, session_id: str) -> Optional[InterviewState]: ...
    async def delete(self, session_id: str) -> None: ...


class _JsonStore(SessionStore):
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    def _path(self, sid: str) -> Path:
        if not sid.replace("-", "").replace("_", "").isalnum():
            raise ValueError("invalid session_id")
        return self.root / f"{sid}.json"

    async def save(self, state: InterviewState) -> None:
        state.updated_at = time.time()
        data = state.model_dump_json()
        async with self._lock:
            p = self._path(state.session_id)
            tmp = p.with_suffix(".tmp")
            await asyncio.to_thread(tmp.write_text, data, "utf-8")
            await asyncio.to_thread(os.replace, str(tmp), str(p))

    async def load(self, sid: str) -> Optional[InterviewState]:
        p = self._path(sid)
        if not p.exists():
            return None
        raw = await asyncio.to_thread(p.read_text, "utf-8")
        return InterviewState.model_validate_json(raw)

    async def delete(self, sid: str) -> None:
        p = self._path(sid)
        if p.exists():
            await asyncio.to_thread(p.unlink)


_store: Optional[SessionStore] = None


def get_session_store() -> SessionStore:
    global _store
    if _store is None:
        s = get_settings()
        # Only JSON is wired by default; redis backend is intentionally not
        # required for shared-hosting deployments.
        _store = _JsonStore(s.session_dir_abs)
    return _store
