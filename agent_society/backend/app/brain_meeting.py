"""
Brain-meeting orchestrator (the "new meeting style").

Replaces the generic 5-stage office meeting with a brain-faithful flow:

  seat level-2 divisions → self-assessment of sub-regions → recruit the needed
  regions one-by-one from the waiting room → Round 1 (each states its
  contribution + which regions it triggers, as typed edges) → Round 2
  (deliberate, propose a realistic ordered flow, vote) → bilateral merge of
  matching left/right pairs → implementation room (each speaks in flow order) →
  Brain gives the final integrated answer → hippocampus saves the session.

Everything is emitted as timestamped events that are BOTH streamed (SSE) and
persisted to `meeting_events`, so the UI, terminal view, replay and memory
states are all a pure function of the event log.
"""
import json
import time
import asyncio
import logging
from datetime import datetime, timezone

from app.database import get_db
from app.agents import build_system_prompt, AGENT_DEFINITIONS
from app.models import call_agent_stream, call_agent_once, call_summary_stream, parse_vote
from app import brain_ontology as onto

log = logging.getLogger("brain_meeting")

CONF_THRESHOLD = 0.55
MAX_RECRUITS = 10  # baseline cap; deeper meetings get more headroom (see below)
_AGENT_BY_ID = {a["id"]: a for a in AGENT_DEFINITIONS}


def _recruit_cap(max_level: int) -> int:
    """Deeper meetings recruit more regions (so the cascade can reach L4/L5)."""
    return min(8 + 3 * max(0, max_level - 2), 18)


# ── event emitter (queue + persistence + timeline metadata) ─────────────────
class Emitter:
    def __init__(self, meeting_id: str, queue: asyncio.Queue):
        self.meeting_id = meeting_id
        self.queue = queue
        self.seq = 0
        self.t0 = time.monotonic()

    async def emit(self, type: str, **payload):
        self.seq += 1
        t_ms = int((time.monotonic() - self.t0) * 1000)
        event = {"type": type, "seq": self.seq, "t_ms": t_ms, **payload}
        await self.queue.put(event)
        try:
            async with get_db() as db:
                await db.execute(
                    "INSERT OR REPLACE INTO meeting_events (meeting_id, seq, t_ms, type, payload) VALUES (?, ?, ?, ?, ?)",
                    (self.meeting_id, self.seq, t_ms, type, json.dumps(payload)),
                )
                await db.commit()
        except Exception as e:
            log.warning(f"event persist failed: {e}")
        return event


def _parse_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    if not raw.startswith("{"):
        s, e = raw.find("{"), raw.rfind("}")
        if s != -1 and e != -1 and e > s:
            raw = raw[s:e + 1]
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _agent(region_id: str) -> dict:
    a = _AGENT_BY_ID.get(region_id)
    if a:
        return a
    # Generic agent for regions without an authored definition (Phase 2 fills these).
    return {
        "id": region_id,
        "name": onto.display_name(region_id).title(),
        "role": "Brain region",
        "emoji": "•", "color": "#9ca3af", "temperature": 0.4,
        "model": "Llama-3.3-70B-Instruct", "fallback_model": None,
        "personality_traits": [], "expertise": [],
    }


def _sys(region_id: str) -> str:
    return build_system_prompt(_agent(region_id), [], [])


def _transcript(entries: list[dict]) -> str:
    return "\n".join(f"  {e['name']} ({e['stage']}): {e['text']}" for e in entries) or "  (nothing yet)"


