"""Realtime voice gateway.

Bridges a browser WebSocket to OpenAI's Realtime API, while reusing the
existing interview engine for system prompt + RAG context, and the existing
session_store / scoring pipeline for state and final report.

Audio flow (browser <-> us <-> OpenAI):
  - input  : PCM16 mono 24 kHz, base64-encoded chunks ('input_audio_buffer.append')
  - output : PCM16 mono 24 kHz, streamed back as 'response.audio.delta'

Server-side VAD is enabled, so OpenAI handles turn-taking and barge-in
automatically. We forward all events both ways and additionally:
  - keep a partial-transcript buffer per turn
  - on each completed user/assistant turn, append to InterviewState.transcript
  - on disconnect, if requested, run scoring over the accumulated transcript
"""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import httpx
import websockets
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger
from websockets.exceptions import ConnectionClosed

from app.config import get_settings
from app.models.schemas import InterviewState, InterviewTurn
from app.services.interview_engine import build_voice_prompt
from app.services.scoring import evaluate_turn, final_score
from app.services.session_store import get_session_store


REALTIME_URL_TEMPLATE = "wss://api.openai.com/v1/realtime?model={model}"


# ----------------------------- session config -----------------------------

def _voice_for(language: str) -> str:
    # OpenAI Realtime voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse.
    # 'sage' = warm/neutral, good for technical interviews. Override per-language if desired.
    return "sage"


def _build_session_update(state: InterviewState, system_prompt: str) -> Dict[str, Any]:
    """Build the `session.update` payload sent right after connecting.

    Uses the GA Realtime API shape (session.type='realtime', audio nested
    under session.audio.input/output, output_modalities).
    """
    voice_persona = (
        "\n\nCRITICAL VOICE INSTRUCTIONS — OVERRIDE EVERYTHING ELSE:\n"
        "You are a TECHNICAL INTERVIEWER conducting a job interview. "
        "You are NOT a general assistant. You are NOT a chatbot. "
        "You do NOT ask 'What can I do for you?' or 'How can I help you?'. "
        "You do NOT introduce yourself or make small talk. "
        "You ask ONE technical interview question per turn and WAIT for the candidate to answer. "
        "When the session starts, immediately ask your first technical interview question — nothing else. "
        "If the candidate gives an answer, acknowledge it in ONE sentence max, then ask the next question. "
        "Stay in character as an interviewer at all times. "
        "Speak naturally and concisely (1-3 sentences per turn). "
        "Always reply in the same language as the candidate."
    )
    return {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "instructions": system_prompt + "\n\n" + voice_persona,
            "output_modalities": ["audio"],
            "audio": {
                "input": {
                    "format": {"type": "audio/pcm", "rate": 24000},
                    # GA VAD type is "semantic_vad" (not "server_vad" which was beta)
                    "turn_detection": {"type": "semantic_vad"},
                },
                "output": {
                    "format": {"type": "audio/pcm", "rate": 24000},
                    "voice": _voice_for(state.language),
                },
            },
        },
    }


def _seed_history_events(state: InterviewState) -> list[Dict[str, Any]]:
    """Replay the last few turns into the realtime session as text items.
    If no history exists, seed a trigger message so the model asks the first question.
    """
    events: list[Dict[str, Any]] = []
    for turn in state.transcript[-6:]:
        role = "assistant" if turn.role == "interviewer" else "user"
        part_type = "output_text" if role == "assistant" else "input_text"
        events.append({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": role,
                "content": [{"type": part_type, "text": turn.content}],
            },
        })
    # If no prior transcript, inject a trigger so the model knows to start immediately
    if not state.transcript:
        events.append({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text",
                              "text": "Ready. Please begin the interview and ask me your first question now."}],
            },
        })
    return events


# ----------------------------- relay state -----------------------------

@dataclass
class _Turn:
    user_text: str = ""
    assistant_text: str = ""

@dataclass
class _RelayState:
    state: InterviewState
    pending_user: str = ""
    pending_assistant: str = ""
    completed_pairs: list[_Turn] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)


