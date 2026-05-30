"""Per-turn evaluation + final aggregated scoring."""
from __future__ import annotations

import json
import statistics
from typing import List

from loguru import logger

from app.core.llm import get_llm
from app.models.schemas import FinalScore, InterviewState, TurnEvaluation
from app.prompts.interviewer import EVALUATOR_SYSTEM, FINAL_SUMMARY_SYSTEM


async def evaluate_turn(question: str, answer: str, *, language: str) -> TurnEvaluation:
    llm = get_llm()
    user = (
        f"Language: {language}\n\n"
        f"QUESTION:\n{question}\n\n"
        f"CANDIDATE ANSWER:\n{answer}\n"
    )
    try:
        data = await llm.chat_json(
            [{"role": "system", "content": EVALUATOR_SYSTEM},
             {"role": "user",   "content": user}],
            max_tokens=400,
        )
        return TurnEvaluation(
            technical_accuracy=float(data.get("technical_accuracy", 0)),
            clarity=float(data.get("clarity", 0)),
            depth=float(data.get("depth", 0)),
            best_practices=float(data.get("best_practices", 0)),
            confidence=float(data.get("confidence", 0)),
            feedback=str(data.get("feedback", "")),
        )
    except Exception as e:
        logger.warning(f"evaluation failed, using neutral fallback: {e}")
        return TurnEvaluation(
            technical_accuracy=5, clarity=5, depth=5,
            best_practices=5, confidence=5, feedback="(auto)",
        )


async def final_score(state: InterviewState) -> FinalScore:
    llm = get_llm()
    transcript = "\n\n".join(f"[{t.role}] {t.content}" for t in state.transcript)
    rolling = [e.model_dump() for e in state.rolling_evaluations]
    user = json.dumps({
        "language": state.language,
        "topics": state.topics,
        "difficulty": state.difficulty,
        "rolling_evaluations": rolling,
        "transcript": transcript[-8000:],
    }, ensure_ascii=False)

    try:
        data = await llm.chat_json(
            [{"role": "system", "content": FINAL_SUMMARY_SYSTEM},
             {"role": "user",   "content": user}],
            max_tokens=600,
        )
        return FinalScore(**data)
    except Exception as e:
        logger.warning(f"final scoring LLM failed, computing locally: {e}")
        return _local_final(state)


def _local_final(state: InterviewState) -> FinalScore:
    evals = state.rolling_evaluations or []

    def m(key: str) -> float:
        vals = [getattr(e, key) for e in evals] or [5.0]
        return round(statistics.mean(vals), 2)

    ta, cl, dp, bp, cf = m("technical_accuracy"), m("clarity"), m("depth"), m("best_practices"), m("confidence")
    final = round(0.35 * ta + 0.15 * cl + 0.25 * dp + 0.15 * bp + 0.10 * cf, 2)
    if final >= 8.5:    rec = "strong_hire"
    elif final >= 7:    rec = "hire"
    elif final >= 5.5:  rec = "lean_hire"
    else:               rec = "no_hire"
    return FinalScore(
        technical_accuracy=ta, clarity=cl, depth=dp, best_practices=bp, confidence=cf,
        final_score=final, strengths=[], weaknesses=[], recommendation=rec,
    )
