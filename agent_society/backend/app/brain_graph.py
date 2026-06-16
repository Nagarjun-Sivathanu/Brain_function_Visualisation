"""
Brain-meeting orchestrator — LangGraph edition.

Same brain-faithful flow as `brain_meeting.py` (seat divisions → assess → recruit
→ round 1 → round 2 → flow → vote → bilateral merge → implementation → final →
save), but expressed as a LangGraph ``StateGraph`` (one node per stage) instead of
a single linear async function.

The speed win is NOT LangGraph itself — it's that every stage where independent
regions act now runs their LLM calls *concurrently* (``asyncio.gather``) and then
reveals the results to the office one-by-one, in order. So Round 1 with eight
regions costs ~one LLM round-trip instead of eight.

The event/streaming/persistence layer is unchanged: nodes use the same `Emitter`
(SSE queue + `meeting_events` table) and the same DB writes as before, so the UI,
terminal view, replay and memory states keep working untouched.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, TypedDict

from langgraph.graph import StateGraph, START, END

from app.database import get_db
from app.models import call_agent_once, call_summary_stream, parse_vote
from app import brain_ontology as onto
from app.brain_meeting import (
    Emitter,
    CONF_THRESHOLD,
    _AGENT_BY_ID,
    _recruit_cap,
    _parse_json,
    _agent,
    _sys,
    _transcript,
    _similar,
    _coordinator_sys,
    _persist_msg,
    _persist_vote,
)

log = logging.getLogger("brain_graph")

# Cap simultaneous calls to the single shared Llama endpoint so a big wave of
# regions doesn't swamp it (it batches, but we stay polite).
_MAX_CONCURRENCY = 6


class MeetingState(TypedDict, total=False):
    # inputs (set once)
    meeting_id: str
    scenario: str
    max_level: int
    group_id: Optional[str]
    mem: str
    cap: int
    # working set (each node returns the full updated value of what it changes)
    divisions: list
    active: list
    present: list
    transcript: list
    ordering: list
    merges: dict
    actions: list
    assessment: dict
    final_answer: str


def _node_key(rid: str) -> str:
    """Key in the same `"<level>) <name>"` shape as cleaned_brain_anatomy.json."""
    return f"{onto.level_of(rid)}) {onto.display_name(rid)}"


def _activated_tree(divisions: list, active: list, confidences: dict, parent_of: dict) -> dict:
    """Prune the anatomy tree to only the regions that were recruited, nested by
    parent exactly like the source JSON, with each node's confidence attached."""
    activated = list(divisions) + [r for r in active if r not in divisions]
    kids: dict = {}
    for rid in activated:
        kids.setdefault(parent_of.get(rid), []).append(rid)

    def node(rid: str) -> dict:
        return {
            "id": rid,
            "level": onto.level_of(rid),
            "confidence": confidences.get(rid),
            "children": {_node_key(c): node(c) for c in kids.get(rid, [])},
        }

    return {_node_key(d): node(d) for d in divisions}


# ── small helpers shared by the nodes ───────────────────────────────────────
async def _gen(sem: asyncio.Semaphore, region_id: str, temp: float, system: str,
               user: str, max_tokens: int) -> str:
    """One non-streaming LLM call, concurrency-limited and failure-tolerant."""
    async with sem:
        try:
            return await call_agent_once(
                _agent(region_id)["model"], temp, system,
                [{"role": "user", "content": user}], max_tokens=max_tokens,
            )
        except Exception as e:  # keep the meeting going if one region errors
            log.warning(f"{region_id} gen failed: {e}")
            return ""


async def _reveal(em: Emitter, agent_id: str, stage: str, text: str,
                  chunk: int = 3, delay: float = 0.02) -> None:
    """Replay already-generated text into the office as a quick typewriter so the
    sprite still 'talks', even though generation already finished concurrently."""
    await em.emit("agent_start", agent_id=agent_id, stage=stage)
    words = (text or "").split(" ")
    for i in range(0, len(words), chunk):
        tok = " ".join(words[i:i + chunk])
        if i + chunk < len(words):
            tok += " "
        if tok:
            await em.emit("token", agent_id=agent_id, text=tok)
            await asyncio.sleep(delay)
    await em.emit("agent_end", agent_id=agent_id)


