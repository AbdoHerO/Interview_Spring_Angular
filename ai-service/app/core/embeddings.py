"""Embeddings: Voyage AI (primary, code-optimised) with OpenAI fallback."""
from __future__ import annotations

from typing import List, Optional

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import Settings, get_settings


class EmbeddingError(RuntimeError):
    pass


class EmbeddingClient:
    def __init__(self, s: Settings):
        self.s = s

    def active_model(self) -> str:
        return self.s.voyage_model if self.s.voyage_api_key else self.s.embedding_fallback_model

    def active_dim(self) -> int:
        # voyage-code-3 = 1024 ; openai text-embedding-3-small = 1536
        if self.s.voyage_api_key:
            return 1024
        return 1536

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=6))
    async def embed(self, texts: List[str], *, input_type: str = "document") -> List[List[float]]:
        if not texts:
            return []
        if self.s.voyage_api_key:
            try:
                return await self._voyage(texts, input_type)
            except Exception as e:
                logger.warning(f"Voyage embedding failed, falling back to OpenAI: {e}")
        if not self.s.openai_api_key:
            raise EmbeddingError("no embedding provider configured (set VOYAGE_API_KEY or OPENAI_API_KEY)")
        return await self._openai(texts)

    async def _voyage(self, texts: List[str], input_type: str) -> List[List[float]]:
        body = {"input": texts, "model": self.s.voyage_model, "input_type": input_type}
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                "https://api.voyageai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self.s.voyage_api_key}",
                         "Content-Type": "application/json"},
                json=body,
            )
            if r.status_code >= 400:
                raise EmbeddingError(f"voyage failed {r.status_code}: {r.text[:200]}")
            data = r.json()
            return [item["embedding"] for item in data["data"]]

    async def _openai(self, texts: List[str]) -> List[List[float]]:
        body = {"input": texts, "model": self.s.embedding_fallback_model}
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self.s.openai_base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.s.openai_api_key}",
                         "Content-Type": "application/json"},
                json=body,
            )
            if r.status_code >= 400:
                raise EmbeddingError(f"openai embeddings failed {r.status_code}: {r.text[:200]}")
            data = r.json()
            return [item["embedding"] for item in data["data"]]


_client: Optional[EmbeddingClient] = None


def get_embedder() -> EmbeddingClient:
    global _client
    if _client is None:
        _client = EmbeddingClient(get_settings())
    return _client