def _similar(a: str, b: str) -> float:
    sa, sb = set((a or "").lower().split()), set((b or "").lower().split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ── main flow ───────────────────────────────────────────────────────────────
async def run_brain_meeting(
    meeting_id: str,
    scenario: str,
    queue: asyncio.Queue,
    max_level: int = 3,
    group_id: str | None = None,
    group_context: str = "",
):
    em = Emitter(meeting_id, queue)
    log.info(f"[brain-meeting {meeting_id[:8]}] START {scenario!r} maxlvl={max_level} group={group_id}")
    transcript: list[dict] = []
    # Prior session memory (the hippocampus group) injected into every prompt so
    # regions can refer back to earlier questions in the same conversation.
    mem = f"Earlier in this session (hippocampus memory):\n{group_context}\n\n" if group_context else ""
    cap = _recruit_cap(max_level)

    async def stream_region(region_id: str, stage: str, system: str, user: str) -> str:
        await em.emit("agent_start", agent_id=region_id, stage=stage)
        parts: list[str] = []
        try:
            async for tok in call_agent_stream(_agent(region_id)["model"], _agent(region_id)["temperature"], system, [{"role": "user", "content": user}]):
                parts.append(tok)
                await em.emit("token", agent_id=region_id, text=tok)
        except Exception as e:
            log.warning(f"{region_id} stream failed: {e}")
        await em.emit("agent_end", agent_id=region_id)
        return "".join(parts).strip()

    try:
        async with get_db() as db:
            await db.execute("UPDATE meetings SET status='running' WHERE id=?", (meeting_id,))
            await db.commit()

        await em.emit("meeting_started", scenario=scenario, max_level=max_level)

        # ── 1. Seat the level-2 divisions in the meeting room ────────────────
        divisions = [d for d in onto.divisions() if d in _AGENT_BY_ID]
        await em.emit("stage_change", stage="assessment")
        for i, d in enumerate(divisions):
            await em.emit("seat", agent_id=d, room="meeting", seat="main", index=i)

        # ── 2+3. Top-down cascade: assess children and recruit involved ones,
        #         descending the hierarchy until max_level (BFS). A region only
        #         assesses its children once it is itself present in the room.
        async def assess_children(parent: str) -> list[dict]:
            kids = [k for k in onto.children(parent)
                    if k in _AGENT_BY_ID and onto.level_of(k) <= max_level]
            if not kids:
                return []
            kid_names = [onto.display_name(k) for k in kids]
            schema = ('{"assessments":[{"region":"<name>","involved":true|false,'
                      '"confidence":0.0-1.0,"reason":"short biological reason"}]}')
            user = (f"{mem}Scenario: {scenario}\n\nYour candidate sub-regions:\n"
                    + "\n".join(f"- {n}" for n in kid_names)
                    + f"\n\nWhich are involved in this scenario? Reply ONLY JSON:\n{schema}")
            await em.emit("agent_start", agent_id=parent, stage="assessment")
            raw = await call_agent_once(_agent(parent)["model"], 0.2, _sys(parent), [{"role": "user", "content": user}], max_tokens=600)
            await em.emit("agent_end", agent_id=parent)
            picks = []
            valid = set(kids)
            for a in _parse_json(raw).get("assessments", []):
                rid = onto.to_id(str(a.get("region", "")))
                if rid in valid:
                    picks.append({"region": rid, "confidence": round(float(a.get("confidence", 0.0) or 0.0), 2),
                                  "involved": bool(a.get("involved", False)), "reason": a.get("reason", "")})
            await em.emit("assess", agent_id=parent, picks=picks)
            return picks

        await em.emit("stage_change", stage="recruitment")
        present: set[str] = set(divisions)
        active: list[str] = []
        to_assess: list[str] = list(divisions)
        while to_assess and len(active) < cap:
            parent = to_assess.pop(0)
            for pick in await assess_children(parent):
                if not pick["involved"] or pick["confidence"] < CONF_THRESHOLD:
                    continue
                rid = pick["region"]
                if rid in present or len(active) >= cap:
                    continue
                reason = f"{onto.display_name(parent)} flagged {onto.display_name(rid)} as involved (conf {pick['confidence']:.2f})"
                await em.emit("summon", agent_id=rid, caller_id=parent, reason=reason)
                await em.emit("move", agent_id=rid, room="meeting")
                present.add(rid)
                active.append(rid)
                if onto.level_of(rid) < max_level:
                    to_assess.append(rid)  # this region will assess its own children
                await asyncio.sleep(0.35)

        if not active:
            # Nothing crossed threshold — let the divisions themselves act.
            active = list(divisions)

        # ── 4. Round 1: contribution + typed interaction edges ───────────────
        await em.emit("stage_change", stage="round1")
        i = 0
        while i < len(active):
            rid = active[i]; i += 1
            conns = [onto.display_name(c) for c in onto.candidate_connections(rid)]
            schema = ('{"contribution":"2-3 sentences on what you do for this scenario",'
                      '"handles":["which part(s) of the scenario you handle"],'
                      '"triggers":[{"region":"<name>","kind":"excitatory|inhibitory|modulatory|gating","note":"why"}]}')
            user = (f"{mem}Scenario: {scenario}\n\nWhat other regions have said:\n{_transcript(transcript)}\n\n"
                    f"Regions you may interact with: {', '.join(conns) or 'n/a'}\n\n"
                    f"State your contribution, which parts you handle, and which other regions you "
                    f"trigger or gate (excitatory/inhibitory/modulatory/gating). Reply ONLY JSON:\n{schema}")
            await em.emit("agent_start", agent_id=rid, stage="round1")
            raw = await call_agent_once(_agent(rid)["model"], _agent(rid)["temperature"], _sys(rid), [{"role": "user", "content": user}], max_tokens=700)
            await em.emit("agent_end", agent_id=rid)
            data = _parse_json(raw)
            contribution = str(data.get("contribution", "")).strip() or "(no contribution)"
            await em.emit("contribution", agent_id=rid, text=contribution, handles=data.get("handles", []))
            transcript.append({"id": rid, "name": onto.display_name(rid), "stage": "round1", "text": contribution})
            await _persist_msg(meeting_id, rid, "round1", contribution)

            for t in data.get("triggers", []):
                tid = onto.to_id(str(t.get("region", "")))
                kind = str(t.get("kind", "modulatory")).lower()
                if kind not in ("excitatory", "inhibitory", "modulatory", "gating"):
                    kind = "modulatory"
                if not tid:
                    continue
                await em.emit("edge", **{"from": rid, "to": tid, "kind": kind, "note": t.get("note", "")})
                # Recruit a triggered region if it's a real agent and not yet present.
                if tid in _AGENT_BY_ID and tid not in active and len(active) < cap and onto.level_of(tid) <= max_level:
                    await em.emit("summon", agent_id=tid, caller_id=rid, reason=f"{onto.display_name(rid)} triggers {onto.display_name(tid)} ({kind})")
                    await em.emit("move", agent_id=tid, room="meeting")
                    active.append(tid)
                    await asyncio.sleep(0.3)

        # ── 5. Round 2: deliberation, ordered flow, vote ─────────────────────
        await em.emit("stage_change", stage="round2")
        for rid in active:
            user = (f"{mem}Scenario: {scenario}\n\nThe network so far:\n{_transcript(transcript)}\n\n"
                    f"Deliberate: spot holes or flaws, and name where you biologically help or "
                    f"interfere with another active region. 2-3 sentences.")
            text = await stream_region(rid, "round2", _sys(rid), user)
            if text:
                transcript.append({"id": rid, "name": onto.display_name(rid), "stage": "round2", "text": text})
                await _persist_msg(meeting_id, rid, "round2", text)

        # Proposed realistic ordered flow (afferent → relay → cortical → efferent).
        flow_schema = '{"ordering":["<region name in processing order>"],"rationale":"one sentence"}'
        flow_user = (f"Scenario: {scenario}\n\nActive regions: {', '.join(onto.display_name(r) for r in active)}\n\n"
                     f"Discussion:\n{_transcript(transcript)}\n\n"
                     f"Propose the realistic temporal order in which these regions act (sensory/afferent "
                     f"first → relays → cortical/decision → motor/efferent last). Reply ONLY JSON:\n{flow_schema}")
        await em.emit("agent_start", agent_id="brain", stage="round2")
        raw = await call_agent_once("Llama-3.3-70B-Instruct", 0.2, _coordinator_sys(), [{"role": "user", "content": flow_user}], max_tokens=500)
        await em.emit("agent_end", agent_id="brain")
        fdata = _parse_json(raw)
        ordering = [onto.to_id(x) for x in fdata.get("ordering", []) if onto.to_id(x) in active]
        for r in active:
            if r not in ordering:
                ordering.append(r)
        await em.emit("flow_proposal", ordering=ordering, rationale=fdata.get("rationale", ""))

        # Vote on the plan.
        await em.emit("stage_change", stage="voting")
        vote_schema = '{"position":"for|against|abstain","confidence":0.0-1.0,"reasoning":"one sentence citing a specific function"}'
        for rid in active:
            user = (f"Scenario: {scenario}\n\nProposed action plan & order:\n"
                    f"{' → '.join(onto.display_name(o) for o in ordering)}\n\nDiscussion:\n{_transcript(transcript)}\n\n"
                    f"Vote on whether this plan and ordering are biologically correct. Reply ONLY JSON:\n{vote_schema}")
            await em.emit("agent_start", agent_id=rid, stage="voting")
            raw = await call_agent_once(_agent(rid)["model"], 0.1, _sys(rid), [{"role": "user", "content": user}], max_tokens=300)
            await em.emit("agent_end", agent_id=rid)
            vote = await parse_vote(raw)
            await em.emit("vote", agent_id=rid, position=vote["position"], confidence=vote["confidence"], reasoning=vote["reasoning"])
            await _persist_vote(meeting_id, rid, vote)

        # ── 6. Bilateral merge of matching left/right pairs ──────────────────
        merges: dict[str, str] = {}  # member_id -> merged label id
        contrib = {e["id"]: e["text"] for e in transcript if e["stage"] == "round1"}
        for rid in list(active):
            if rid.startswith("left_"):
                mirror = "right_" + rid[len("left_"):]
                if mirror in active and _similar(contrib.get(rid, ""), contrib.get(mirror, "")) >= 0.4:
                    suffix = rid[len("left_"):]
                    label = "bilateral_" + suffix
                    merges[rid] = label
                    merges[mirror] = label
                    await em.emit("merge", merged_id=label, left_id=rid, right_id=mirror,
                                  label="Bilateral " + onto.display_name(suffix).title())

        # ── 7. Implementation room — speak in flow order ─────────────────────
        await em.emit("stage_change", stage="implementation")
        for rid in active:
            await em.emit("move", agent_id=rid, room="implementation")
        spoken: set[str] = set()
        step = 0
        for rid in ordering:
            label = merges.get(rid)
            speaker_key = label or rid
            if speaker_key in spoken:
                continue
            spoken.add(speaker_key)
            step += 1
            if label:
                left = label.replace("bilateral_", "left_")
                right = label.replace("bilateral_", "right_")
                who = f"the bilateral {onto.display_name(label.replace('bilateral_',''))} (left & right together)"
                speak_id = label
                sys_prompt = _sys(left)
            else:
                who = f"the {onto.display_name(rid)}"
                speak_id = rid
                sys_prompt = _sys(rid)
            user = (f"Scenario: {scenario}\n\nThe agreed plan: {' → '.join(onto.display_name(o) for o in ordering)}\n\n"
                    f"You are {who}. In ONE short, concrete sentence, state what you do at your step "
                    f"of this plan. No preamble.")
            await em.emit("agent_start", agent_id=speak_id, stage="implementation")
            parts = []
            try:
                async for tok in call_agent_stream(_agent(rid)["model"], 0.4, sys_prompt, [{"role": "user", "content": user}]):
                    parts.append(tok)
                    await em.emit("token", agent_id=speak_id, text=tok)
            except Exception as e:
                log.warning(f"impl {rid} failed: {e}")
            await em.emit("agent_end", agent_id=speak_id)
            await em.emit("implement", agent_id=speak_id, order=step, text="".join(parts).strip())

        # ── 8. Final integrated answer (Brain) ───────────────────────────────
        await em.emit("stage_change", stage="final")
        final_user = (f"{mem}Scenario: {scenario}\n\nFull network discussion:\n{_transcript(transcript)}\n\n"
                      f"Processing order: {' → '.join(onto.display_name(o) for o in ordering)}\n\n"
                      f"As the integrating Brain, give the final answer: in 2-4 sentences, what does "
                      f"the brain do in this scenario and what is the outcome? Plain language.")
        await em.emit("agent_start", agent_id="brain", stage="final")
        final_parts = []
        try:
            async for tok in call_summary_stream(_coordinator_sys(), final_user):
                final_parts.append(tok)
                await em.emit("token", agent_id="brain", text=tok)
        except Exception as e:
            log.warning(f"final failed: {e}")
        final_answer = "".join(final_parts).strip()
        await em.emit("agent_end", agent_id="brain")
        await em.emit("final_answer", text=final_answer, by="brain")

        # ── 9. Hippocampus saves a CONDENSED record of the session ───────────
        name = scenario.strip()[:60]
        regions_txt = ", ".join(onto.display_name(o) for o in ordering)
        condensed_line = f'Q: "{name}" → active: {regions_txt}. Answer: {final_answer[:220]}'
        async with get_db() as db:
            await db.execute("UPDATE meetings SET status='complete', result_summary=?, name=? WHERE id=?",
                             (final_answer, name, meeting_id))
            now = datetime.now(timezone.utc).isoformat()
            cur = await db.execute(
                "INSERT INTO memories (agent_id, memory_type, content, meeting_id, created_at) VALUES (?,?,?,?,?)",
                ("brain", "meeting", condensed_line, meeting_id, now))
            mem_id = cur.lastrowid
            # Append this meeting's condensed record to its hippocampus group, so
            # later questions in the same group can refer back to it (capped).
            if group_id:
                async with db.execute("SELECT condensed FROM memory_groups WHERE id=?", (group_id,)) as c:
                    row = await c.fetchone()
                prior = (row["condensed"] if row and row["condensed"] else "")
                lines = [l for l in prior.split("\n") if l.strip()]
                lines.append(condensed_line)
                new_condensed = "\n".join(lines[-12:])  # keep the last dozen exchanges
                await db.execute("UPDATE memory_groups SET condensed=? WHERE id=?", (new_condensed, group_id))
            await db.commit()
        await em.emit("memory_saved", memory_id=mem_id, name=name)
        for rid in active:
            await em.emit("move", agent_id=rid, room="waiting")
        await em.emit("meeting_end", meeting_id=meeting_id)
        log.info(f"[brain-meeting {meeting_id[:8]}] COMPLETE")

    except Exception as e:
        log.exception(f"[brain-meeting {meeting_id[:8]}] FAILED: {e}")
        try:
            async with get_db() as db:
                await db.execute("UPDATE meetings SET status='error' WHERE id=?", (meeting_id,))
                await db.commit()
        except Exception:
            pass
        await em.emit("error", meeting_id=meeting_id, message=f"{type(e).__name__}: {str(e)[:200]}")
        await em.emit("meeting_end", meeting_id=meeting_id)


def _coordinator_sys() -> str:
    return (
        "You are the integrating Brain — the whole-brain coordinator in a simulated "
        "brain-region network. Reason strictly from real neuroanatomy and physiology; "
        "never fabricate structures or functions. Be concise and concrete."
    )


async def _persist_msg(meeting_id: str, agent_id: str, stage: str, content: str):
    try:
        async with get_db() as db:
            await db.execute(
                "INSERT INTO meeting_messages (meeting_id, agent_id, stage, content, created_at) VALUES (?,?,?,?,?)",
                (meeting_id, agent_id, stage, content, datetime.now(timezone.utc).isoformat()))
            await db.commit()
    except Exception as e:
        log.warning(f"persist msg failed: {e}")


async def _persist_vote(meeting_id: str, agent_id: str, vote: dict):
    try:
        async with get_db() as db:
            await db.execute(
                "INSERT INTO votes (meeting_id, agent_id, position, confidence, reasoning) VALUES (?,?,?,?,?)",
                (meeting_id, agent_id, vote["position"], vote["confidence"], vote["reasoning"]))
            await db.commit()
    except Exception as e:
        log.warning(f"persist vote failed: {e}")
