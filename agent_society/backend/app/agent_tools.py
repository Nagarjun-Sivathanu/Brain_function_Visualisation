"""Tools the agents can invoke during a meeting (function-calling).

Design rules:

- Every tool has (a) an OpenAI-style JSON schema for the model's tool list
  and (b) an async Python implementation that returns a JSON-serialisable
  dict. The two stay in lockstep here so the model can never call a tool
  that doesn't exist or pass an arg the implementation can't accept.

- No paid APIs in v1. All sources are public + key-free:
    web_search           DuckDuckGo HTML
    search_arxiv         arXiv API (export.arxiv.org)
    search_semantic_scholar Semantic Scholar Graph API
    convert_currency     Frankfurter.app (ECB rates)
    search_hackernews    Algolia HN search
    wikipedia_summary    Wikipedia REST API summary endpoint
    current_datetime     local time (no network) — grounds 'deadline'/'today' reasoning

- Per-call timeout (5s), per-tool in-memory TTL cache (5 min) keyed by the
  arg JSON so the 6 agents in a sequential meeting don't pay N× the cost
  when they all ask the same thing.

- Soft failure: a tool that errors returns {"error": "..."} — never raises.
  The model sees the error and can pivot. This is how OpenAI's docs
  recommend doing it for free-tier reliability.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from urllib.parse import unquote, parse_qs, urlparse
from xml.etree import ElementTree as ET

import httpx

log = logging.getLogger("agent_tools")

_TIMEOUT_S = 5.0
_PER_TOOL_TIMEOUT: dict[str, float] = {
    # arXiv's anonymous API can be slow under load; give it more headroom.
    "search_arxiv": 12.0,
    # Semantic Scholar's free tier rate-limits aggressively; if it does
    # respond, the response itself is fast, so 8s is plenty.
    "search_semantic_scholar": 8.0,
}
_CACHE_TTL_S = 300  # 5 min
_USER_AGENT = "ai-agent-society/0.1 (https://github.com/Nagarjun-Sivathanu/Ai-agent-Society)"

_cache: dict[str, tuple[float, dict]] = {}


def _cache_key(tool: str, args: dict) -> str:
    return f"{tool}:{json.dumps(args, sort_keys=True, default=str)}"


def _cache_get(key: str) -> dict | None:
    hit = _cache.get(key)
    if not hit:
        return None
    ts, value = hit
    if (time.time() - ts) > _CACHE_TTL_S:
        del _cache[key]
        return None
    return value


def _cache_put(key: str, value: dict) -> None:
    _cache[key] = (time.time(), value)


# ── Tool implementations ────────────────────────────────────────────────────


async def _http_get(
    url: str,
    *,
    params: dict | None = None,
    text: bool = False,
    retry_statuses: tuple[int, ...] = (429, 502, 503, 504),
    retries: int = 2,
    timeout: float | None = None,
) -> Any:
    """Generic GET. Retries with backoff on rate-limit / transient 5xx.
    Returns parsed JSON, or raw text if text=True.
    """
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(
                timeout=timeout if timeout is not None else _TIMEOUT_S,
                headers={"User-Agent": _USER_AGENT},
                follow_redirects=True,
            ) as client:
                r = await client.get(url, params=params)
                if r.status_code in retry_statuses and attempt < retries:
                    # Honour Retry-After if set; else backoff exponentially.
                    delay = 0.5 * (2 ** attempt)
                    ra = r.headers.get("Retry-After")
                    if ra and ra.isdigit():
                        delay = min(float(ra), 3.0)
                    await asyncio.sleep(delay)
                    continue
                r.raise_for_status()
                return r.text if text else r.json()
        except (httpx.HTTPError, asyncio.TimeoutError) as e:
            last_exc = e
            if attempt < retries:
                await asyncio.sleep(0.5 * (2 ** attempt))
                continue
            raise
    if last_exc:
        raise last_exc


async def _http_json(url: str, *, params: dict | None = None) -> Any:
    return await _http_get(url, params=params, text=False)


async def _http_text(url: str, *, params: dict | None = None) -> str:
    return await _http_get(url, params=params, text=True)


# 1. DuckDuckGo web search ─────────────────────────────────────────────────
#
# DDG's lite endpoint wraps result links through //duckduckgo.com/l/?uddg=<encoded-target>
# Markup (current as of 2026-05): consecutive sibling <a> + snippet, separated
# by tags so a single regex over the redirect-style hrefs + the next snippet
# block is the most resilient extraction.

_DDG_LINK_RE = re.compile(
    r'href="(//duckduckgo\.com/l/\?uddg=[^"]+)"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
_DDG_SNIPPET_RE = re.compile(
    r'<td[^>]+class="result-snippet"[^>]*>(.*?)</td>',
    re.DOTALL | re.IGNORECASE,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _ddg_decode(redirect_href: str) -> str:
    # The href is //duckduckgo.com/l/?uddg=…&rut=… — we want the uddg target.
    href = redirect_href
    if href.startswith("//"):
        href = "https:" + href
    qs = parse_qs(urlparse(href).query)
    target = qs.get("uddg", [""])[0]
    return unquote(target) if target else href


async def web_search(query: str, max_results: int = 5) -> dict:
    """Public web search via DuckDuckGo HTML (no key, no rate-card)."""
    try:
        html = await _http_text(
            "https://lite.duckduckgo.com/lite/", params={"q": query}
        )
        links = _DDG_LINK_RE.findall(html)
        # Snippets appear in the SAME order as the result links — zip them up,
        # but tolerate cases where there are more links than snippets.
        snippet_blocks = _DDG_SNIPPET_RE.findall(html)
        snippets = [
            re.sub(r"\s+", " ", _TAG_RE.sub(" ", s)).strip()
            for s in snippet_blocks
        ]
        hits: list[dict] = []
        for i, (href, title) in enumerate(links):
            if not title.strip() or "duckduckgo.com" in title.lower():
                continue
            hits.append({
                "title": re.sub(r"\s+", " ", title).strip()[:200],
                "url": _ddg_decode(href),
                "snippet": (snippets[i] if i < len(snippets) else "")[:400],
            })
            if len(hits) >= max_results:
                break
        return {"query": query, "results": hits, "count": len(hits)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


# 2. arXiv ────────────────────────────────────────────────────────────────

_ARXIV_NS = {"a": "http://www.w3.org/2005/Atom"}


async def search_arxiv(query: str, max_results: int = 5) -> dict:
    """Search arXiv for papers by query. Returns title + summary + authors + url."""
    try:
        xml_text = await _http_get(
            "https://export.arxiv.org/api/query",
            params={
                "search_query": f"all:{query}",
                "max_results": max_results,
                "sortBy": "relevance",
                "sortOrder": "descending",
            },
            text=True,
            timeout=10.0,
            retries=1,
        )
        root = ET.fromstring(xml_text)
        papers: list[dict] = []
        for entry in root.findall("a:entry", _ARXIV_NS):
            title = (entry.findtext("a:title", default="", namespaces=_ARXIV_NS) or "").strip()
            summary = (entry.findtext("a:summary", default="", namespaces=_ARXIV_NS) or "").strip()
            url = (entry.findtext("a:id", default="", namespaces=_ARXIV_NS) or "").strip()
            authors = [
                (a.findtext("a:name", default="", namespaces=_ARXIV_NS) or "").strip()
                for a in entry.findall("a:author", _ARXIV_NS)
            ]
            published = entry.findtext("a:published", default="", namespaces=_ARXIV_NS) or ""
            papers.append({
                "title": re.sub(r"\s+", " ", title),
                "authors": [a for a in authors if a][:5],
                "summary": re.sub(r"\s+", " ", summary)[:600],
                "url": url,
                "published": published[:10],
            })
        return {"query": query, "papers": papers, "count": len(papers)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


# 3. Semantic Scholar ─────────────────────────────────────────────────────


async def search_semantic_scholar(query: str, max_results: int = 5) -> dict:
    """Search Semantic Scholar for papers; returns titles + abstracts + citation counts."""
    try:
        data = await _http_json(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            params={
                "query": query,
                "limit": max_results,
                "fields": "title,abstract,authors,year,citationCount,url,venue",
            },
        )
        papers = []
        for p in (data or {}).get("data", []):
            papers.append({
                "title": (p.get("title") or "").strip(),
                "abstract": ((p.get("abstract") or "")[:600]),
                "authors": [a.get("name", "") for a in (p.get("authors") or [])][:5],
                "year": p.get("year"),
                "citations": p.get("citationCount"),
                "venue": p.get("venue") or "",
                "url": p.get("url") or "",
            })
        return {"query": query, "papers": papers, "count": len(papers)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


# 4. Currency conversion via Frankfurter ──────────────────────────────────


async def convert_currency(amount: float, from_currency: str, to_currency: str) -> dict:
    """Convert `amount` from one currency to another at the current ECB mid-rate.

    Currency codes are 3-letter ISO 4217 (USD, EUR, INR, JPY, ...)."""
    try:
        from_ = (from_currency or "").upper().strip()
        to_ = (to_currency or "").upper().strip()
        if not (len(from_) == 3 and len(to_) == 3):
            return {"error": "currency codes must be 3-letter ISO codes (e.g. USD, EUR, INR)"}
        if from_ == to_:
            return {
                "amount": float(amount),
                "from": from_,
                "to": to_,
                "result": float(amount),
                "rate": 1.0,
                "as_of": datetime.now(timezone.utc).date().isoformat(),
            }
        data = await _http_json(
            "https://api.frankfurter.dev/v1/latest",
            params={"amount": amount, "base": from_, "symbols": to_},
        )
        rates = (data or {}).get("rates") or {}
        if to_ not in rates:
            return {"error": f"no rate returned for {from_}→{to_}"}
        return {
            "amount": float(amount),
            "from": from_,
            "to": to_,
            "result": float(rates[to_]),
            "rate": float(rates[to_]) / float(amount) if amount else 0.0,
            "as_of": data.get("date", ""),
        }
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


# 5. Hacker News (Algolia) ────────────────────────────────────────────────


async def search_hackernews(query: str, max_results: int = 5) -> dict:
    """Search Hacker News stories + comments via Algolia (no key)."""
    try:
        data = await _http_json(
            "https://hn.algolia.com/api/v1/search",
            params={"query": query, "tags": "story", "hitsPerPage": max_results},
        )
        hits = []
        for h in (data or {}).get("hits", []):
            hits.append({
                "title": h.get("title") or h.get("story_title") or "",
                "url": h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                "author": h.get("author"),
                "points": h.get("points"),
                "comments": h.get("num_comments"),
                "created_at": h.get("created_at", "")[:10],
            })
        return {"query": query, "stories": hits, "count": len(hits)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


# 6. Wikipedia ────────────────────────────────────────────────────────────


async def wikipedia_summary(topic: str) -> dict:
    """Plain-text REST summary of a Wikipedia topic. Useful for canonical defs."""
    try:
        slug = topic.strip().replace(" ", "_")
        data = await _http_json(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}",
            params={"redirect": "true"},
        )
        return {
            "topic": topic,
            "title": data.get("title", ""),
            "summary": (data.get("extract") or "")[:1200],
            "url": (data.get("content_urls", {}) or {}).get("desktop", {}).get("page", ""),
        }
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


# 7. Current date/time (no network — grounds 'today'/'deadline' reasoning) ─


async def current_datetime() -> dict:
    """Return the current date + time (UTC and local-WSL) so agents can ground
    references to 'today', 'this quarter', deadlines, etc. instead of relying
    on the model's stale training-cutoff intuition."""
    now_utc = datetime.now(timezone.utc)
    now_local = datetime.now()
    return {
        "iso_utc": now_utc.isoformat(),
        "iso_local": now_local.isoformat(),
        "date": now_local.date().isoformat(),
        "year": now_local.year,
        "month": now_local.month,
        "weekday": now_local.strftime("%A"),
    }


