"""Bridge between AI Agent Society (WSL Ubuntu) and Omniscient Observer (Windows).

This module is the SINGLE chokepoint for "how do I reach the user's Observer
data". Nothing else in AAS knows whether the data is coming from an HTTP
endpoint on the Windows side or being read directly out of a SQLite file
sitting on /mnt/c/.

Auto-discovery order (first one that responds wins; cached for 60s):

    1. OBSERVER_HTTP_URL              explicit HTTP endpoint
    2. http://host.docker.internal:8765  modern WSL2 default
    3. http://<resolv.conf nameserver>:8765   older WSL2 fallback
    4. OBSERVER_DB_PATH               explicit SQLite path
    5. /mnt/c/Users/$USER/AppData/Local/OmniscientObserver/memory.db (best-guess)
    6. nothing — feature disabled, every public call returns [] / False.

Failure is ALWAYS soft: AAS must keep running fine even when Observer is
unreachable. There is no exception that escapes this module to the rest
of the app.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiosqlite
import httpx

from app.path_bridge import to_wsl_path

log = logging.getLogger("observer_bridge")

# ── Data shapes returned to callers ─────────────────────────────────────────

@dataclass
class ActivityRow:
    app: str
    seconds: int
    category: str | None = None
    last_seen: str | None = None  # ISO timestamp


@dataclass
class Observation:
    when: str               # ISO timestamp
    source: str             # short label, e.g. "ocr", "note"
    content: str            # the text body


@dataclass
class BridgeStatus:
    available: bool
    backend: str | None     # "http" | "sqlite" | None
    detail: str             # human-readable description
    last_error: str | None = None


# ── Discovery + cache ───────────────────────────────────────────────────────

_OBSERVER_HTTP_PORT = int(os.getenv("OBSERVER_HTTP_PORT", "8765"))
_DISCOVERY_CACHE_TTL_SECONDS = 60
_HTTP_TIMEOUT_SECONDS = 1.0


@dataclass
class _Discovery:
    backend: str | None = None    # "http" | "sqlite" | None
    http_url: str | None = None   # full base URL incl. scheme + port
    db_path: str | None = None    # WSL-normalised filesystem path
    detail: str = "not yet checked"
    last_error: str | None = None
    discovered_at: float = field(default_factory=time.time)

    def fresh(self) -> bool:
        return (time.time() - self.discovered_at) < _DISCOVERY_CACHE_TTL_SECONDS


_cached: _Discovery | None = None
_discovery_lock = asyncio.Lock()


def _resolv_conf_nameserver() -> str | None:
    """Find the Windows host IP via WSL2's /etc/resolv.conf (works on older
    WSL builds where host.docker.internal doesn't resolve)."""
    try:
        with open("/etc/resolv.conf", "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("nameserver"):
                    parts = line.split()
                    if len(parts) >= 2 and re.match(r"^\d+\.\d+\.\d+\.\d+$", parts[1]):
                        return parts[1]
    except OSError:
        pass
    return None


def _candidate_http_urls() -> list[str]:
    urls: list[str] = []
    explicit = os.getenv("OBSERVER_HTTP_URL", "").strip()
    if explicit:
        urls.append(explicit.rstrip("/"))
    # host.docker.internal works on Windows 11 + recent Win10 WSL builds.
    urls.append(f"http://host.docker.internal:{_OBSERVER_HTTP_PORT}")
    ns = _resolv_conf_nameserver()
    if ns:
        urls.append(f"http://{ns}:{_OBSERVER_HTTP_PORT}")
    # dedupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _candidate_db_paths() -> list[str]:
    paths: list[str] = []
    explicit = os.getenv("OBSERVER_DB_PATH", "").strip()
    if explicit:
        normalised = to_wsl_path(explicit)
        if normalised:
            paths.append(normalised)
    user = os.getenv("WINDOWS_USERNAME") or os.getenv("USER") or "nagu"
    # Best-guess locations; we just try each in order. None of them are
    # guaranteed to be where OO stores its db — they're a convenience for
    # the auto-discovery path.
    paths.extend([
        f"/mnt/c/Users/{user}/AppData/Local/OmniscientObserver/memory.db",
        f"/mnt/c/Users/{user}/Documents/OmniscientObserver/memory.db",
        f"/mnt/c/Users/{user}/Omniscient Observer/memory.db",
    ])
    return paths


async def _try_http(url: str) -> tuple[bool, str | None]:
    """Returns (ok, error_message). ok=True if the URL behaves like an OO
    dashboard (any 2xx response on /api/health, or fall back to the root
    page returning 200 since the current OO dashboard doesn't have /api/*
    yet — it still proves something HTTP-ish is running there)."""
    health = f"{url}/api/health"
    fallback = f"{url}/"
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            try:
                r = await client.get(health)
                if 200 <= r.status_code < 300:
                    return True, None
            except httpx.HTTPError:
                pass
            r = await client.get(fallback)
            if 200 <= r.status_code < 300:
                return True, None
            return False, f"{fallback} → HTTP {r.status_code}"
    except httpx.HTTPError as e:
        return False, f"{type(e).__name__}: {str(e)[:120]}"


async def _try_sqlite(path: str) -> tuple[bool, str | None]:
    """Returns (ok, error_message). ok=True if we could open the file
    read-only and run a trivial SELECT."""
    if not Path(path).exists():
        return False, "file not found"
    try:
        uri = f"file:{path}?mode=ro&immutable=1"
        async with aiosqlite.connect(uri, uri=True) as db:
            await db.execute("SELECT 1")
        return True, None
    except (aiosqlite.Error, OSError) as e:
        return False, f"{type(e).__name__}: {str(e)[:120]}"


async def _discover() -> _Discovery:
    """Run the discovery cascade. Always returns a Discovery (never raises)."""
    errors: list[str] = []

    # 1–3. HTTP candidates.
    for url in _candidate_http_urls():
        ok, err = await _try_http(url)
        if ok:
            log.info(f"observer bridge: HTTP backend at {url}")
            return _Discovery(backend="http", http_url=url, detail=f"http: {url}")
        if err:
            errors.append(f"http {url}: {err}")

    # 4–5. SQLite candidates.
    for path in _candidate_db_paths():
        ok, err = await _try_sqlite(path)
        if ok:
            log.info(f"observer bridge: SQLite backend at {path}")
            return _Discovery(backend="sqlite", db_path=path, detail=f"sqlite: {path}")
        if err and err != "file not found":
            errors.append(f"sqlite {path}: {err}")

    msg = "no Observer backend found"
    log.info(f"observer bridge: {msg} (tried {len(errors)} candidates)")
    return _Discovery(
        backend=None,
        detail="not configured",
        last_error="; ".join(errors[-3:]) if errors else None,
    )


async def _get_discovery() -> _Discovery:
    """Cached discovery. Re-runs at most once per TTL window."""
    global _cached
    if _cached is not None and _cached.fresh():
        return _cached
    async with _discovery_lock:
        if _cached is not None and _cached.fresh():
            return _cached
        _cached = await _discover()
        return _cached


def invalidate_discovery_cache() -> None:
    """Force the next call to re-run discovery. Useful for tests / after the
    user edits .env without restarting."""
    global _cached
    _cached = None


# ── Public surface ──────────────────────────────────────────────────────────

async def get_status() -> BridgeStatus:
    d = await _get_discovery()
    return BridgeStatus(
        available=d.backend is not None,
        backend=d.backend,
        detail=d.detail,
        last_error=d.last_error,
    )


async def is_observer_available() -> bool:
    return (await _get_discovery()).backend is not None


async def fetch_recent_activity(since_hours: int = 24) -> list[ActivityRow]:
    """Top apps by focus time over the last N hours, newest interaction first."""
    d = await _get_discovery()
    if d.backend == "http":
        return await _http_activity(d.http_url, since_hours)
    if d.backend == "sqlite":
        return await _sqlite_activity(d.db_path, since_hours)
    return []


async def fetch_observations(
    since_hours: int = 24,
    keywords: list[str] | None = None,
    limit: int = 20,
) -> list[Observation]:
    """Recent OCR / note / observation rows. If ``keywords`` is non-empty,
    only rows whose content contains at least one keyword are returned."""
    d = await _get_discovery()
    if d.backend == "http":
        return await _http_observations(d.http_url, since_hours, keywords or [], limit)
    if d.backend == "sqlite":
        return await _sqlite_observations(d.db_path, since_hours, keywords or [], limit)
    return []


# ── HTTP backend implementation ─────────────────────────────────────────────

async def _http_activity(base: str, since_hours: int) -> list[ActivityRow]:
    """Pull activity from Omniscient Observer's real HTTP dashboard.

    OO's actual endpoints (see its dashboard.py):
      GET /api/today  → {"total_seconds": int, "categories": {cat: secs},
                          "top_apps": [{"app_key", "seconds", "category"}…]}
      GET /api/week   → {"daily": [{"date","total_seconds","categories"}…],
                          "top_apps": [{"app_key","seconds","category"}…],
                          "streak":…, "best_day":…}

    For since_hours ≤ 24 we use /api/today; for longer ranges /api/week (which
    covers 7 days regardless of the exact hour count — close enough; the
    consumer treats this as a rough briefing, not a precise audit trail).
    """
    endpoint = "/api/today" if since_hours <= 24 else "/api/week"
    url = f"{base}{endpoint}"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json() or {}
        if not isinstance(data, dict):
            return []
        out: list[ActivityRow] = []
        for item in (data.get("top_apps") or [])[:10]:
            try:
                out.append(ActivityRow(
                    app=str(item.get("app_key") or item.get("app") or ""),
                    seconds=int(item.get("seconds") or 0),
                    category=item.get("category"),
                    last_seen=None,  # the aggregated endpoints don't supply this
                ))
            except (TypeError, ValueError):
                continue
        return out
    except (httpx.HTTPError, ValueError) as e:
        log.warning(f"observer http activity: {type(e).__name__}: {str(e)[:120]}")
        return []


async def _http_observations(
    base: str,
    since_hours: int,
    keywords: list[str],
    limit: int,
) -> list[Observation]:
    """OO's HTTP dashboard exposes daily Obsidian-note titles via
    /api/notes/today. There's no rich observation feed over HTTP yet — for
    deeper text the caller should rely on the SQLite backend.

    Returns notes as Observation rows when available, keyword-filtered.
    """
    url = f"{base}/api/notes/today"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json() or {}
        notes = data.get("notes") or []
        if not isinstance(notes, list):
            return []
        kws = [k.lower() for k in keywords]
        out: list[Observation] = []
        for item in notes:
            # Notes shape from OO is loose — try a few common fields.
            if isinstance(item, dict):
                title = str(item.get("title") or item.get("name") or "")
                body = str(item.get("body") or item.get("preview") or item.get("summary") or "")
                when = str(item.get("created_at") or item.get("ts") or item.get("date") or "")
            else:
                title = str(item)
                body = ""
                when = ""
            content = f"{title}\n{body}".strip()
            if not content:
                continue
            if kws and not any(k in content.lower() for k in kws):
                continue
            out.append(Observation(when=when, source="note", content=content[:1000]))
            if len(out) >= limit:
                break
        return out
    except (httpx.HTTPError, ValueError) as e:
        log.warning(f"observer http observations: {type(e).__name__}: {str(e)[:120]}")
        return []


# ── SQLite backend implementation ──────────────────────────────────────────
#
# Omniscient Observer's exact SQLite schema isn't documented in the README,
# and the code is on the Windows side. The strategy is: probe the file once
# to discover which tables exist (activity, observations, notes, etc.), then
# query whichever ones look applicable. This keeps the bridge robust against
# OO schema changes — if a table is gone, we just skip it.

_SQLITE_RETRIES = 3
_SQLITE_RETRY_DELAY = 0.1


def _sqlite_uri(path: str) -> str:
    return f"file:{path}?mode=ro&immutable=1"


async def _with_retry(coro_factory):
    """Run an aiosqlite operation that opens a fresh connection each time, with
    retries on SQLITE_BUSY. `coro_factory` is a 0-arg callable that returns
    a fresh coroutine each call (we can't `await` twice on the same
    coroutine, and the aiosqlite Connection's thread can only be started
    once — so each retry must construct a brand-new connection)."""
    last_err: Exception | None = None
    for attempt in range(_SQLITE_RETRIES):
        try:
            return await coro_factory()
        except aiosqlite.Error as e:
            last_err = e
            await asyncio.sleep(_SQLITE_RETRY_DELAY * (attempt + 1))
    raise last_err or RuntimeError("could not open Observer SQLite")


async def _table_columns(db: aiosqlite.Connection, table: str) -> list[str]:
    try:
        async with db.execute(f"PRAGMA table_info({table})") as cur:
            return [row[1] for row in await cur.fetchall()]
    except aiosqlite.Error:
        return []


async def _list_tables(db: aiosqlite.Connection) -> list[str]:
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ) as cur:
        return [row[0] for row in await cur.fetchall()]


