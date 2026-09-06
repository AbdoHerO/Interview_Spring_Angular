"""Centralised typed configuration loaded from environment / .env."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env next to the `ai-service/` folder, no matter the CWD uvicorn ran from.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_PATH), extra="ignore", case_sensitive=False)

    # service
    ai_service_host: str = "0.0.0.0"
    ai_service_port: int = 8088
    internal_shared_secret: str = "change-me"
    allowed_origins: str = "http://localhost"

    # LLM providers
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_realtime_model: str = "gpt-realtime-2"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    groq_api_key: str = ""
    groq_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    llm_provider_priority: str = "openai,anthropic,groq"

    # embeddings
    voyage_api_key: str = ""
    voyage_model: str = "voyage-code-3"
    embedding_fallback_model: str = "text-embedding-3-small"
    embedding_dim: int = 1024

    # qdrant
    qdrant_url: str = ""          # empty = local embedded mode (no server)
    qdrant_api_key: str = ""
    qdrant_collection: str = "interview_knowledge"
    qdrant_local_path: str = "./data/qdrant"

    # session
    session_backend: str = "json"  # json | redis
    session_dir: str = "./data/sessions"
    redis_url: str = "redis://localhost:6379/0"

    # ingestion
    max_upload_mb: int = 50
    max_repo_files: int = 2000
    max_repo_bytes: int = 20 * 1024 * 1024
    chunk_tokens: int = 400
    chunk_overlap: int = 60

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def providers(self) -> List[str]:
        return [p.strip() for p in self.llm_provider_priority.split(",") if p.strip()]

    @property
    def session_dir_abs(self) -> str:
        p = Path(self.session_dir)
        return str(p if p.is_absolute() else (_ENV_PATH.parent / p).resolve())

    @property
    def qdrant_local_path_abs(self) -> str:
        p = Path(self.qdrant_local_path)
        return str(p if p.is_absolute() else (_ENV_PATH.parent / p).resolve())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