# ── Registry ────────────────────────────────────────────────────────────────

ToolImpl = Callable[..., Awaitable[dict]]

_REGISTRY: dict[str, tuple[ToolImpl, dict]] = {
    "web_search": (
        web_search,
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": (
                    "Search the public web (DuckDuckGo) for general information, current "
                    "events, products, companies, or anything not in your training data. "
                    "Use this when you need up-to-date facts or to verify a claim."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "max_results": {
                            "type": "integer",
                            "description": "Max results (default 5, hard cap 10)",
                            "default": 5,
                        },
                    },
                    "required": ["query"],
                },
            },
        },
    ),
    "search_arxiv": (
        search_arxiv,
        {
            "type": "function",
            "function": {
                "name": "search_arxiv",
                "description": (
                    "Search arXiv for academic papers. Returns title, authors, abstract, "
                    "publication date, and URL. Use for technical/scientific claims that "
                    "should be grounded in research."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "max_results": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        },
    ),
    "search_semantic_scholar": (
        search_semantic_scholar,
        {
            "type": "function",
            "function": {
                "name": "search_semantic_scholar",
                "description": (
                    "Search Semantic Scholar for academic papers with citation counts. "
                    "Complements arXiv with non-arXiv venues. Returns title, abstract, "
                    "venue, year, citation count."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        },
    ),
    "convert_currency": (
        convert_currency,
        {
            "type": "function",
            "function": {
                "name": "convert_currency",
                "description": (
                    "Convert an amount between two currencies at the current ECB rate. "
                    "Use when discussing pricing, budgets, or international comparisons."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": {"type": "number"},
                        "from_currency": {
                            "type": "string",
                            "description": "3-letter ISO code, e.g. USD, EUR, INR",
                        },
                        "to_currency": {
                            "type": "string",
                            "description": "3-letter ISO code, e.g. USD, EUR, INR",
                        },
                    },
                    "required": ["amount", "from_currency", "to_currency"],
                },
            },
        },
    ),
    "search_hackernews": (
        search_hackernews,
        {
            "type": "function",
            "function": {
                "name": "search_hackernews",
                "description": (
                    "Search Hacker News stories for tech-community discussion of a topic. "
                    "Returns title, URL, author, points, and comment count. Useful for "
                    "gauging community sentiment on a tool, technique, or trend."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        },
    ),
    "wikipedia_summary": (
        wikipedia_summary,
        {
            "type": "function",
            "function": {
                "name": "wikipedia_summary",
                "description": (
                    "Get the canonical Wikipedia summary for a topic. Best for "
                    "definitions, historical context, or background on a concept."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string"},
                    },
                    "required": ["topic"],
                },
            },
        },
    ),
    "current_datetime": (
        current_datetime,
        {
            "type": "function",
            "function": {
                "name": "current_datetime",
                "description": (
                    "Get the current date and time. Use this before reasoning about "
                    "'today', deadlines, ages, or recency — your training data is older "
                    "than the actual current date."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
    ),
}


def tool_schemas() -> list[dict]:
    """List of OpenAI-style tool specs to send with each model call."""
    return [spec for _impl, spec in _REGISTRY.values()]


async def run_tool(name: str, args: dict) -> dict:
    """Execute a tool by name with the JSON args the model emitted.

    Always returns a JSON-serialisable dict. Errors come back as
    {"error": "..."} so the model can read them and pivot instead of the
    whole agent turn crashing.
    """
    if name not in _REGISTRY:
        return {"error": f"unknown tool: {name}. Available: {sorted(_REGISTRY)}"}

    # Cache hit?
    key = _cache_key(name, args)
    cached = _cache_get(key)
    if cached is not None:
        return {**cached, "_cached": True}

    impl, _spec = _REGISTRY[name]
    try:
        timeout = _PER_TOOL_TIMEOUT.get(name, _TIMEOUT_S)
        result = await asyncio.wait_for(impl(**(args or {})), timeout=timeout)
        if not isinstance(result, dict):
            result = {"result": result}
        _cache_put(key, result)
        return result
    except asyncio.TimeoutError:
        return {"error": f"tool {name} timed out after {timeout}s"}
    except TypeError as e:
        return {"error": f"bad args for tool {name}: {str(e)[:200]}"}
    except Exception as e:
        log.warning(f"tool {name} crashed: {type(e).__name__}: {str(e)[:200]}")
        return {"error": f"{type(e).__name__}: {str(e)[:200]}"}


def tool_names() -> list[str]:
    return sorted(_REGISTRY.keys())