def _pick(cols: list[str], *candidates: str) -> str | None:
    """First column whose name matches any candidate (case-insensitive)."""
    lower = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand.lower() in lower:
            return lower[cand.lower()]
    return None


async def _sqlite_activity(path: str, since_hours: int) -> list[ActivityRow]:
    try:
        async with aiosqlite.connect(_sqlite_uri(path), uri=True) as db:
            tables = await _list_tables(db)
            # `activity_snapshots` is the real Omniscient Observer table; the
            # other names are fallbacks for other observer-style schemas.
            for tbl in (
                "activity_snapshots", "activity", "activities",
                "active_window", "window_log",
            ):
                if tbl not in tables:
                    continue
                cols = await _table_columns(db, tbl)
                # `app_key` is OO's column; `app`/`application`/etc are fallbacks.
                app_col = _pick(cols, "app_key", "app", "application", "process", "window", "title")
                sec_col = _pick(cols, "seconds", "duration", "duration_seconds", "elapsed")
                cat_col = _pick(cols, "category", "cat", "kind")
                # `ts` is OO's column; longer names are fallbacks.
                ts_col = _pick(
                    cols,
                    "ts", "last_seen", "ended_at", "updated_at",
                    "created_at", "timestamp",
                )
                if not app_col:
                    continue
                # Group by app, sum seconds (if available), within since_hours.
                # If we don't have a usable timestamp column we can't filter by
                # time — just take everything we've got.
                where = ""
                params: list[Any] = []
                if ts_col:
                    where = f"WHERE datetime({ts_col}) >= datetime('now', ?)"
                    params.append(f"-{int(since_hours)} hours")
                sec_expr = f"COALESCE(SUM({sec_col}), 0)" if sec_col else "COUNT(*)"
                cat_expr = f"MAX({cat_col})" if cat_col else "NULL"
                ts_expr = f"MAX({ts_col})" if ts_col else "NULL"
                sql = (
                    f"SELECT {app_col}, {sec_expr}, {cat_expr}, {ts_expr} "
                    f"FROM {tbl} {where} "
                    f"GROUP BY {app_col} "
                    f"ORDER BY 2 DESC LIMIT 10"
                )
                rows: list[ActivityRow] = []
                async with db.execute(sql, params) as cur:
                    async for r in cur:
                        rows.append(ActivityRow(
                            app=str(r[0] or "unknown"),
                            seconds=int(r[1] or 0),
                            category=r[2],
                            last_seen=r[3],
                        ))
                if rows:
                    return rows
            return []
    except Exception as e:
        log.warning(f"observer sqlite activity: {type(e).__name__}: {str(e)[:120]}")
        return []