async def _blip(em: Emitter, agent_id: str, stage: str, delay: float = 0.12) -> None:
    """A brief thinking-bubble for stages that don't stream text (the work was
    already done concurrently); keeps the one-at-a-time reveal feel."""
    await em.emit("agent_start", agent_id=agent_id, stage=stage)
    await asyncio.sleep(delay)
    await em.emit("agent_end", agent_id=agent_id)


# ── stage nodes (factories capture the per-meeting emitter + semaphore) ──────
def _build_graph(em: Emitter, sem: asyncio.Semaphore):
    g = StateGraph(MeetingState)

    # 1. setup — mark running, seat the level-2 divisions
    async def setup(state: MeetingState) -> dict:
        async with get_db() as db:
            await db.execute("UPDATE meetings SET status='running' WHERE id=?", (state["meeting_id"],))
            await db.commit()
        await em.emit("meeting_started", scenario=state["scenario"], max_level=state["max_level"])
        divisions = [d for d in onto.divisions() if d in _AGENT_BY_ID]
        await em.emit("stage_change", stage="assessment")
        for i, d in enumerate(divisions):
            await em.emit("seat", agent_id=d, room="meeting", seat="main", index=i)
        return {"divisions": divisions, "present": list(divisions), "active": [], "transcript": []}

    # 2+3. recruit — top-down cascade, assessing each WAVE of parents concurrently
    async def recruit(state: MeetingState) -> dict:
        scenario, mem, cap, max_level = state["scenario"], state["mem"], state["cap"], state["max_level"]
        present: set = set(state["present"])
        active: list = list(state["active"])
        wave: list = list(state["divisions"])
        # Track who recruited whom + at what confidence, to build the start JSON.
        confidences: dict = {d: 1.0 for d in state["divisions"]}  # divisions are seeds
        parent_of: dict = {d: None for d in state["divisions"]}

        async def assess_one(parent: str):
            kids = [k for k in onto.children(parent)
                    if k in _AGENT_BY_ID and onto.level_of(k) <= max_level]
            if not kids:
                return parent, kids, []
            kid_names = [onto.display_name(k) for k in kids]
            schema = ('{"assessments":[{"region":"<name>","involved":true|false,'
                      '"confidence":0.0-1.0,"reason":"short biological reason"}]}')
            user = (f"{mem}Scenario: {scenario}\n\nYour candidate sub-regions:\n"
                    + "\n".join(f"- {n}" for n in kid_names)
                    + f"\n\nWhich are involved in this scenario? Reply ONLY JSON:\n{schema}")
            raw = await _gen(sem, parent, 0.2, _sys(parent), user, 600)
            picks = []
            valid = set(kids)
            for a in _parse_json(raw).get("assessments", []):
                rid = onto.to_id(str(a.get("region", "")))
                if rid in valid:
                    picks.append({"region": rid,
                                  "confidence": round(float(a.get("confidence", 0.0) or 0.0), 2),
                                  "involved": bool(a.get("involved", False)),
                                  "reason": a.get("reason", "")})
            return parent, kids, picks

        await em.emit("stage_change", stage="recruitment")
        while wave and len(active) < cap:
            results = await asyncio.gather(*[assess_one(p) for p in wave])  # concurrent
            next_wave: list = []
            for parent, kids, picks in results:                            # reveal in order
                if kids:
                    await _blip(em, parent, "assessment")
                    await em.emit("assess", agent_id=parent, picks=picks)
                for pick in picks:
                    if not pick["involved"] or pick["confidence"] < CONF_THRESHOLD:
                        continue
                    rid = pick["region"]
                    if rid in present or len(active) >= cap:
                        continue
                    reason = (f"{onto.display_name(parent)} flagged {onto.display_name(rid)} "
                              f"as involved (conf {pick['confidence']:.2f})")
                    await em.emit("summon", agent_id=rid, caller_id=parent, reason=reason)
                    await em.emit("move", agent_id=rid, room="meeting")
                    present.add(rid)
                    active.append(rid)
                    confidences[rid] = pick["confidence"]
                    parent_of[rid] = parent
                    if onto.level_of(rid) < max_level:
                        next_wave.append(rid)
                    await asyncio.sleep(0.25)
            wave = next_wave

        if not active:  # nothing crossed threshold — let the divisions act
            active = list(state["divisions"])

        # Start JSON: confidence-confirmed regions, nested like the source anatomy
        # file, plus a flat name→score map for convenience.
        tree = _activated_tree(state["divisions"], active, confidences, parent_of)
        scores = {onto.display_name(r): confidences[r] for r in active if r in confidences}
        assessment = {"tree": tree, "scores": scores, "threshold": CONF_THRESHOLD, "count": len(scores)}
        await em.emit("assessment_json", **assessment)
        return {"active": active, "present": list(present), "assessment": assessment}

    # 4. round 1 — contribution + typed edges, each WAVE generated concurrently
    async def round1(state: MeetingState) -> dict:
        scenario, mem, cap, max_level = state["scenario"], state["mem"], state["cap"], state["max_level"]
        active: list = list(state["active"])
        transcript: list = list(state["transcript"])
        await em.emit("stage_change", stage="round1")

        async def contrib_one(rid: str):
            conns = [onto.display_name(c) for c in onto.candidate_connections(rid)]
            schema = ('{"contribution":"2-3 sentences on what you do for this scenario",'
                      '"handles":["which part(s) of the scenario you handle"],'
                      '"triggers":[{"region":"<name>","kind":"excitatory|inhibitory|modulatory|gating","note":"why"}]}')
            user = (f"{mem}Scenario: {scenario}\n\nWhat other regions have said:\n{_transcript(transcript)}\n\n"
                    f"Regions you may interact with: {', '.join(conns) or 'n/a'}\n\n"
                    f"State your contribution, which parts you handle, and which other regions you "
                    f"trigger or gate (excitatory/inhibitory/modulatory/gating). Reply ONLY JSON:\n{schema}")
            raw = await _gen(sem, rid, _agent(rid)["temperature"], _sys(rid), user, 700)
            return rid, _parse_json(raw)

        idx = 0
        while idx < len(active):
            wave = active[idx:]
            idx = len(active)
            results = await asyncio.gather(*[contrib_one(rid) for rid in wave])  # concurrent
            for rid, data in results:                                            # reveal in order
                contribution = str(data.get("contribution", "")).strip() or "(no contribution)"
                await _reveal(em, rid, "round1", contribution)
                await em.emit("contribution", agent_id=rid, text=contribution, handles=data.get("handles", []))
                transcript.append({"id": rid, "name": onto.display_name(rid), "stage": "round1", "text": contribution})
                await _persist_msg(state["meeting_id"], rid, "round1", contribution)
                for t in data.get("triggers", []):
                    tid = onto.to_id(str(t.get("region", "")))
                    kind = str(t.get("kind", "modulatory")).lower()
                    if kind not in ("excitatory", "inhibitory", "modulatory", "gating"):
                        kind = "modulatory"
                    if not tid:
                        continue
                    await em.emit("edge", **{"from": rid, "to": tid, "kind": kind, "note": t.get("note", "")})
                    if (tid in _AGENT_BY_ID and tid not in active and len(active) < cap
                            and onto.level_of(tid) <= max_level):
                        await em.emit("summon", agent_id=tid, caller_id=rid,
                                      reason=f"{onto.display_name(rid)} triggers {onto.display_name(tid)} ({kind})")
                        await em.emit("move", agent_id=tid, room="meeting")
                        active.append(tid)
                        await asyncio.sleep(0.25)
        return {"active": active, "transcript": transcript}

    # 5a. round 2 — deliberation, all regions concurrently, revealed in order
    async def round2(state: MeetingState) -> dict:
        scenario, mem = state["scenario"], state["mem"]
        active: list = state["active"]
        transcript: list = list(state["transcript"])
        await em.emit("stage_change", stage="round2")

        async def delib_one(rid: str):
            user = (f"{mem}Scenario: {scenario}\n\nThe network so far:\n{_transcript(transcript)}\n\n"
                    f"Deliberate: spot holes or flaws, and name where you biologically help or "
                    f"interfere with another active region. 2-3 sentences.")
            return rid, await _gen(sem, rid, _agent(rid)["temperature"], _sys(rid), user, 500)

        results = await asyncio.gather(*[delib_one(rid) for rid in active])
        for rid, text in results:
            text = (text or "").strip()
            if not text:
                continue
            await _reveal(em, rid, "round2", text)
            transcript.append({"id": rid, "name": onto.display_name(rid), "stage": "round2", "text": text})
            await _persist_msg(state["meeting_id"], rid, "round2", text)
        return {"transcript": transcript}

    # 5b. flow — single coordinator call proposing the realistic processing order
    async def flow(state: MeetingState) -> dict:
        scenario = state["scenario"]
        active: list = state["active"]
        transcript: list = state["transcript"]
        flow_schema = '{"ordering":["<region name in processing order>"],"rationale":"one sentence"}'
        flow_user = (f"Scenario: {scenario}\n\nActive regions: {', '.join(onto.display_name(r) for r in active)}\n\n"
                     f"Discussion:\n{_transcript(transcript)}\n\n"
                     f"Propose the realistic temporal order in which these regions act (sensory/afferent "
                     f"first → relays → cortical/decision → motor/efferent last). Reply ONLY JSON:\n{flow_schema}")
        await em.emit("agent_start", agent_id="brain", stage="round2")
        raw = await _gen(sem, "brain", 0.2, _coordinator_sys(), flow_user, 500)
        await em.emit("agent_end", agent_id="brain")
        fdata = _parse_json(raw)
        ordering = [onto.to_id(x) for x in fdata.get("ordering", []) if onto.to_id(x) in active]
        for r in active:
            if r not in ordering:
                ordering.append(r)
        await em.emit("flow_proposal", ordering=ordering, rationale=fdata.get("rationale", ""))
        return {"ordering": ordering}

    # 5c. vote — all regions vote concurrently, revealed in order
    async def vote(state: MeetingState) -> dict:
        scenario = state["scenario"]
        active: list = state["active"]
        ordering: list = state["ordering"]
        transcript: list = state["transcript"]
        await em.emit("stage_change", stage="voting")
        vote_schema = '{"position":"for|against|abstain","confidence":0.0-1.0,"reasoning":"one sentence citing a specific function"}'

        async def vote_one(rid: str):
            user = (f"Scenario: {scenario}\n\nProposed action plan & order:\n"
                    f"{' → '.join(onto.display_name(o) for o in ordering)}\n\nDiscussion:\n{_transcript(transcript)}\n\n"
                    f"Vote on whether this plan and ordering are biologically correct. Reply ONLY JSON:\n{vote_schema}")
            raw = await _gen(sem, rid, 0.1, _sys(rid), user, 300)
            return rid, await parse_vote(raw)

        results = await asyncio.gather(*[vote_one(rid) for rid in active])
        for rid, v in results:
            await _blip(em, rid, "voting")
            await em.emit("vote", agent_id=rid, position=v["position"],
                          confidence=v["confidence"], reasoning=v["reasoning"])
            await _persist_vote(state["meeting_id"], rid, v)
        return {}

    # 6. merge — bilateral merge of matching left/right pairs (no LLM)
    async def merge(state: MeetingState) -> dict:
        active: list = state["active"]
        transcript: list = state["transcript"]
        merges: dict = {}
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
        return {"merges": merges}

    # 7. implement — move to the implementation room, speak in flow order
    async def implement(state: MeetingState) -> dict:
        scenario = state["scenario"]
        active: list = state["active"]
        divisions: list = state["divisions"]
        ordering: list = state["ordering"]
        merges: dict = state["merges"]
        await em.emit("stage_change", stage="implementation")
        for rid in active + [d for d in divisions if d not in active]:
            await em.emit("move", agent_id=rid, room="implementation")

        # Build the ordered list of unique speakers (collapsing merged pairs).
        speakers: list = []
        spoken: set = set()
        for rid in ordering:
            label = merges.get(rid)
            key = label or rid
            if key in spoken:
                continue
            spoken.add(key)
            speakers.append((rid, label))

        async def impl_one(rid: str, label: Optional[str]):
            if label:
                who = f"the bilateral {onto.display_name(label.replace('bilateral_', ''))} (left & right together)"
                sys_prompt = _sys(label.replace("bilateral_", "left_"))
            else:
                who = f"the {onto.display_name(rid)}"
                sys_prompt = _sys(rid)
            user = (f"Scenario: {scenario}\n\nThe agreed plan: {' → '.join(onto.display_name(o) for o in ordering)}\n\n"
                    f"You are {who}. In ONE short, concrete sentence, state what you do at your step "
                    f"of this plan. No preamble.")
            return await _gen(sem, rid, 0.4, sys_prompt, user, 200)

        texts = await asyncio.gather(*[impl_one(rid, label) for rid, label in speakers])  # concurrent
        step = 0
        actions: list = []
        for (rid, label), text in zip(speakers, texts):                                   # reveal in flow order
            speak_id = label or rid
            step += 1
            action_text = (text or "").strip()
            name = ("Bilateral " + onto.display_name(label.replace("bilateral_", "")).title()
                    if label else onto.display_name(rid))
            await _reveal(em, speak_id, "implementation", action_text)
            await em.emit("implement", agent_id=speak_id, order=step, text=action_text)
            actions.append({"order": step, "id": speak_id, "name": name, "action": action_text})
        return {"actions": actions}

    # 8. final — the integrating Brain streams the consolidated answer (one call)
    async def final(state: MeetingState) -> dict:
        scenario, mem = state["scenario"], state["mem"]
        transcript: list = state["transcript"]
        ordering: list = state["ordering"]
        await em.emit("stage_change", stage="final")
        final_user = (f"{mem}Scenario: {scenario}\n\nFull network discussion:\n{_transcript(transcript)}\n\n"
                      f"Processing order: {' → '.join(onto.display_name(o) for o in ordering)}\n\n"
                      f"As the integrating Brain, give the final answer: in 2-4 sentences, what does "
                      f"the brain do in this scenario and what is the outcome? Plain language.")
        await em.emit("agent_start", agent_id="brain", stage="final")
        parts: list = []
        try:
            async for tok in call_summary_stream(_coordinator_sys(), final_user):
                parts.append(tok)
                await em.emit("token", agent_id="brain", text=tok)
        except Exception as e:
            log.warning(f"final failed: {e}")
        final_answer = "".join(parts).strip()
        await em.emit("agent_end", agent_id="brain")
        await em.emit("final_answer", text=final_answer, by="brain")
        return {"final_answer": final_answer}

    # 9. save — hippocampus condenses the session, everyone goes home
    async def save(state: MeetingState) -> dict:
        meeting_id = state["meeting_id"]
        scenario = state["scenario"]
        ordering: list = state["ordering"]
        active: list = state["active"]
        divisions: list = state["divisions"]
        group_id = state.get("group_id")
        final_answer = state.get("final_answer", "")
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
            if group_id:
                async with db.execute("SELECT condensed FROM memory_groups WHERE id=?", (group_id,)) as c:
                    row = await c.fetchone()
                prior = (row["condensed"] if row and row["condensed"] else "")
                lines = [l for l in prior.split("\n") if l.strip()]
                lines.append(condensed_line)
                new_condensed = "\n".join(lines[-12:])
                await db.execute("UPDATE memory_groups SET condensed=? WHERE id=?", (new_condensed, group_id))
            await db.commit()
        await em.emit("memory_saved", memory_id=mem_id, name=name)

        # Final JSON: the agreed processing flow + what each region does, plus the
        # integrated answer — the end-state counterpart to assessment_json.
        result = {
            "scenario": scenario,
            "flow": [{"order": i + 1, "id": o, "name": onto.display_name(o)} for i, o in enumerate(ordering)],
            "steps": state.get("actions", []),
            "final_answer": final_answer,
        }
        await em.emit("result_json", **result)

        # Also drop a standalone file on disk so a finished run is easy to hand
        # off (e.g. to the visualization team) without scraping the event log.
        try:
            export = {"meeting_id": meeting_id, "scenario": scenario, "name": name,
                      "assessment": state.get("assessment"), "result": result}
            out_dir = Path(__file__).resolve().parents[1] / "data" / "exports"
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / f"{meeting_id}.json").write_text(json.dumps(export, indent=2), encoding="utf-8")
        except Exception as e:
            log.warning(f"export file write failed: {e}")

        for rid in active + [d for d in divisions if d not in active]:
            await em.emit("move", agent_id=rid, room=("meeting" if onto.level_of(rid) == 2 else "waiting"))
        await em.emit("meeting_end", meeting_id=meeting_id)
        return {}

    for name, fn in [("setup", setup), ("recruit", recruit), ("round1", round1),
                     ("round2", round2), ("flow", flow), ("vote", vote), ("merge", merge),
                     ("implement", implement), ("final", final), ("save", save)]:
        g.add_node(name, fn)

    g.add_edge(START, "setup")
    g.add_edge("setup", "recruit")
    g.add_edge("recruit", "round1")
    g.add_edge("round1", "round2")
    g.add_edge("round2", "flow")
    g.add_edge("flow", "vote")
    g.add_edge("vote", "merge")
    g.add_edge("merge", "implement")
    g.add_edge("implement", "final")
    g.add_edge("final", "save")
    g.add_edge("save", END)
    return g.compile()


