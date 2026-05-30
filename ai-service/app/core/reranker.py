"""Lightweight, dependency-free reranker.

We compose three signals to rerank vector hits:
 1) raw cosine similarity from Qdrant
 2) BM25-like keyword overlap with the query
 3) technology / filename hint boost

No external reranker model is required — this is a deterministic,
cost-free pass that materially improves retrieval quality for code RAG.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Dict, List

_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]+")


def _tokens(text: str) -> List[str]:
    return [t.lower() for t in _WORD.findall(text or "")]


def _bm25_score(query_terms: List[str], doc_terms: List[str], avg_dl: float,
                k1: float = 1.5, b: float = 0.75) -> float:
    if not doc_terms or not query_terms:
        return 0.0
    tf = Counter(doc_terms)
    dl = len(doc_terms)
    score = 0.0
    for q in query_terms:
        if q not in tf:
            continue
        f = tf[q]
        score += (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / max(avg_dl, 1)))
    return score


def rerank(query: str, hits: List[Dict], top_k: int) -> List[Dict]:
    """`hits` is a list of {score, payload}. Returns a re-sorted, truncated list."""
    if not hits:
        return hits
    q_terms = _tokens(query)
    docs = [_tokens(h["payload"].get("text") or h["payload"].get("section", "")) for h in hits]
    avg_dl = sum(len(d) for d in docs) / max(len(docs), 1)
    max_cos = max((h["score"] for h in hits), default=1.0) or 1.0
    out: List[Dict] = []
    for h, d in zip(hits, docs):
        cos = h["score"] / max_cos
        bm = _bm25_score(q_terms, d, avg_dl)
        bm_norm = 1 - math.exp(-bm / 4)  # squash
        boost = 0.0
        tech = (h["payload"].get("technology") or "").lower()
        if tech and tech in query.lower():
            boost += 0.15
        fname = (h["payload"].get("filename") or "").lower()
        if any(t in fname for t in q_terms):
            boost += 0.10
        final = 0.55 * cos + 0.35 * bm_norm + boost
        out.append({**h, "rerank_score": final})
    out.sort(key=lambda x: x["rerank_score"], reverse=True)
    return out[:top_k]
