"""Unified LLM client with provider priority and graceful fallback.

Providers:
  - openai     : GPT-4.1 (primary)
  - anthropic  : Claude Sonnet 4 (long-context / repo analysis fallback)
  - groq       : Llama 4 Scout (budget fallback, OpenAI-compatible)

All providers expose the same `chat(messages, **opts) -> str` and
`stream(messages, **opts) -> AsyncIterator[str]` shape.
"""
from __future__ import annotations

import json
from typing import AsyncIterator, Dict, List, Optional

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import Settings, get_settings


ChatMessage = Dict[str, str]  # {"role": "system|user|assistant", "content": "..."}


class LLMError(RuntimeError):
    pass


class _BaseProvider:
    name: str = "base"

    def available(self) -> bool:
        return False

    async def chat(self, messages: List[ChatMessage], *, temperature: float = 0.3,
                   max_tokens: int = 1024, response_format: Optional[Dict] = None) -> str:
        raise NotImplementedError

    async def stream(self, messages: List[ChatMessage], *, temperature: float = 0.3,
                     max_tokens: int = 1024) -> AsyncIterator[str]:
        raise NotImplementedError


# -------------------- OpenAI-compatible (OpenAI + Groq) --------------------

class _OpenAICompatProvider(_BaseProvider):
    def __init__(self, name: str, api_key: str, base_url: str, model: str):
        self.name = name
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def available(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4))
    async def chat(self, messages, *, temperature=0.3, max_tokens=1024, response_format=None):
        body: Dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            body["response_format"] = response_format
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(f"{self.base_url}/chat/completions",
                                  headers=self._headers(), json=body)
            if r.status_code >= 400:
                raise LLMError(f"{self.name} chat failed {r.status_code}: {r.text[:300]}")
            data = r.json()
            return data["choices"][0]["message"]["content"] or ""

    async def stream(self, messages, *, temperature=0.3, max_tokens=1024):
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{self.base_url}/chat/completions",
                                     headers=self._headers(), json=body) as r:
                if r.status_code >= 400:
                    raise LLMError(f"{self.name} stream failed {r.status_code}")
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                        delta = chunk["choices"][0]["delta"].get("content") or ""
                        if delta:
                            yield delta
                    except Exception:
                        continue


# -------------------- Anthropic --------------------

class _AnthropicProvider(_BaseProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self.base_url = "https://api.anthropic.com/v1"

    def available(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

    @staticmethod
    def _split_system(messages: List[ChatMessage]) -> tuple[str, List[ChatMessage]]:
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        rest = [m for m in messages if m["role"] != "system"]
        return system, rest

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4))
    async def chat(self, messages, *, temperature=0.3, max_tokens=1024, response_format=None):
        system, rest = self._split_system(messages)
        body = {
            "model": self.model,
            "system": system,
            "messages": rest,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{self.base_url}/messages", headers=self._headers(), json=body)
            if r.status_code >= 400:
                raise LLMError(f"anthropic chat failed {r.status_code}: {r.text[:300]}")
            data = r.json()
            parts = data.get("content", [])
            return "".join(p.get("text", "") for p in parts if p.get("type") == "text")

    async def stream(self, messages, *, temperature=0.3, max_tokens=1024):
        system, rest = self._split_system(messages)
        body = {
            "model": self.model, "system": system, "messages": rest,
            "max_tokens": max_tokens, "temperature": temperature, "stream": True,
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{self.base_url}/messages",
                                     headers=self._headers(), json=body) as r:
                if r.status_code >= 400:
                    raise LLMError(f"anthropic stream failed {r.status_code}")
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    try:
                        evt = json.loads(line[5:].strip())
                        if evt.get("type") == "content_block_delta":
                            delta = evt.get("delta", {}).get("text", "")
                            if delta:
                                yield delta
                    except Exception:
                        continue


# -------------------- Registry --------------------

class LLMRouter:
    """Picks a provider from the configured priority list."""

    def __init__(self, s: Settings):
        self._providers: Dict[str, _BaseProvider] = {
            "openai":    _OpenAICompatProvider("openai", s.openai_api_key, s.openai_base_url, s.openai_model),
            "anthropic": _AnthropicProvider(s.anthropic_api_key, s.anthropic_model),
            "groq":      _OpenAICompatProvider("groq", s.groq_api_key, s.groq_base_url, s.groq_model),
        }
        self._priority = s.providers

    def pick(self, prefer: Optional[str] = None) -> _BaseProvider:
        order = [prefer] + self._priority if prefer else self._priority
        for name in order:
            p = self._providers.get(name)
            if p and p.available():
                return p
        raise LLMError("no LLM provider is configured (set OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY)")

    async def chat(self, messages: List[ChatMessage], *, prefer: Optional[str] = None, **opts) -> str:
        last_err: Optional[Exception] = None
        order = [prefer] + self._priority if prefer else self._priority
        seen: set[str] = set()
        for name in order:
            if not name or name in seen:
                continue
            seen.add(name)
            p = self._providers.get(name)
            if not p or not p.available():
                continue
            try:
                return await p.chat(messages, **opts)
            except Exception as e:
                logger.warning(f"LLM provider {name} failed, trying next: {e}")
                last_err = e
        raise LLMError(f"all LLM providers failed: {last_err}")

    async def chat_json(self, messages: List[ChatMessage], *, prefer: Optional[str] = None,
                        max_tokens: int = 1024) -> Dict:
        """Request JSON. We softly enforce by appending a JSON-only system rule."""
        sys_msg = {"role": "system", "content": "Respond ONLY with a single valid JSON object, no prose, no markdown fences."}
        msgs = [sys_msg] + messages
        raw = await self.chat(msgs, prefer=prefer, temperature=0.1, max_tokens=max_tokens,
                              response_format={"type": "json_object"})
        return _safe_json(raw)


def _safe_json(text: str) -> Dict:
    text = text.strip()
    if text.startswith("```"):
        # strip fenced block
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    # find first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


_router: Optional[LLMRouter] = None


def get_llm() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter(get_settings())
    return _router
