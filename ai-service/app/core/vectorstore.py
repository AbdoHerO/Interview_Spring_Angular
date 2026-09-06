"""Qdrant wrapper for storing chunks with rich metadata + similarity / filter search."""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Optional
from uuid import uuid4

from loguru import logger
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.config import Settings, get_settings
from app.core.embeddings import get_embedder


class VectorStore:
    """Thin async wrapper around qdrant-client (which is sync) using to_thread."""

    def __init__(self, s: Settings):
        self.s = s
        self.collection = s.qdrant_collection
        # ── Local embedded mode (no server, no Docker) ────────────────────
        # When QDRANT_URL is empty, blank, or starts with "local" / "file:",
        # we use qdrant-client's built-in local persistent storage.
        # Otherwise we connect to a running Qdrant server at the given URL.
        url = (s.qdrant_url or "").strip()
        if not url or url.lower().startswith(("local", "file:", "./", "/")):
            path = s.qdrant_local_path_abs
            os.makedirs(path, exist_ok=True)
            logger.info(f"Qdrant: using local embedded storage at {path}")
            self._client = QdrantClient(path=path)
        else:
            self._client = QdrantClient(url=url, api_key=s.qdrant_api_key or None,
                                        prefer_grpc=False, timeout=30)
        self._ready = False

    async def ensure_collection(self, dim: int) -> None:
        if self._ready:
            return
        await asyncio.to_thread(self._ensure_sync, dim)
        self._ready = True

    def _ensure_sync(self, dim: int) -> None:
        existing = [c.name for c in self._client.get_collections().collections]
        if self.collection in existing:
            return
        self._client.create_collection(
            collection_name=self.collection,
            vectors_config=qm.VectorParams(size=dim, distance=qm.Distance.COSINE),
        )
        # Common payload indexes for filtered hybrid search
        for field, schema in [
            ("source_id", qm.PayloadSchemaType.KEYWORD),
            ("technology", qm.PayloadSchemaType.KEYWORD),
            ("file_type", qm.PayloadSchemaType.KEYWORD),
            ("language", qm.PayloadSchemaType.KEYWORD),
            ("filename", qm.PayloadSchemaType.KEYWORD),
        ]:
            try:
                self._client.create_payload_index(self.collection, field_name=field, field_schema=schema)
            except Exception:
                pass
        logger.info(f"Qdrant collection ready: {self.collection} dim={dim}")

    async def upsert(self, *, vectors: List[List[float]], payloads: List[Dict[str, Any]]) -> List[str]:
        assert len(vectors) == len(payloads)
        ids = [str(uuid4()) for _ in vectors]
        points = [qm.PointStruct(id=i, vector=v, payload=p) for i, v, p in zip(ids, vectors, payloads)]
        await asyncio.to_thread(self._client.upsert, collection_name=self.collection, points=points)
        return ids

    async def search(self, *, vector: List[float], top_k: int = 8,
                     source_id: Optional[str] = None,
                     extra_filters: Optional[List[qm.FieldCondition]] = None) -> List[Dict[str, Any]]:
        must: List[qm.FieldCondition] = []
        if source_id:
            must.append(qm.FieldCondition(key="source_id", match=qm.MatchValue(value=source_id)))
        if extra_filters:
            must.extend(extra_filters)
        flt = qm.Filter(must=must) if must else None

        # qdrant-client >= 1.7: use query_points (replaces the removed .search())
        res = await asyncio.to_thread(
            self._client.query_points,
            collection_name=self.collection,
            query=vector,
            limit=top_k,
            query_filter=flt,
            with_payload=True,
        )
        # query_points returns a QueryResponse with a .points list of ScoredPoint
        points = res.points if hasattr(res, "points") else res
        return [{"score": h.score, "payload": h.payload} for h in points]

    async def delete_source(self, source_id: str) -> None:
        await asyncio.to_thread(
            self._client.delete,
            collection_name=self.collection,
            points_selector=qm.FilterSelector(
                filter=qm.Filter(must=[qm.FieldCondition(
                    key="source_id", match=qm.MatchValue(value=source_id))])
            ),
        )


_store: Optional[VectorStore] = None


async def get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore(get_settings())
        await _store.ensure_collection(get_embedder().active_dim())
    return _store
