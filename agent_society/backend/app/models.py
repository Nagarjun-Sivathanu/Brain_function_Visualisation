"""
LLM router — single OpenAI-compatible endpoint.

The original AI Agent Society spread agents across Groq / OpenRouter / Gemini /
Anthropic. This brain-region edition runs EVERY agent on one shared model: the
Llama-3.3-70B-Instruct served at the lab's OpenAI-compatible endpoint. Switching
model/endpoint is a one-place change here (or via env LLM_BASE_URL / LLM_MODEL).

The public API (call_agent_stream / call_agent_once / call_agent_chat_with_tools
/ call_summary_stream / parse_vote / supports_tools) is kept identical to the
original so the orchestrator and routes are unchanged.
"""
import os
import json
import asyncio
import logging
import random
from typing import AsyncIterator

import httpx
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("models")

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://dgx5.humanbrain.in:8999/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "empty")
LLM_MODEL = os.getenv("LLM_MODEL", "Llama-3.3-70B-Instruct")

# The summary/facilitator stage uses the same model.
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", LLM_MODEL)

_http = httpx.AsyncClient(
    base_url=LLM_BASE_URL,
    headers={"Authorization": f"Bearer {LLM_API_KEY}"},
    timeout=httpx.Timeout(120.0, connect=10.0),
)

RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES = 2

# No tool-calling on this endpoint — the orchestrator falls back to plain text.
_TOOL_CAPABLE_MODELS: set[str] = set()


def supports_tools(model: str) -> bool:
    return False


def _to_messages(system: str, messages: list[dict]) -> list[dict]:
    out = [{"role": "system", "content": system}]
    out.extend(messages)
    return out


async def _backoff(attempt: int) -> None:
    await asyncio.sleep((2 ** attempt) + random.random() * 0.4)


async def call_agent_stream(
    model: str,
    temperature: float,
    system_prompt: str,
    messages: list[dict],
    fallback_model: str | None = None,
) -> AsyncIterator[str]:
    """Stream answer tokens from the endpoint. `model` is accepted for API
    compatibility but every call goes to the configured LLM_MODEL."""
    payload = {
        "model": LLM_MODEL,
        "temperature": float(temperature),
        "max_tokens": 512,
        "stream": True,
        "messages": _to_messages(system_prompt, messages),
    }

    last_err: str | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with _http.stream("POST", "/chat/completions", json=payload) as resp:
                if resp.status_code == 200:
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data = line[6:].strip()
                        if data == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        text = (choices[0].get("delta") or {}).get("content")
                        if text:
                            yield text
                    return
                body = (await resp.aread()).decode("utf-8", errors="replace")
                last_err = f"LLM {resp.status_code}: {body[:200]}"
                if resp.status_code not in RETRY_STATUSES or attempt == MAX_RETRIES:
                    raise RuntimeError(last_err)
                log.warning(f"stream {resp.status_code}, retry {attempt + 1}/{MAX_RETRIES}")
        except (httpx.TransportError, httpx.TimeoutException) as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt == MAX_RETRIES:
                raise RuntimeError(last_err)
        await _backoff(attempt)
    raise RuntimeError(last_err or "LLM stream failed after retries")


async def call_agent_once(
    model: str,
    temperature: float,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 256,
    fallback_model: str | None = None,
) -> str:
    """One-shot (non-streaming) completion."""
    payload = {
        "model": LLM_MODEL,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "messages": _to_messages(system_prompt, messages),
    }
    last_err: str | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = await _http.post("/chat/completions", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            last_err = f"LLM {resp.status_code}: {resp.text[:200]}"
            if resp.status_code not in RETRY_STATUSES or attempt == MAX_RETRIES:
                raise RuntimeError(last_err)
            log.warning(f"once {resp.status_code}, retry {attempt + 1}/{MAX_RETRIES}")
        except (httpx.TransportError, httpx.TimeoutException) as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt == MAX_RETRIES:
                raise RuntimeError(last_err)
        await _backoff(attempt)
    raise RuntimeError(last_err or "LLM request failed after retries")


async def call_agent_chat_with_tools(
    model: str,
    temperature: float,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
    fallback_model: str | None = None,
    max_tokens: int = 768,
) -> dict:
    """This endpoint has no tool-calling — degrade to a plain text completion so
    the orchestrator's tool loop simply returns the text on the first pass."""
    text = await call_agent_once(
        model, temperature, system_prompt, messages, max_tokens=max_tokens
    )
    return {"content": text, "tool_calls": []}


async def call_summary_stream(system_prompt: str, user_message: str):
    """Stream the facilitator's consensus synthesis."""
    messages = [{"role": "user", "content": user_message}]
    async for t in call_agent_stream(SUMMARY_MODEL, 0.4, system_prompt, messages):
        yield t


async def parse_vote(raw: str) -> dict:
    """Parse a vote JSON response, with a fallback-abstain. `_parsed` lets the
    orchestrator distinguish a real parse from a fallback so it can retry."""
    raw = (raw or "").strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1])
    if not raw.startswith("{"):
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw = raw[start: end + 1]
    try:
        data = json.loads(raw)
        position = data.get("position", "abstain")
        if position not in ("for", "against", "abstain"):
            position = "abstain"
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.5))))
        reasoning = str(data.get("reasoning", "No reasoning provided."))
        return {"position": position, "confidence": confidence, "reasoning": reasoning, "_parsed": True}
    except Exception:
        return {
            "position": "abstain",
            "confidence": 0.5,
            "reasoning": raw[:200] if raw else "No response from voting model.",
            "_parsed": False,
        }
