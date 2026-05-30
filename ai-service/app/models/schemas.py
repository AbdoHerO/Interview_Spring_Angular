"""Pydantic schemas for API contracts."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

InterviewMode = Literal["technical", "project_defense", "hr", "coding"]
Difficulty = Literal["junior", "mid", "senior", "staff"]


# ---------- ingestion ----------

class IngestResponse(BaseModel):
    source_id: str
    kind: str           # "file" | "zip" | "repo"
    name: str
    chunks: int
    tokens: int
    technologies: List[str] = []
    summary: Optional[str] = None


class RepositoryRequest(BaseModel):
    url: str = Field(..., description="HTTPS URL of a public Git repository")
    branch: Optional[str] = None


# ---------- interview ----------

class StartInterviewRequest(BaseModel):
    mode: InterviewMode
    difficulty: Difficulty = "mid"
    topics: List[str] = []
    source_id: Optional[str] = Field(
        None, description="Required for project_defense — points to an ingested repo/zip"
    )
    language: Literal["en", "fr"] = "en"
    user_label: Optional[str] = None


class InterviewTurn(BaseModel):
    role: Literal["interviewer", "candidate"]
    content: str
    meta: Dict[str, Any] = {}


class StartInterviewResponse(BaseModel):
    session_id: str
    opening_question: str
    state: "InterviewState"


class AnswerRequest(BaseModel):
    session_id: str
    answer: str


class AnswerResponse(BaseModel):
    next_question: str
    evaluation: "TurnEvaluation"
    state: "InterviewState"
    done: bool = False


class TurnEvaluation(BaseModel):
    technical_accuracy: float
    clarity: float
    depth: float
    best_practices: float
    confidence: float
    feedback: str


class FinalScore(BaseModel):
    technical_accuracy: float
    clarity: float
    depth: float
    best_practices: float
    confidence: float
    final_score: float
    strengths: List[str]
    weaknesses: List[str]
    recommendation: str


class InterviewState(BaseModel):
    session_id: str
    mode: InterviewMode
    difficulty: Difficulty
    topics: List[str]
    source_id: Optional[str] = None
    language: str = "en"
    turn_index: int = 0
    max_turns: int = 12
    asked_questions: List[str] = []
    transcript: List[InterviewTurn] = []
    rolling_evaluations: List[TurnEvaluation] = []
    technologies_covered: List[str] = []
    started_at: float
    updated_at: float


StartInterviewResponse.model_rebuild()
AnswerResponse.model_rebuild()