async def _sqlite_observations(
    path: str,
    since_hours: int,
    keywords: list[str],
    limit: int,
) -> list[Observation]:
    try:
        async with aiosqlite.connect(_sqlite_uri(path), uri=True) as db:
            tables = await _list_tables(db)
            for tbl in ("observations", "notes", "memories", "captures"):
                if tbl not in tables:
                    continue
                cols = await _table_columns(db, tbl)
                # OO stores BOTH `summary` (often empty when no LLM ran) and
                # `ocr_text` (raw screen text). Prefer summary, fall back to
                # ocr_text via COALESCE+NULLIF so we get something useful
                # for every row.
                lower_cols = [c.lower() for c in cols]
                content_candidates = [
                    c for c in ("summary", "content", "text", "body", "note", "ocr_text")
                    if c.lower() in lower_cols
                ]
                if not content_candidates:
                    continue
                # COALESCE(NULLIF(trim(summary),''), NULLIF(trim(ocr_text),''), '') —
                # picks first non-empty.
                content_expr = "COALESCE(" + ", ".join(
                    f"NULLIF(TRIM({c}), '')" for c in content_candidates
                ) + ", '')"
                ts_col = _pick(cols, "ts", "created_at", "captured_at", "timestamp", "when")
                src_col = _pick(cols, "source", "kind", "type", "app")
                where_clauses: list[str] = [f"LENGTH({content_expr}) > 0"]
                params: list[Any] = []
                if ts_col:
                    where_clauses.append(f"datetime({ts_col}) >= datetime('now', ?)")
                    params.append(f"-{int(since_hours)} hours")
                if keywords:
                    or_parts: list[str] = []
                    for kw in keywords[:8]:
                        or_parts.append(f"LOWER({content_expr}) LIKE ?")
                        params.append(f"%{kw.lower()}%")
                    where_clauses.append("(" + " OR ".join(or_parts) + ")")
                where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
                ts_select = ts_col if ts_col else "NULL"
                src_select = src_col if src_col else "NULL"
                order = f"ORDER BY {ts_col} DESC " if ts_col else ""
                sql = (
                    f"SELECT {ts_select}, {src_select}, {content_expr} "
                    f"FROM {tbl} {where_sql} {order}"
                    f"LIMIT {int(limit)}"
                )
                rows: list[Observation] = []
                async with db.execute(sql, params) as cur:
                    async for r in cur:
                        rows.append(Observation(
                            when=str(r[0] or ""),
                            source=str(r[1] or tbl),
                            content=str(r[2] or "")[:1000],
                        ))
                if rows:
                    return rows
            return []
    except Exception as e:
        log.warning(f"observer sqlite observations: {type(e).__name__}: {str(e)[:120]}")
        return []
