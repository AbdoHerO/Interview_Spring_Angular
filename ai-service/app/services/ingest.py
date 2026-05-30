"""Ingestion pipeline: file/zip/repo -> parse -> chunk -> embed -> Qdrant.

Also produces a repository-level *analysis brief* (architecture, technologies,
weaknesses) using the configured LLM. The brief is stored as its own chunks
under `file_type=brief` so it can be retrieved later as RAG context.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
import zipfile
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from loguru import logger

from app.config import get_settings
from app.core.chunker import Chunk, chunk_file, detect_technologies
from app.core.embeddings import get_embedder
from app.core.llm import get_llm
from app.core.vectorstore import get_store
from app.prompts.analyzer import REPO_ANALYZER_SYSTEM, repo_analyzer_user
from app.utils.github import clone_repo, cleanup_repo
from app.utils.parsing import extract_any, walk_repo
from app.utils.tokens import count_tokens, truncate_to_tokens


@dataclass
class IngestResult:
    source_id: str
    kind: str
    name: str
    chunks: int
    tokens: int
    technologies: List[str]
    summary: Optional[str]


# ----------------------- single file -----------------------

async def ingest_single_file(filename: str, raw_bytes: bytes) -> IngestResult:
    s = get_settings()
    source_id = uuid4().hex
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, os.path.basename(filename))
        with open(path, "wb") as f:
            f.write(raw_bytes)
        text, kind = extract_any(path)
        if not text:
            raise ValueError(f"could not extract text from {filename}")

        chunks = chunk_file(
            filename=filename, content=text, source_id=source_id,
            target_tokens=s.chunk_tokens, overlap_tokens=s.chunk_overlap,
        )
        await _store_chunks(chunks)
        techs = detect_technologies(filename, text)
        total_tokens = sum(c.tokens for c in chunks)
        return IngestResult(source_id, "file", filename, len(chunks), total_tokens, techs, None)


# ----------------------- zip -----------------------

async def ingest_zip(filename: str, raw_bytes: bytes) -> IngestResult:
    s = get_settings()
    source_id = uuid4().hex
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "upload.zip")
        with open(zpath, "wb") as f:
            f.write(raw_bytes)
        extract_dir = os.path.join(td, "ext")
        os.makedirs(extract_dir, exist_ok=True)
        try:
            with zipfile.ZipFile(zpath) as zf:
                # safety: prevent path traversal
                for member in zf.namelist():
                    if member.startswith("/") or ".." in member:
                        continue
                    zf.extract(member, extract_dir)
        except zipfile.BadZipFile as e:
            raise ValueError(f"invalid zip: {e}") from e
        return await _ingest_directory(extract_dir, source_id=source_id, name=filename, kind="zip")


# ----------------------- repository -----------------------

async def ingest_repository(url: str, branch: Optional[str] = None) -> IngestResult:
    source_id = uuid4().hex
    name = url.rstrip("/").rsplit("/", 1)[-1] or url
    path = await asyncio.to_thread(clone_repo, url, branch)
    try:
        return await _ingest_directory(path, source_id=source_id, name=name, kind="repo")
    finally:
        cleanup_repo(path)


# ----------------------- shared directory walker -----------------------

async def _ingest_directory(root: str, *, source_id: str, name: str, kind: str) -> IngestResult:
    s = get_settings()
    all_chunks: List[Chunk] = []
    techs: set[str] = set()
    important_snippets: List[Tuple[str, str]] = []  # (rel_path, head)
    file_count = 0

    for full in walk_repo(root, max_files=s.max_repo_files, max_bytes=s.max_repo_bytes):
        rel = os.path.relpath(full, root).replace("\\", "/")
        text, _kind = extract_any(full)
        if not text.strip():
            continue
        file_count += 1
        for t in detect_technologies(rel, text):
            techs.add(t)
        chunks = chunk_file(
            filename=rel, content=text, source_id=source_id,
            target_tokens=s.chunk_tokens, overlap_tokens=s.chunk_overlap,
            extra_meta={"repo": name},
        )
        all_chunks.extend(chunks)

        base = os.path.basename(rel).lower()
        if base in {"readme.md", "readme", "pom.xml", "package.json", "build.gradle",
                    "application.properties", "application.yml", "application.yaml",
                    "dockerfile", "docker-compose.yml", "docker-compose.yaml"} \
                or base.endswith(("controller.java", "service.java", "config.java")):
            important_snippets.append((rel, truncate_to_tokens(text, 1200)))

    if not all_chunks:
        raise ValueError("no ingestible content found in the source")

    # ---------- analysis brief ----------
    brief: Optional[str] = None
    try:
        brief = await _build_repo_brief(name=name, technologies=sorted(techs),
                                        snippets=important_snippets[:25])
        if brief:
            brief_chunks = chunk_file(
                filename=f"__brief__/{name}.md", content=brief, source_id=source_id,
                target_tokens=s.chunk_tokens, overlap_tokens=s.chunk_overlap,
                extra_meta={"repo": name, "file_type": "brief"},
            )
            # force file_type=brief on metadata
            for c in brief_chunks:
                c.metadata["file_type"] = "brief"
            all_chunks.extend(brief_chunks)
    except Exception as e:
        logger.warning(f"repo brief generation failed (non-fatal): {e}")

    await _store_chunks(all_chunks)
    total_tokens = sum(c.tokens for c in all_chunks)
    logger.info(f"ingested {kind} '{name}' files={file_count} chunks={len(all_chunks)} tokens={total_tokens}")
    return IngestResult(source_id, kind, name, len(all_chunks), total_tokens, sorted(techs), brief)


# ----------------------- helpers -----------------------

async def _store_chunks(chunks: List[Chunk]) -> None:
    if not chunks:
        return
    embedder = get_embedder()
    store = await get_store()
    # batch to avoid huge payloads
    BATCH = 64
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i : i + BATCH]
        vectors = await embedder.embed([c.text for c in batch], input_type="document")
        payloads = [{"text": c.text, **c.metadata} for c in batch]
        await store.upsert(vectors=vectors, payloads=payloads)


async def _build_repo_brief(*, name: str, technologies: List[str],
                            snippets: List[Tuple[str, str]]) -> str:
    """Produce a one-page architecture brief used both as a UI summary and as RAG context."""
    llm = get_llm()
    user_msg = repo_analyzer_user(name=name, technologies=technologies, snippets=snippets)
    # prefer Claude for long-context analysis when available
    return await llm.chat(
        [{"role": "system", "content": REPO_ANALYZER_SYSTEM},
         {"role": "user",   "content": user_msg}],
        prefer="anthropic", temperature=0.2, max_tokens=1400,
    )


# ----------------------- retrieval for RAG -----------------------

async def retrieve_context(*, query: str, source_id: Optional[str], top_k: int = 6,
                           with_brief_boost: bool = True) -> List[Dict]:
    from app.core.reranker import rerank
    embedder = get_embedder()
    store = await get_store()
    [qv] = await embedder.embed([query], input_type="query")
    hits = await store.search(vector=qv, top_k=max(top_k * 3, 12), source_id=source_id)
    if with_brief_boost:
        for h in hits:
            if (h["payload"].get("file_type") == "brief"):
                h["score"] = (h["score"] or 0) * 1.15
    return rerank(query, hits, top_k=top_k)
