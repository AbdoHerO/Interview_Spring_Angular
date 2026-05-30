"""FastAPI app entry point."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api import routes_ingest, routes_interview
from app.config import get_settings


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Interview Revision Hub — AI Service",
        version="1.0.0",
        description="RAG-powered AI technical interviewer (FastAPI + Qdrant).",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.origins,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
    app.include_router(routes_ingest.router)
    app.include_router(routes_interview.router)

    @app.get("/healthz")
    async def healthz():
        return {
            "status": "ok",
            "embedding_model": __import__("app.core.embeddings", fromlist=["get_embedder"]).get_embedder().active_model(),
            "providers": s.providers,
            "qdrant": s.qdrant_url or f"local:{s.qdrant_local_path}",
        }

    os.makedirs(s.session_dir_abs, exist_ok=True)
    logger.info(f"AI service starting on :{s.ai_service_port} (qdrant={s.qdrant_url or 'local'})")
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    s = get_settings()
    uvicorn.run("app.main:app", host=s.ai_service_host, port=s.ai_service_port, reload=False)
