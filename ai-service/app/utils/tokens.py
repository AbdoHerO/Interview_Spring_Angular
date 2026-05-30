"""Token utilities — tiktoken-based, safe fallback when model is unknown."""
from __future__ import annotations

from functools import lru_cache

import tiktoken


@lru_cache(maxsize=4)
def _enc(name: str = "cl100k_base"):
    try:
        return tiktoken.get_encoding(name)
    except Exception:  # pragma: no cover
        return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str, model: str | None = None) -> int:
    if not text:
        return 0
    enc = _enc()
    return len(enc.encode(text, disallowed_special=()))


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    enc = _enc()
    ids = enc.encode(text, disallowed_special=())
    if len(ids) <= max_tokens:
        return text
    return enc.decode(ids[:max_tokens])