# ── public entry point (same signature main.py already calls) ───────────────
async def run_brain_meeting(
    meeting_id: str,
    scenario: str,
    queue: asyncio.Queue,
    max_level: int = 3,
    group_id: str | None = None,
    group_context: str = "",
):
    em = Emitter(meeting_id, queue)
    sem = asyncio.Semaphore(_MAX_CONCURRENCY)
    log.info(f"[brain-graph {meeting_id[:8]}] START {scenario!r} maxlvl={max_level} group={group_id}")
    mem = f"Earlier in this session (hippocampus memory):\n{group_context}\n\n" if group_context else ""
    state: MeetingState = {
        "meeting_id": meeting_id, "scenario": scenario, "max_level": max_level,
        "group_id": group_id, "mem": mem, "cap": _recruit_cap(max_level),
        "divisions": [], "active": [], "present": [], "transcript": [],
        "ordering": [], "merges": {}, "actions": [], "final_answer": "",
    }
    graph = _build_graph(em, sem)
    try:
        await graph.ainvoke(state, config={"recursion_limit": 50})
        log.info(f"[brain-graph {meeting_id[:8]}] COMPLETE")
    except Exception as e:
        log.exception(f"[brain-graph {meeting_id[:8]}] FAILED: {e}")
        try:
            async with get_db() as db:
                await db.execute("UPDATE meetings SET status='error' WHERE id=?", (meeting_id,))
                await db.commit()
        except Exception:
            pass
        await em.emit("error", meeting_id=meeting_id, message=f"{type(e).__name__}: {str(e)[:200]}")
        await em.emit("meeting_end", meeting_id=meeting_id)
