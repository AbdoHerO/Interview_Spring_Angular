"""Upload + repository ingestion routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.deps import require_internal_token
from app.models.schemas import IngestResponse, RepositoryRequest
from app.services.ingest import ingest_repository, ingest_single_file, ingest_zip

router = APIRouter(prefix="/api", tags=["ingestion"],
                   dependencies=[Depends(require_internal_token)])


@router.post("/upload", response_model=IngestResponse)
async def upload(file: UploadFile = File(...), kind: str = Form("auto")):
    s = get_settings()
    raw = await file.read()
    if len(raw) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"file too large (max {s.max_upload_mb}MB)")
    name = file.filename or "upload.bin"
    lower = name.lower()
    if kind == "auto":
        kind = "zip" if lower.endswith(".zip") else "file"
    try:
        if kind == "zip":
            res = await ingest_zip(name, raw)
        else:
            res = await ingest_single_file(name, raw)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return IngestResponse(**res.__dict__)


@router.post("/analyze-repository", response_model=IngestResponse)
async def analyze_repository(body: RepositoryRequest):
    try:
        res = await ingest_repository(body.url, body.branch)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"repository ingestion failed: {e}")
    return IngestResponse(**res.__dict__)
