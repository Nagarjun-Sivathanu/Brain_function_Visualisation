import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from app.database import init_db, get_db
from app.seed import seed
from app.brain_graph import run_brain_meeting, build_export  # LangGraph-based orchestrator
from app.agents import build_system_prompt, STAGE_INSTRUCTIONS
from app.models import call_agent_stream, parse_vote

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed()
    from app.models import LLM_BASE_URL, LLM_MODEL
    log.info(f"✓ LLM endpoint: {LLM_MODEL} @ {LLM_BASE_URL}")
    yield


app = FastAPI(title="Brain Region Society", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active meeting queues (meeting_id -> asyncio.Queue)
_meeting_queues: dict[str, asyncio.Queue] = {}
# Per-meeting "proceed to next phase" signals + queued human interjections.
# Kept outside _meeting_queues so they survive an SSE consumer reconnect.
_meeting_proceeds: dict[str, asyncio.Event] = {}
_meeting_interjections: dict[str, list[str]] = {}


# ── Agent Routes ────────────────────────────────────────────────────────────

@app.get("/agents")
async def list_agents():
    async with get_db() as db:
        async with db.execute("SELECT * FROM agents") as cursor:
            rows = await cursor.fetchall()
    agents = []
    for row in rows:
        a = dict(row)
        a["personality_traits"] = json.loads(a["personality_traits"])
        a["expertise"] = json.loads(a["expertise"])
        agents.append(a)
    return agents


@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    async with get_db() as db:
        async with db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    a = dict(row)
    a["personality_traits"] = json.loads(a["personality_traits"])
    a["expertise"] = json.loads(a["expertise"])
    return a


@app.get("/agents/{agent_id}/memories")
async def get_agent_memories(agent_id: str, limit: int = 200):
    """Return memories for an agent. LIMIT was 10 — which silently hid the
    bug where deleting one memory would 'reappear' because the 11th-most-recent
    one slid into its slot. Default is now 200 (the UI manages its own scroll
    container) and the client can override via ?limit=N if it ever needs to.
    """
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?",
            (agent_id, max(1, min(limit, 1000))),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@app.get("/agents/{agent_id}/relationships")
async def get_agent_relationships(agent_id: str):
    async with get_db() as db:
        async with db.execute(
            """
            SELECT r.trust_score, r.interaction_count, a.name AS target_name, a.emoji, a.color
            FROM relationships r
            JOIN agents a ON a.id = r.target_agent_id
            WHERE r.agent_id = ?
            ORDER BY r.trust_score DESC
            """,
            (agent_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ── Memory management ─────────────────────────────────────────────────────

class MemoryUpsertRequest(BaseModel):
    content: str
    memory_type: str = "manual"


@app.post("/agents/{agent_id}/memories")
async def add_agent_memory(agent_id: str, req: MemoryUpsertRequest):
    """Add a hand-written memory to an agent (so the user can seed beliefs)."""
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="content cannot be empty")
    now = datetime.now(timezone.utc).isoformat()
    async with get_db() as db:
        async with db.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)) as cur:
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="agent not found")
        cursor = await db.execute(
            "INSERT INTO memories (agent_id, memory_type, content, meeting_id, created_at) VALUES (?, ?, ?, NULL, ?)",
            (agent_id, req.memory_type, req.content.strip(), now),
        )
        new_id = cursor.lastrowid
        await db.commit()
    return {"id": new_id, "agent_id": agent_id, "content": req.content.strip(), "created_at": now}