# ----------------------------- main entry point -----------------------------

async def run_voice_session(ws: WebSocket, session_id: str) -> None:
    """Handle one browser <-> us <-> OpenAI session."""
    store = get_session_store()
    state = await store.load(session_id)
    if not state:
        await ws.close(code=4404, reason="interview session not found")
        return

    settings = get_settings()
    if not settings.openai_api_key:
        await ws.send_json({"type": "error", "error": "OPENAI_API_KEY not set on server"})
        await ws.close(code=4500)
        return

    model = settings.openai_realtime_model
    sys_prompt, _ctx = await build_voice_prompt(state)

    relay = _RelayState(state=state)

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
    }
    upstream_url = REALTIME_URL_TEMPLATE.format(model=model)
    logger.info(f"voice: connecting upstream session={session_id} model={model}")

    try:
        async with websockets.connect(upstream_url, additional_headers=headers,
                                       max_size=8 * 1024 * 1024) as upstream:
            # 1) configure the session
            await upstream.send(json.dumps(_build_session_update(state, sys_prompt)))
            # 2) seed prior turns (if any) so the model has context
            for ev in _seed_history_events(state):
                await upstream.send(json.dumps(ev))
            # 3) ask it to start speaking the opening immediately
            await upstream.send(json.dumps({
                "type": "response.create",
                "response": {"output_modalities": ["audio"]},
            }))
            await ws.send_json({"type": "ready", "session_id": session_id,
                                "language": state.language, "mode": state.mode})

            # bidirectional pumps
            done = asyncio.Event()
            t1 = asyncio.create_task(_pump_browser_to_openai(ws, upstream, relay, done))
            t2 = asyncio.create_task(_pump_openai_to_browser(ws, upstream, relay, done))
            await done.wait()
            for t in (t1, t2):
                t.cancel()
            await asyncio.gather(t1, t2, return_exceptions=True)
    except Exception as e:
        logger.exception(f"voice session crashed: {e}")
        try:
            await ws.send_json({"type": "error", "error": str(e)})
        except Exception:
            pass
    finally:
        await _persist_and_score(relay)
        try:
            await ws.close()
        except Exception:
            pass


# ----------------------------- pumps -----------------------------

# Events forwarded from browser -> upstream as-is (audio + control).
_BROWSER_PASSTHROUGH = {
    "input_audio_buffer.append",
    "input_audio_buffer.commit",
    "input_audio_buffer.clear",
    "response.cancel",
    "conversation.item.create",
    "response.create",
    "session.update",
}


async def _pump_browser_to_openai(ws: WebSocket,
                                   upstream,
                                   relay: _RelayState,
                                   done: asyncio.Event) -> None:
    try:
        while not done.is_set():
            msg = await ws.receive_text()
            try:
                evt = json.loads(msg)
            except json.JSONDecodeError:
                continue
            t = evt.get("type")

            if t == "client.bye":
                done.set()
                break

            if t in _BROWSER_PASSTHROUGH:
                await upstream.send(msg)
            else:
                # ignore unknown client events, but log for debugging
                logger.debug(f"voice<-browser: ignored event type={t}")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"browser->openai pump error: {e}")
    finally:
        done.set()


# Events forwarded as-is from upstream to the browser.
# Include BOTH GA names (response.output_audio.*) and legacy beta names
# (response.audio.*) since the code example in the docs still uses the old names.
_OPENAI_PASSTHROUGH = {
    # audio output — GA names
    "response.output_audio.delta",
    "response.output_audio.done",
    "response.output_audio_transcript.delta",
    "response.output_audio_transcript.done",
    # audio output — legacy beta names (kept as fallback)
    "response.audio.delta",
    "response.audio.done",
    "response.audio_transcript.delta",
    "response.audio_transcript.done",
    "response.output_text.delta",
    "response.output_text.done",
    # response lifecycle
    "response.created",
    "response.done",
    "response.cancelled",
    "response.output_item.added",
    "response.output_item.done",
    "response.content_part.added",
    "response.content_part.done",
    # input lifecycle
    "input_audio_buffer.speech_started",
    "input_audio_buffer.speech_stopped",
    "input_audio_buffer.committed",
    "input_audio_buffer.cleared",
    "conversation.item.added",
    "conversation.item.done",
    "conversation.item.created",
    "conversation.item.input_audio_transcription.completed",
    "conversation.item.input_audio_transcription.failed",
    # session lifecycle
    "session.created",
    "session.updated",
    "rate_limits.updated",
    "error",
}


