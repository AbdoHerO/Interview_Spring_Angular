"""Interview lifecycle routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_internal_token
from app.models.schemas import (
    AnswerRequest, AnswerResponse, FinalScore, InterviewState,
    StartInterviewRequest, StartInterviewResponse,
)
from app.services.interview_engine import (
    InterviewError, start_interview, submit_answer,
)
from app.services.scoring import final_score
from app.services.session_store import get_session_store

router = APIRouter(prefix="/api", tags=["interview"],
                   dependencies=[Depends(require_internal_token)])


@router.post("/start-interview", response_model=StartInterviewResponse)
async def start(body: StartInterviewRequest):
    try:
        return await start_interview(
            mode=body.mode, difficulty=body.difficulty,
            topics=body.topics, language=body.language,
            source_id=body.source_id,
        )
    except InterviewError as e:
        raise HTTPException(400, str(e))


@router.post("/answer", response_model=AnswerResponse)
async def answer(body: AnswerRequest):
    try:
        return await submit_answer(session_id=body.session_id, answer=body.answer)
    except InterviewError as e:
        raise HTTPException(400, str(e))


@router.get("/interview-state", response_model=InterviewState)
async def state(session_id: str):
    s = await get_session_store().load(session_id)
    if not s:
        raise HTTPException(404, "session not found")
    return s


@router.post("/score-interview", response_model=FinalScore)
async def score(session_id: str):
    s = await get_session_store().load(session_id)
    if not s:
        raise HTTPException(404, "session not found")
    return await final_score(s)