@app.put("/agents/{agent_id}/memories/{memory_id}")
async def edit_agent_memory(agent_id: str, memory_id: int, req: MemoryUpsertRequest):
    """Edit the content of one memory entry."""
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="content cannot be empty")
    async with get_db() as db:
        cursor = await db.execute(
            "UPDATE memories SET content = ? WHERE id = ? AND agent_id = ?",
            (req.content.strip(), memory_id, agent_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="memory not found for this agent")
        await db.commit()
    return {"ok": True}


@app.delete("/agents/{agent_id}/memories/{memory_id}")
async def delete_agent_memory(agent_id: str, memory_id: int):
    """Delete one memory entry."""
    async with get_db() as db:
        cursor = await db.execute(
            "DELETE FROM memories WHERE id = ? AND agent_id = ?",
            (memory_id, agent_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="memory not found")
        await db.commit()
    return {"ok": True}


@app.delete("/agents/{agent_id}/memories")
async def reset_agent_memories(agent_id: str):
    """Clear ALL memories for one agent (and reset relationships involving them)."""
    async with get_db() as db:
        async with db.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)) as cur:
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="agent not found")
        m = await db.execute("DELETE FROM memories WHERE agent_id = ?", (agent_id,))
        r = await db.execute(
            "UPDATE relationships SET trust_score = 0.0, interaction_count = 0 WHERE agent_id = ? OR target_agent_id = ?",
            (agent_id, agent_id),
        )
        await db.commit()
    return {"ok": True, "memories_deleted": m.rowcount, "relationships_reset": r.rowcount}


@app.delete("/memories")
async def reset_all_memories():
    """Group-wide reset: clear every memory and reset every relationship to neutral."""
    async with get_db() as db:
        m = await db.execute("DELETE FROM memories")
        r = await db.execute("UPDATE relationships SET trust_score = 0.0, interaction_count = 0")
        await db.commit()
    return {"ok": True, "memories_deleted": m.rowcount, "relationships_reset": r.rowcount}


# ── Meeting Routes ───────────────────────────────────────────────────────────

class MeetingRequest(BaseModel):
    scenario: str
    # Deepest ontology level the recruitment will descend to (2 = divisions only,
    # 3 = current authored regions, 4/5 = once those regions are authored).
    max_level: int = 3
    # Hippocampus group (conversation thread) this meeting belongs to.
    group_id: str | None = None


@app.post("/meetings")
async def create_meeting(req: MeetingRequest):
    meeting_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    group_context = ""
    async with get_db() as db:
        if req.group_id:
            async with db.execute("SELECT condensed FROM memory_groups WHERE id=?", (req.group_id,)) as c:
                row = await c.fetchone()
                group_context = (row["condensed"] if row and row["condensed"] else "")
        await db.execute(
            "INSERT INTO meetings (id, scenario, status, created_at, max_level, group_id) VALUES (?, ?, 'pending', ?, ?, ?)",
            (meeting_id, req.scenario, now, req.max_level, req.group_id),
        )
        await db.commit()

    queue: asyncio.Queue = asyncio.Queue()
    _meeting_queues[meeting_id] = queue

    asyncio.create_task(
        run_brain_meeting(
            meeting_id,
            req.scenario,
            queue,
            max_level=req.max_level,
            group_id=req.group_id,
            group_context=group_context,
        )
    )

    return {
        "meeting_id": meeting_id,
        "scenario": req.scenario,
        "status": "pending",
        "max_level": req.max_level,
        "group_id": req.group_id,
    }


# ── Hippocampus memory groups (ChatGPT-style conversation threads) ───────────

class GroupRequest(BaseModel):
    name: str | None = None


@app.post("/memory_groups")
async def create_group(req: GroupRequest):
    gid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    name = (req.name or "").strip() or f"Session {now[:10]}"
    async with get_db() as db:
        await db.execute(
            "INSERT INTO memory_groups (id, name, created_at, condensed) VALUES (?, ?, ?, '')",
            (gid, name, now),
        )
        await db.commit()
    return {"id": gid, "name": name, "created_at": now, "condensed": "", "meeting_count": 0}