async def _pump_openai_to_browser(ws: WebSocket,
                                   upstream,
                                   relay: _RelayState,
                                   done: asyncio.Event) -> None:
    try:
        async for raw in upstream:
            if isinstance(raw, bytes):
                # Realtime API uses JSON-text, but be defensive.
                raw = raw.decode("utf-8", errors="replace")
            try:
                evt = json.loads(raw)
            except json.JSONDecodeError:
                continue

            t = evt.get("type", "")
            # Log all non-audio-delta events so we can see what OpenAI actually sends
            if t not in ("response.output_audio.delta", "response.audio.delta"):
                logger.info(f"voice <- openai: {t}  {json.dumps(evt)[:200]}")
            _track_transcript(relay, evt)

            if t in _OPENAI_PASSTHROUGH or t.startswith("response.") or t.startswith("input_audio_buffer."):
                try:
                    await ws.send_text(raw)
                except Exception:
                    done.set()
                    break
    except ConnectionClosed:
        pass
    except Exception as e:
        logger.warning(f"openai->browser pump error: {e}")
    finally:
        done.set()


# ----------------------------- transcript capture -----------------------------

def _track_transcript(relay: _RelayState, evt: Dict[str, Any]) -> None:
    """Aggregate user + assistant text deltas into completed Q/A pairs."""
    t = evt.get("type", "")
    # Handle both GA and legacy beta event names
    if t in ("response.output_audio_transcript.delta", "response.audio_transcript.delta"):
        relay.pending_assistant += evt.get("delta", "") or ""
    elif t in ("response.output_audio_transcript.done", "response.audio_transcript.done"):
        text = (evt.get("transcript") or relay.pending_assistant).strip()
        relay.pending_assistant = ""
        if text:
            relay.state.transcript.append(InterviewTurn(role="interviewer", content=text))
            relay.state.asked_questions.append(text)
    elif t == "conversation.item.input_audio_transcription.completed":
        text = (evt.get("transcript") or "").strip()
        if text:
            relay.pending_user = text
            relay.state.transcript.append(InterviewTurn(role="candidate", content=text))
            # pair it with the most recent assistant turn for scoring
            relay.completed_pairs.append(_Turn(
                user_text=text,
                assistant_text=_last_assistant(relay),
            ))
            relay.state.turn_index += 1


def _last_assistant(relay: _RelayState) -> str:
    for turn in reversed(relay.state.transcript):
        if turn.role == "interviewer":
            return turn.content
    return ""


# ----------------------------- finalisation -----------------------------

async def _persist_and_score(relay: _RelayState) -> None:
    state = relay.state
    if not state:
        return
    state.updated_at = time.time()
    try:
        await get_session_store().save(state)
    except Exception as e:
        logger.warning(f"voice: failed to save state: {e}")

    # Score completed pairs in parallel (cheap, non-blocking on disconnect path).
    pairs = relay.completed_pairs
    if not pairs:
        return
    try:
        evals = await asyncio.gather(*[
            evaluate_turn(p.assistant_text, p.user_text, language=state.language)
            for p in pairs
        ])
        state.rolling_evaluations.extend(evals)
        await get_session_store().save(state)
    except Exception as e:
        logger.warning(f"voice: per-turn scoring failed: {e}")


async def compute_final_for(session_id: str):
    s = await get_session_store().load(session_id)
    if not s:
        return None
    return await final_score(s)
