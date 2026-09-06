"""Interview engine — orchestrates question generation, RAG context, and scoring.

This is the brain of the simulator. It is purely async, streams next questions,
and maintains durable session state via `session_store`.
"""
from __future__ import annotations

import time
from typing import AsyncIterator, List, Optional
from uuid import uuid4

from loguru import logger

from app.core.llm import get_llm
from app.models.schemas import (
    AnswerResponse, Difficulty, InterviewMode, InterviewState, InterviewTurn,
    StartInterviewResponse, TurnEvaluation,
)
from app.prompts.interviewer import (
    CODING_INTERVIEWER_SYSTEM, HR_INTERVIEWER_SYSTEM, INTERVIEWER_SYSTEM,
    PROJECT_DEFENSE_SYSTEM,
)
from app.services.ingest import retrieve_context
from app.services.scoring import evaluate_turn
from app.services.session_store import get_session_store

DEFAULT_MAX_TURNS = 12


class InterviewError(RuntimeError):
    pass


# ---------- public API ----------

async def start_interview(*, mode: InterviewMode, difficulty: Difficulty,
                          topics: List[str], language: str,
                          source_id: Optional[str] = None) -> StartInterviewResponse:
    if mode == "project_defense" and not source_id:
        raise InterviewError("project_defense mode requires a source_id (uploaded project / repo)")

    sid = uuid4().hex
    state = InterviewState(
        session_id=sid, mode=mode, difficulty=difficulty, topics=topics or [],
        source_id=source_id, language=language, max_turns=DEFAULT_MAX_TURNS,
        started_at=time.time(), updated_at=time.time(),
    )
    question = await _next_question(state, last_answer=None)
    state.transcript.append(InterviewTurn(role="interviewer", content=question))
    state.asked_questions.append(question)
    await get_session_store().save(state)
    return StartInterviewResponse(session_id=sid, opening_question=question, state=state)


async def submit_answer(*, session_id: str, answer: str) -> AnswerResponse:
    store = get_session_store()
    state = await store.load(session_id)
    if not state:
        raise InterviewError("session not found")

    # record candidate answer
    last_question = state.asked_questions[-1] if state.asked_questions else ""
    state.transcript.append(InterviewTurn(role="candidate", content=answer))

    # evaluate
    evaluation = await evaluate_turn(last_question, answer, language=state.language)
    state.rolling_evaluations.append(evaluation)
    state.turn_index += 1

    # adapt difficulty based on rolling depth+accuracy
    _adapt_difficulty(state)

    done = state.turn_index >= state.max_turns
    if done:
        await store.save(state)
        return AnswerResponse(
            next_question="",
            evaluation=evaluation,
            state=state,
            done=True,
        )

    next_q = await _next_question(state, last_answer=answer)
    state.transcript.append(InterviewTurn(role="interviewer", content=next_q))
    state.asked_questions.append(next_q)
    await store.save(state)

    return AnswerResponse(next_question=next_q, evaluation=evaluation, state=state, done=False)


async def stream_next_question(state: InterviewState,
                               last_answer: Optional[str]) -> AsyncIterator[str]:
    """Stream-friendly variant; not yet wired into REST but ready for SSE upgrade."""
    llm = get_llm()
    sys_prompt, ctx_msgs = await _build_prompt(state, last_answer)
    provider = "anthropic" if state.mode == "project_defense" else None
    async for delta in llm.pick(prefer=provider).stream(
        [{"role": "system", "content": sys_prompt}, *ctx_msgs],
        temperature=0.6, max_tokens=400,
    ):
        yield delta


# ---------- internals ----------

async def _next_question(state: InterviewState, last_answer: Optional[str]) -> str:
    llm = get_llm()
    sys_prompt, ctx_msgs = await _build_prompt(state, last_answer)
    prefer = "anthropic" if state.mode == "project_defense" else None
    text = await llm.chat(
        [{"role": "system", "content": sys_prompt}, *ctx_msgs],
        prefer=prefer, temperature=0.6, max_tokens=400,
    )
    return text.strip().strip("`").strip()


# Public alias used by the realtime voice gateway. Returns (system_prompt, history).
async def build_voice_prompt(state: InterviewState):
    return await _build_prompt(state, last_answer=None)


async def _build_prompt(state: InterviewState, last_answer: Optional[str]):
    already = "; ".join(state.asked_questions[-8:]) or "(none yet)"
    topics = ", ".join(state.topics) or "general backend / Java / Spring"

    if state.mode == "project_defense":
        # craft retrieval query from last Q+A or topics
        query = last_answer or " ".join(state.topics) or "architecture overview"
        hits = await retrieve_context(query=query, source_id=state.source_id, top_k=6)
        context = "\n\n".join(_format_hit(h) for h in hits) or "(no retrieved context)"
        sys_prompt = PROJECT_DEFENSE_SYSTEM.format(
            language=state.language, difficulty=state.difficulty,
            already_asked=already, context=context,
        )
    elif state.mode == "coding":
        sys_prompt = CODING_INTERVIEWER_SYSTEM.format(
            language=state.language, difficulty=state.difficulty,
            topics=topics, already_asked=already,
        )
    elif state.mode == "hr":
        sys_prompt = HR_INTERVIEWER_SYSTEM.format(
            language=state.language, difficulty=state.difficulty,
            already_asked=already,
        )
    else:  # technical
        sys_prompt = INTERVIEWER_SYSTEM.format(
            difficulty=state.difficulty, topics=topics,
            language=state.language, already_asked=already,
        )

    # Provide the last 6 transcript turns as conversational context.
    ctx_msgs = []
    for turn in state.transcript[-6:]:
        role = "assistant" if turn.role == "interviewer" else "user"
        ctx_msgs.append({"role": role, "content": turn.content})
    if not ctx_msgs:
        ctx_msgs = [{"role": "user", "content": "Start the interview."}]
    elif last_answer is not None and ctx_msgs[-1]["role"] != "user":
        ctx_msgs.append({"role": "user", "content": last_answer})
    return sys_prompt, ctx_msgs


def _format_hit(h: dict) -> str:
    p = h.get("payload", {})
    head = f"[{p.get('filename','?')}] (lang={p.get('language','?')}, tech={p.get('technology','')})"
    return head + "\n" + (p.get("text") or "")[:1200]


def _adapt_difficulty(state: InterviewState) -> None:
    """Bump up/down difficulty based on the last 3 evaluations."""
    if len(state.rolling_evaluations) < 3:
        return
    recent = state.rolling_evaluations[-3:]
    score = sum(e.technical_accuracy + e.depth for e in recent) / (2 * len(recent))
    order: list[Difficulty] = ["junior", "mid", "senior", "staff"]
    idx = order.index(state.difficulty) if state.difficulty in order else 1
    if score >= 8 and idx < len(order) - 1:
        state.difficulty = order[idx + 1]
        logger.info(f"adapt: bumping difficulty -> {state.difficulty}")
    elif score <= 4 and idx > 0:
        state.difficulty = order[idx - 1]
        logger.info(f"adapt: lowering difficulty -> {state.difficulty}")