@app.get("/memory_groups")
async def list_groups():
    async with get_db() as db:
        async with db.execute(
            """
            SELECT g.*, (SELECT COUNT(*) FROM meetings m WHERE m.group_id = g.id) AS meeting_count
            FROM memory_groups g ORDER BY g.created_at DESC
            """
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


@app.get("/memory_groups/{group_id}")
async def get_group(group_id: str):
    async with get_db() as db:
        async with db.execute("SELECT * FROM memory_groups WHERE id=?", (group_id,)) as cur:
            g = await cur.fetchone()
        if not g:
            raise HTTPException(status_code=404, detail="group not found")
        async with db.execute(
            "SELECT id, scenario, status, name, created_at FROM meetings WHERE group_id=? ORDER BY created_at ASC",
            (group_id,),
        ) as cur:
            meetings = [dict(r) for r in await cur.fetchall()]
    return {**dict(g), "meetings": meetings}


@app.put("/memory_groups/{group_id}/name")
async def rename_group(group_id: str, req: GroupRequest):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    async with get_db() as db:
        cur = await db.execute("UPDATE memory_groups SET name=? WHERE id=?", (name, group_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="group not found")
        await db.commit()
    return {"ok": True, "name": name}


class ProceedRequest(BaseModel):
    interjection: str | None = None


@app.post("/meetings/{meeting_id}/proceed")
async def proceed_meeting(meeting_id: str, req: ProceedRequest):
    """User clicks 'Proceed' to advance the meeting to the next phase.
    Optional interjection is prepended to the next phase's context as a
    'Human Moderator' message.
    """
    event = _meeting_proceeds.get(meeting_id)
    if event is None:
        raise HTTPException(
            status_code=404,
            detail="No paused phase to advance — meeting unknown or already finished",
        )
    if req.interjection and req.interjection.strip():
        _meeting_interjections.setdefault(meeting_id, []).append(req.interjection.strip())
    event.set()
    return {"ok": True}


@app.get("/meetings")
async def list_meetings():
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM meetings ORDER BY created_at DESC LIMIT 20"
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM meetings WHERE id = ?", (meeting_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return dict(row)


@app.get("/meetings/{meeting_id}/events")
async def get_meeting_events(meeting_id: str):
    """Full ordered, timestamped event log for a meeting — the source of truth
    the frontend replays (and what a saved memory state loads)."""
    async with get_db() as db:
        async with db.execute(
            "SELECT seq, t_ms, type, payload FROM meeting_events WHERE meeting_id = ? ORDER BY seq ASC",
            (meeting_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    events = []
    for r in rows:
        d = dict(r)
        payload = json.loads(d.pop("payload") or "{}")
        events.append({"type": d["type"], "seq": d["seq"], "t_ms": d["t_ms"], **payload})
    return events


@app.get("/meetings/{meeting_id}/export")
async def export_meeting_json(meeting_id: str, download: bool = False):
    """Clean, shareable JSON for a meeting — just the two structured blobs:
    `assessment` (recruited regions + confidence, nested like the anatomy file)
    and `result` (the processing flow + what each region does + final answer).
    Open in a browser to view, or add ?download=1 to save it as a file."""
    async with get_db() as db:
        async with db.execute("SELECT scenario, name, status FROM meetings WHERE id = ?", (meeting_id,)) as c:
            meta = await c.fetchone()
        if not meta:
            raise HTTPException(status_code=404, detail="Meeting not found")
        async with db.execute(
            "SELECT type, payload FROM meeting_events WHERE meeting_id = ? "
            "AND type IN ('assessment_json','result_json') ORDER BY seq ASC",
            (meeting_id,),
        ) as c:
            rows = await c.fetchall()
    assessment, result = None, None
    for r in rows:
        payload = json.loads(r["payload"] or "{}")
        if r["type"] == "assessment_json":
            assessment = payload
        elif r["type"] == "result_json":
            result = payload
    body = build_export(meeting_id, meta["scenario"], meta["name"], meta["status"], assessment, result)
    headers = {"Content-Disposition": f'attachment; filename="meeting_{meeting_id[:8]}.json"'} if download else {}
    # Pretty-print so a downloaded / browser-opened file is human-readable.
    return Response(content=json.dumps(body, indent=2, ensure_ascii=False),
                    media_type="application/json", headers=headers)


class RenameMeetingRequest(BaseModel):
    name: str


@app.put("/meetings/{meeting_id}/name")
async def rename_meeting(meeting_id: str, req: RenameMeetingRequest):
    """Rename a saved memory state (hippocampus session), chat-history style."""
    async with get_db() as db:
        cur = await db.execute(
            "UPDATE meetings SET name = ? WHERE id = ?", (req.name.strip(), meeting_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Meeting not found")
        await db.commit()
    return {"ok": True, "name": req.name.strip()}


@app.get("/meetings/{meeting_id}/messages")
async def get_meeting_messages(meeting_id: str):
    async with get_db() as db:
        async with db.execute(
            """
            SELECT mm.*, a.name AS agent_name, a.emoji, a.color, a.role AS agent_role
            FROM meeting_messages mm
            JOIN agents a ON a.id = mm.agent_id
            WHERE mm.meeting_id = ?
            ORDER BY mm.id ASC
            """,
            (meeting_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@app.get("/meetings/{meeting_id}/votes")
async def get_meeting_votes(meeting_id: str):
    async with get_db() as db:
        async with db.execute(
            """
            SELECT v.*, a.name AS agent_name, a.emoji, a.color, a.role AS agent_role
            FROM votes v
            JOIN agents a ON a.id = v.agent_id
            WHERE v.meeting_id = ?
            """,
            (meeting_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@app.get("/meetings/{meeting_id}/stream")
async def stream_meeting(meeting_id: str):
    """SSE endpoint — streams meeting events as they happen."""
    queue = _meeting_queues.get(meeting_id)
    if queue is None:
        # Meeting already finished or doesn't exist — return stored messages
        raise HTTPException(status_code=404, detail="No active stream for this meeting")

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=120.0)
                except asyncio.TimeoutError:
                    yield "event: heartbeat\ndata: {}\n\n"
                    continue

                data = json.dumps(event)
                yield f"data: {data}\n\n"

                if event.get("type") == "meeting_end":
                    break
        finally:
            _meeting_queues.pop(meeting_id, None)
            _meeting_proceeds.pop(meeting_id, None)
            _meeting_interjections.pop(meeting_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Direct Chat Routes ───────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str


@app.post("/agents/{agent_id}/chat")
async def chat_with_agent(agent_id: str, req: ChatRequest):
    async with get_db() as db:
        async with db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)) as cursor:
            row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent = dict(row)
        agent["personality_traits"] = json.loads(agent["personality_traits"])
        agent["expertise"] = json.loads(agent["expertise"])

        async with db.execute(
            "SELECT content FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT 5",
            (agent_id,),
        ) as cursor:
            memories = [dict(r) for r in await cursor.fetchall()]

        async with db.execute(
            """
            SELECT r.trust_score, a.name AS target_name
            FROM relationships r
            JOIN agents a ON a.id = r.target_agent_id
            WHERE r.agent_id = ? ORDER BY ABS(r.trust_score) DESC
            """,
            (agent_id,),
        ) as cursor:
            relationships = [dict(r) for r in await cursor.fetchall()]

        async with db.execute(
            """
            SELECT role, content FROM chat_messages
            WHERE agent_id = ? AND session_id = ?
            ORDER BY created_at ASC LIMIT 20
            """,
            (agent_id, req.session_id),
        ) as cursor:
            history = [dict(r) for r in await cursor.fetchall()]

    system_prompt = build_system_prompt(agent, memories, relationships)
    messages = history + [{"role": "user", "content": req.message}]

    async def generate():
        full_text = []
        try:
            async for token in call_agent_stream(
                agent["model"], agent["temperature"], system_prompt, messages,
                fallback_model=agent.get("fallback_model"),
            ):
                full_text.append(token)
                yield f"data: {json.dumps({'text': token})}\n\n"
        except Exception as e:
            err = f"[{agent['name']} unreachable: {type(e).__name__}: {str(e)[:160]}]"
            full_text.append(err)
            yield f"data: {json.dumps({'text': err})}\n\n"

        response_text = "".join(full_text)
        now = datetime.now(timezone.utc).isoformat()

        async with get_db() as db2:
            await db2.execute(
                "INSERT INTO chat_messages (agent_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (agent_id, req.session_id, "user", req.message, now),
            )
            await db2.execute(
                "INSERT INTO chat_messages (agent_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (agent_id, req.session_id, "assistant", response_text, now),
            )
            await db2.commit()

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/agents/{agent_id}/chat/{session_id}")
async def get_chat_history(agent_id: str, session_id: str):
    """Return persisted chat history so the UI can restore an existing thread."""
    async with get_db() as db:
        async with db.execute(
            """
            SELECT role, content, created_at FROM chat_messages
            WHERE agent_id = ? AND session_id = ?
            ORDER BY created_at ASC
            """,
            (agent_id, session_id),
        ) as cursor:
            rows = [dict(r) for r in await cursor.fetchall()]
    return rows


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Omniscient Observer bridge diagnostics ─────────────────────────────────
# Diagnostic-only endpoints. The real prompt-injection wiring that *uses*
# the bridge is a separate follow-up (see plan); these just let the user
# verify the bridge is connected from a browser/curl.

from app import observer_bridge  # noqa: E402  — late import to keep startup fast


@app.get("/observer/health")
async def observer_health():
    """Where is Observer reaching from? Used by the UI to grey-out the
    'include context' checkbox when the bridge is down."""
    s = await observer_bridge.get_status()
    return {
        "available": s.available,
        "backend": s.backend,
        "detail": s.detail,
        "last_error": s.last_error,
    }


@app.get("/observer/recent")
async def observer_recent(hours: int = 24, q: str | None = None, limit: int = 20):
    """Quick raw look at what the bridge is currently surfacing.

    - hours: how far back to look (default 24)
    - q:     space-separated keywords to filter observations by (optional)
    - limit: max observations to return
    """
    keywords = [t for t in (q or "").split() if t.strip()]
    activity = await observer_bridge.fetch_recent_activity(hours)
    obs = await observer_bridge.fetch_observations(hours, keywords, limit=limit)
    return {
        "available": await observer_bridge.is_observer_available(),
        "since_hours": hours,
        "keywords": keywords,
        "activity": [
            {"app": a.app, "seconds": a.seconds, "category": a.category, "last_seen": a.last_seen}
            for a in activity
        ],
        "observations": [
            {"when": o.when, "source": o.source, "content": o.content}
            for o in obs
        ],
    }


@app.get("/tools")
async def list_tools():
    """Diagnostic: list the tools the agents can call when enable_tools=True."""
    from app import agent_tools, models as models_mod
    return {
        "tool_names": agent_tools.tool_names(),
        "tool_specs": agent_tools.tool_schemas(),
        "tool_capable_models": sorted(models_mod._TOOL_CAPABLE_MODELS),
    }


@app.get("/observer/briefing_preview")
async def observer_briefing_preview(scenario: str, hours: int | None = None):
    """Preview the briefing that WOULD be sent if include_observer_context=true.
    Used by the frontend preview pane so the user can see exactly what the
    agents will read before they hit Start. Lookback defaults to whatever
    observer_briefing.DEFAULT_LOOKBACK_HOURS is set to (currently 168h)."""
    from app import observer_briefing as briefing_mod
    b = await briefing_mod.build_briefing(
        scenario,
        lookback_hours=hours if hours is not None else briefing_mod.DEFAULT_LOOKBACK_HOURS,
    )
    return b.to_dict()


@app.post("/observer/rescan")
async def observer_rescan():
    """Force the bridge to re-run discovery (handy after you edit .env without
    restarting the server). Returns the new status."""
    observer_bridge.invalidate_discovery_cache()
    s = await observer_bridge.get_status()
    return {
        "available": s.available,
        "backend": s.backend,
        "detail": s.detail,
        "last_error": s.last_error,
    }