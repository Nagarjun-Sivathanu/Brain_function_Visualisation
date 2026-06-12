import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import AsyncIterator
from app.database import get_db


def _dev_mode() -> bool:
    """Surface internal hiccups (tool errors, '[X unavailable]' notes, raw
    stack-trace blurbs) in the chat only when AAS_DEV_MODE is truthy. In the
    default (production-feel) mode the user sees a clean conversation; the
    same details still go to the server log for debugging."""
    return os.getenv("AAS_DEV_MODE", "").strip().lower() in ("1", "true", "yes", "on")
from app.agents import build_system_prompt, build_stage_messages, STAGE_INSTRUCTIONS
from app import observer_briefing as briefing_mod
from app.models import (
    call_agent_stream,
    call_agent_once,
    call_agent_chat_with_tools,
    call_summary_stream,
    parse_vote,
    supports_tools,
)
from app.agent_tools import tool_schemas, run_tool

log = logging.getLogger("orchestrator")

STAGES = [
    "initial_opinions",
    "critique_round",
    "refinement_round",
    "voting",
    "consensus_summary",
]

SYNTHESIZER_AGENT = {
    "id": "system",
    "name": "Network Facilitator",
    "role": "Facilitator",
    "model": "Llama-3.3-70B-Instruct",
    "temperature": 0.4,
    "emoji": "🧠",
    "color": "#6b7280",
}


async def _load_agent_context(db, agent_id: str) -> tuple[list, list]:
    """Load memories and relationships for an agent."""
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
        WHERE r.agent_id = ?
        ORDER BY ABS(r.trust_score) DESC
        """,
        (agent_id,),
    ) as cursor:
        relationships = [dict(r) for r in await cursor.fetchall()]

    return memories, relationships


async def _load_agent(db, agent_id: str) -> dict:
    async with db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise ValueError(f"Agent {agent_id} not found")
        agent = dict(row)
        agent["personality_traits"] = json.loads(agent["personality_traits"])
        agent["expertise"] = json.loads(agent["expertise"])
        return agent


async def run_meeting(
    meeting_id: str,
    scenario: str,
    queue: asyncio.Queue,
    proceed_event: asyncio.Event | None = None,
    interjections: list[str] | None = None,
    enable_tools: bool = False,
    include_observer_context: bool = False,
):
    """
    Core meeting pipeline. Pushes SSE-formatted events into `queue`.

    If `proceed_event` is provided, the orchestrator pauses after every
    non-final stage and emits a `phase_paused` event, then awaits the event
    being set (via POST /meetings/{id}/proceed). Any queued `interjections`
    are folded into the next phase as a "Human Moderator" message so the
    agents see and can respond to them.
    """
    log.info(f"[meeting {meeting_id[:8]}] START · scenario={scenario!r}")
    try:
        async with get_db() as db:
            # Load all agents
            async with db.execute("SELECT id FROM agents") as cursor:
                agent_ids = [r[0] for r in await cursor.fetchall()]

            agents = []
            for aid in agent_ids:
                agent = await _load_agent(db, aid)
                memories, relationships = await _load_agent_context(db, aid)
                agents.append((agent, memories, relationships))

            log.info(f"[meeting {meeting_id[:8]}] loaded {len(agents)} agents")

            await db.execute(
                "UPDATE meetings SET status = 'running' WHERE id = ?", (meeting_id,)
            )
            await db.commit()

            # Build the Observer briefing ONCE at meeting start. Same string
            # is rendered into every agent's per-stage prompt — keeps the
            # context stable across the meeting and avoids OO load.
            observer_block: str | None = None
            if include_observer_context:
                try:
                    briefing = await briefing_mod.build_briefing(scenario)
                    observer_block = briefing.render_block() or None
                    if observer_block:
                        log.info(
                            f"[meeting {meeting_id[:8]}] observer briefing: "
                            f"{len(observer_block)} chars, "
                            f"{len(briefing.observation_snippets)} snippets, "
                            f"backend={briefing.backend}"
                        )
                    else:
                        log.info(
                            f"[meeting {meeting_id[:8]}] observer briefing: empty "
                            f"(backend={briefing.backend})"
                        )
                except Exception as e:
                    log.warning(
                        f"[meeting {meeting_id[:8]}] observer briefing failed, "
                        f"continuing without: {type(e).__name__}: {str(e)[:120]}"
                    )

            prior_messages: list[dict] = []

            for i, stage in enumerate(STAGES):
                log.info(f"[meeting {meeting_id[:8]}] stage → {stage}")
                await queue.put({"type": "stage_change", "stage": stage})

                if stage == "voting":
                    votes = await _run_voting_stage(
                        db, meeting_id, scenario, agents, prior_messages, queue,
                        observer_briefing=observer_block,
                    )
                    prior_messages.extend(votes)

                elif stage == "consensus_summary":
                    summary = await _run_summary_stage(db, meeting_id, scenario, prior_messages, queue)
                    await db.execute(
                        "UPDATE meetings SET result_summary = ?, status = 'complete' WHERE id = ?",
                        (summary, meeting_id),
                    )
                    await db.commit()
                    await _write_memories(db, meeting_id, scenario, agents, prior_messages, summary)

                else:
                    stage_results = await _run_sequential_stage(
                        db, meeting_id, stage, scenario, agents, prior_messages, queue,
                        enable_tools=enable_tools,
                        observer_briefing=observer_block,
                    )
                    prior_messages.extend(stage_results)

                # Pause between phases (but not after the final stage) so the
                # user can read, optionally interject, and click Proceed.
                if proceed_event is not None and i < len(STAGES) - 1:
                    next_stage = STAGES[i + 1]
                    log.info(f"[meeting {meeting_id[:8]}] paused after {stage} — awaiting proceed")
                    await queue.put({
                        "type": "phase_paused",
                        "completed_stage": stage,
                        "next_stage": next_stage,
                    })
                    try:
                        await asyncio.wait_for(proceed_event.wait(), timeout=900.0)
                    except asyncio.TimeoutError:
                        log.warning(
                            f"[meeting {meeting_id[:8]}] proceed timeout — auto-resuming"
                        )
                    proceed_event.clear()

                    # Drain any human interjections into the next phase's context
                    if interjections:
                        while interjections:
                            note = interjections.pop(0)
                            log.info(f"[meeting {meeting_id[:8]}] interjection → {note[:60]}…")
                            prior_messages.append({
                                "agent_id": "human",
                                "agent_name": "Human Moderator",
                                "agent_role": "Facilitator",
                                "stage": stage,
                                "content": note,
                            })
                            await queue.put({"type": "interjection", "content": note})

        log.info(f"[meeting {meeting_id[:8]}] COMPLETE")
        await queue.put({"type": "meeting_end", "meeting_id": meeting_id})

    except Exception as e:
        log.exception(f"[meeting {meeting_id[:8]}] FAILED: {e}")
        # Mark meeting as failed in DB
        try:
            async with get_db() as db:
                await db.execute(
                    "UPDATE meetings SET status = 'error' WHERE id = ?", (meeting_id,)
                )
                await db.commit()
        except Exception:
            pass
        await queue.put({
            "type": "error",
            "meeting_id": meeting_id,
            "message": f"{type(e).__name__}: {str(e)[:200]}",
        })
        await queue.put({"type": "meeting_end", "meeting_id": meeting_id})


MAX_TOOL_ITERATIONS = 5


def _select_tool_capable_pair(agent: dict) -> tuple[str, str | None]:
    """Pick (primary, fallback) such that PRIMARY supports tools.

    - If the agent's configured primary supports tools, return (primary, fallback).
    - Else if the configured fallback supports tools, swap them so the
      tool-capable model leads and the original primary is the no-tools
      last-resort.
    - Else return the original pair; tool calling will simply not produce
      tool_calls in the response (the model will still emit a text answer)
      and we'll proceed text-only.
    """
    primary = agent.get("model", "")
    fallback = agent.get("fallback_model")
    if supports_tools(primary):
        return primary, fallback
    if fallback and supports_tools(fallback):
        return fallback, primary
    return primary, fallback


async def _run_agent_turn_with_tools(
    agent: dict,
    system_prompt: str,
    user_messages: list[dict],
    queue: asyncio.Queue,
) -> str:
    """Single agent turn with tool-calling. Loops while the model emits
    tool_calls (up to MAX_TOOL_ITERATIONS), streams pseudo-tokens to the SSE
    queue for tool invocations and their results, and returns the final text.
    """
    primary, fallback = _select_tool_capable_pair(agent)
    using_tools = supports_tools(primary)
    if not using_tools:
        log.info(
            f"  · {agent['name']}: neither primary nor fallback supports tools — "
            f"text-only path"
        )

    tools_spec = tool_schemas() if using_tools else []
    convo: list[dict] = list(user_messages)
    full_text_parts: list[str] = []

    for iteration in range(MAX_TOOL_ITERATIONS):
        try:
            if using_tools:
                msg = await call_agent_chat_with_tools(
                    model=primary,
                    temperature=agent["temperature"],
                    system_prompt=system_prompt,
                    messages=convo,
                    tools=tools_spec,
                    fallback_model=fallback,
                )
            else:
                # No tool-capable model in this agent's chain — fall through to
                # a single non-streaming completion.
                content = await call_agent_once(
                    primary,
                    agent["temperature"],
                    system_prompt,
                    convo,
                    fallback_model=fallback,
                )
                msg = {"content": content, "tool_calls": []}
        except Exception as e:
            err_short = f"{type(e).__name__}: {str(e)[:160]}"
            log.warning(f"  ✗ {agent['name']} chat call failed: {err_short}")
            if _dev_mode():
                note = f"\n[{agent['name']} was unavailable: {err_short}]"
                await queue.put({"type": "token", "agent_id": agent["id"], "text": note})
                full_text_parts.append(note)
            return "".join(full_text_parts)

        content = msg.get("content") or ""
        if content:
            full_text_parts.append(content)
            await queue.put({"type": "token", "agent_id": agent["id"], "text": content})

        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return "".join(full_text_parts)

        # Persist the assistant message in the conversation so the model has
        # context for what tool calls it just made.
        convo.append({
            "role": "assistant",
            "content": content,
            "tool_calls": tool_calls,
        })

        for tc in tool_calls:
            tc_id = tc.get("id") or ""
            fn = tc.get("function") or {}
            name = fn.get("name") or ""
            raw_args = fn.get("arguments")
            if isinstance(raw_args, str):
                try:
                    args = json.loads(raw_args) if raw_args else {}
                except json.JSONDecodeError:
                    args = {}
            else:
                args = raw_args or {}
            if args is None:
                args = {}

            result = await run_tool(name, args)
            result_text = json.dumps(result, separators=(",", ":"))[:1200]
            is_err = isinstance(result, dict) and "error" in result

            # Tool plumbing is noise to the end user — they want the agent's
            # synthesised answer, not the raw 🔧 calls and JSON results
            # cluttering the chat. The model still gets the result via
            # `convo` so it can fold the findings into its reply. In dev
            # mode (AAS_DEV_MODE=1) the calls + results stream as before
            # so we can still see what the agent did.
            if _dev_mode():
                announce = f"\n\n🔧 {name}({json.dumps(args, separators=(',', ':'))[:140]})"
                full_text_parts.append(announce)
                await queue.put({"type": "token", "agent_id": agent["id"], "text": announce})
                summary = f"\n   → {result_text[:240]}"
                full_text_parts.append(summary)
                await queue.put({"type": "token", "agent_id": agent["id"], "text": summary})
            else:
                tag = "errored" if is_err else "ok"
                log.info(f"  · {agent['name']} tool {name}() {tag} (hidden from chat): {result_text[:120]}")

            convo.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "name": name,
                "content": result_text,
            })

    log.warning(
        f"  · {agent['name']} hit max tool iterations ({MAX_TOOL_ITERATIONS}); "
        f"returning partial response"
    )
    return "".join(full_text_parts)


async def _run_sequential_stage(
    db, meeting_id, stage, scenario, agents, prior_messages, queue,
    *, enable_tools: bool = False, observer_briefing: str | None = None,
) -> list[dict]:
    """Run agents one-by-one in a stage so the chat reads like a real meeting:
    agent A finishes their full response → agent B speaks (and sees A's reply
    in their own context) → agent C speaks (sees A and B's replies) → …

    Per-agent failures are isolated — the meeting continues with whichever
    agents succeed. Failed agents leave an inline "[unavailable]" note.

    When `enable_tools=True`, each agent's turn runs through the tool-calling
    loop (auto-swap to a tool-capable fallback if the configured primary
    doesn't support function calling). Streaming is replaced with discrete
    content/tool-call/result chunks emitted as SSE tokens.
    """
    results: list[dict] = []
    round_messages: list[dict] = []

    for agent, memories, relationships in agents:
        system_prompt = build_system_prompt(agent, memories, relationships)
        context_messages = prior_messages + round_messages
        messages = build_stage_messages(
            agent["id"], stage, scenario, context_messages,
            observer_briefing=observer_briefing,
        )

        fallback = agent.get("fallback_model")
        suffix = f" (fallback: {fallback})" if fallback else ""
        tools_label = " [tools enabled]" if enable_tools else ""
        obs_label = " [observer]" if observer_briefing else ""
        log.info(f"  · {agent['name']} ({agent['model']}){suffix}{tools_label}{obs_label} speaking…")
        await queue.put({"type": "agent_start", "agent_id": agent["id"], "stage": stage})

        if enable_tools:
            content = await _run_agent_turn_with_tools(
                agent, system_prompt, messages, queue,
            )
            log.info(f"  ✓ {agent['name']} done ({len(content)} chars, tool-enabled)")
        else:
            full_text: list[str] = []
            try:
                async for token in call_agent_stream(
                    agent["model"],
                    agent["temperature"],
                    system_prompt,
                    messages,
                    fallback_model=fallback,
                ):
                    full_text.append(token)
                    await queue.put({"type": "token", "agent_id": agent["id"], "text": token})
                content = "".join(full_text)
                log.info(f"  ✓ {agent['name']} done ({len(content)} chars)")
            except Exception as e:
                err_short = f"{type(e).__name__}: {str(e)[:160]}"
                log.warning(f"  ✗ {agent['name']} failed: {err_short}")
                if _dev_mode():
                    note = f"\n[{agent['name']} was unavailable: {err_short}]"
                    await queue.put({"type": "token", "agent_id": agent["id"], "text": note})
                    content = "".join(full_text) + note
                else:
                    content = "".join(full_text)

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO meeting_messages (meeting_id, agent_id, stage, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (meeting_id, agent["id"], stage, content, now),
        )
        await db.commit()

        await queue.put({"type": "agent_end", "agent_id": agent["id"]})

        message_record = {
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "agent_role": agent["role"],
            "stage": stage,
            "content": content,
        }
        round_messages.append(message_record)
        results.append(message_record)

    return results


async def _run_voting_stage(
    db, meeting_id, scenario, agents, prior_messages, queue,
    *, observer_briefing: str | None = None,
) -> list[dict]:
    """Voting: structured JSON response per agent, one at a time.

    Voters do NOT see earlier votes — each makes an independent decision
    based only on the discussion that preceded the vote.
    """
    results: list[dict] = []

    for agent, memories, relationships in agents:
        system_prompt = build_system_prompt(agent, memories, relationships)
        messages = build_stage_messages(
            agent["id"], "voting", scenario, prior_messages,
            observer_briefing=observer_briefing,
        )

        await queue.put({"type": "agent_start", "agent_id": agent["id"], "stage": "voting"})

        # Voting needs a clean JSON response. Two failure modes were
        # showing up in the demo: (a) the model emits prose / empty
        # tokens / cut-off JSON → parse_vote falls back to abstain with
        # an empty reasoning, and (b) the call itself raises (rate-limit
        # exhausted on both primary and fallback). Bump max_tokens so
        # the JSON object can fit, and on a parse miss retry once with
        # a stricter "respond ONLY with JSON, no prose, no markdown"
        # nudge prepended to the user message.
        vote: dict | None = None
        try:
            raw = await call_agent_once(
                agent["model"], 0.1, system_prompt, messages,
                max_tokens=512,
                fallback_model=agent.get("fallback_model"),
            )
            vote = await parse_vote(raw)
            if not vote.get("_parsed"):
                log.info(
                    f"  · {agent['name']} vote 1st pass unparseable "
                    f"({len(raw)} chars: {raw[:80]!r}); retrying with strict prompt"
                )
                strict_messages = [dict(m) for m in messages]
                if strict_messages:
                    last = strict_messages[-1]
                    last["content"] = (
                        "Respond ONLY with a single-line JSON object, no markdown, "
                        "no prose, no <think> tags — format exactly:\n"
                        '{"position":"for|against|abstain","confidence":0.0-1.0,"reasoning":"one short sentence"}\n\n'
                        + str(last.get("content", ""))
                    )
                raw2 = await call_agent_once(
                    agent["model"], 0.0, system_prompt, strict_messages,
                    max_tokens=512,
                    fallback_model=agent.get("fallback_model"),
                )
                vote2 = await parse_vote(raw2)
                if vote2.get("_parsed"):
                    vote = vote2
                    log.info(f"  ✓ {agent['name']} vote retry succeeded")
                else:
                    log.warning(f"  · {agent['name']} vote retry also unparseable")
            log.info(f"  · {agent['name']} voted {vote['position']} ({vote['confidence']:.0%})")
        except Exception as e:
            err_short = f"{type(e).__name__}: {str(e)[:120]}"
            log.warning(f"  ✗ {agent['name']} vote failed: {err_short}")
            vote = {
                "position": "abstain",
                "confidence": 0.0,
                "reasoning": (
                    f"Unavailable: {err_short}" if _dev_mode()
                    else "Abstained — couldn't reach the voting model in time."
                ),
            }
        vote.pop("_parsed", None)

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO votes (meeting_id, agent_id, position, confidence, reasoning) VALUES (?, ?, ?, ?, ?)",
            (meeting_id, agent["id"], vote["position"], vote["confidence"], vote["reasoning"]),
        )
        await db.commit()

        await queue.put({
            "type": "vote",
            "agent_id": agent["id"],
            "position": vote["position"],
            "confidence": vote["confidence"],
            "reasoning": vote["reasoning"],
        })
        await queue.put({"type": "agent_end", "agent_id": agent["id"]})

        results.append({
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "agent_role": agent["role"],
            "stage": "voting",
            "content": f"Vote: {vote['position']} (confidence: {vote['confidence']:.0%}) — {vote['reasoning']}",
        })

    return results


async def _run_summary_stage(db, meeting_id, scenario, prior_messages, queue) -> str:
    """Single Claude call to synthesize the full discussion.

    Wrapped in try/except so a rate-limited or unreachable summary model
    can't crash the entire meeting (the previous behaviour: an unhandled
    RuntimeError from call_summary_stream → run_meeting's outer except
    fired → meeting marked error, no consensus ever shown). Now if both
    the primary and fallback summary models fail we synthesize a tiny
    stub from the vote tallies so the user still gets a closing message.
    """
    discussion_text = "\n".join(
        f"{m['agent_name']} ({m['agent_role']}) [{m['stage']}]: {m['content']}"
        for m in prior_messages
    )

    system = (
        "You are a neutral facilitator synthesizing a group discussion. "
        "Output GitHub-flavoured Markdown using the exact section structure "
        "the user task instructs (Recommendation / Key tradeoffs / Vote "
        "outcome / Suggested next steps). Keep it concise — final takeaway "
        "or meeting-minutes feel, NOT a wall of text.\n\n"
        "Hard rules:\n"
        "- Only include points at least two agents agreed on, or that the "
        "majority supported. If opinions conflicted, surface the genuine "
        "disagreement instead of forcing fake consensus.\n"
        "- Do NOT invent information that wasn't actually said.\n"
        "- Do NOT invent fake metrics, KPIs, dollar amounts, or hiring "
        "plans. Methods, concepts, and named tradeoffs only — unless real "
        "numbers appeared in the discussion.\n"
        "- No generic filler ('consider', 'best practices', 'it depends')."
    )
    user_msg = f"Topic: {scenario}\n\nFull discussion:\n{discussion_text}\n\n{STAGE_INSTRUCTIONS['consensus_summary']}"

    await queue.put({"type": "agent_start", "agent_id": "system", "stage": "consensus_summary"})

    full_text: list[str] = []
    try:
        async for token in call_summary_stream(system, user_msg):
            full_text.append(token)
            await queue.put({"type": "token", "agent_id": "system", "text": token})
        summary = "".join(full_text)
    except Exception as e:
        err = f"{type(e).__name__}: {str(e)[:160]}"
        log.warning(f"  ✗ summary model failed even with fallback: {err}")
        # Both summary models rate-limited — synthesise a structured stub
        # locally from the vote tally so the user still gets a useful
        # closing summary in the SAME markdown shape as a normal one.
        vote_rows = [m for m in prior_messages if m.get("stage") == "voting"]
        tally = {"for": 0, "against": 0, "abstain": 0}
        for m in vote_rows:
            content = (m.get("content") or "").lower()
            if "vote: for" in content:
                tally["for"] += 1
            elif "vote: against" in content:
                tally["against"] += 1
            else:
                tally["abstain"] += 1
        outcome = (
            f"{tally['for']} for · {tally['against']} against · {tally['abstain']} abstain"
            if vote_rows else "no votes recorded"
        )
        dissent = next(
            (m["content"] for m in vote_rows if "vote: against" in (m.get("content") or "").lower()),
            None,
        )
        stub_parts = [
            "**Recommendation**",
            "Summary model is currently rate-limited, so this is an auto-stitched closing.",
            "",
            "**Key tradeoffs**",
            "- See each agent's refinement-round message above for the full positions.",
            "",
            "**Vote outcome**",
            outcome + (f" · strongest dissent: {dissent[:160]}" if dissent else ""),
            "",
            "**Suggested next steps**",
            "1. Re-run the meeting in a few minutes once Groq's per-org rate-limit window resets.",
            "2. Review the per-agent messages above for concrete methods each role proposed.",
        ]
        stub = "\n".join(stub_parts)
        await queue.put({"type": "token", "agent_id": "system", "text": stub})
        summary = "".join(full_text) + stub

    await queue.put({"type": "agent_end", "agent_id": "system"})
    return summary


def _trim(text: str, n: int) -> str:
    text = (text or "").strip()
    if len(text) <= n:
        return text
    return text[: n - 1].rstrip() + "…"


async def _write_memories(db, meeting_id, scenario, agents, all_messages, summary: str = ""):
    """Persist per-agent memory summaries and update relationship scores.

    Each memory now records the scenario, the agent's own final position
    (their refinement_round message), their vote, who they aligned with,
    and the group's consensus outcome — enough context for the agent to
    reference this meeting in a future discussion or 1:1 chat.
    """
    now = datetime.now(timezone.utc).isoformat()

    async with db.execute(
        "SELECT agent_id, position, reasoning FROM votes WHERE meeting_id = ?",
        (meeting_id,),
    ) as cursor:
        vote_rows = await cursor.fetchall()
    vote_map = {r[0]: r[1] for r in vote_rows}
    vote_reason = {r[0]: r[2] for r in vote_rows}

    # Name lookup + own final contribution per agent
    name_by_id = {a[0]["id"]: a[0]["name"] for a in agents}
    refinement_by_agent: dict[str, str] = {}
    for m in all_messages:
        if m.get("stage") == "refinement_round":
            refinement_by_agent[m["agent_id"]] = m.get("content", "")
        elif (
            m.get("stage") == "initial_opinions"
            and m["agent_id"] not in refinement_by_agent
        ):
            # Fallback to initial opinion if refinement didn't fire for them
            refinement_by_agent[m["agent_id"]] = m.get("content", "")

    summary_trim = _trim(summary, 280)

    for agent, _, _ in agents:
        aid = agent["id"]
        my_vote = vote_map.get(aid, "abstain")
        my_reason = _trim(vote_reason.get(aid, ""), 160)
        allies = [bid for bid in vote_map if bid != aid and vote_map[bid] == my_vote]
        opponents = [
            bid for bid in vote_map
            if bid != aid and vote_map[bid] != my_vote and vote_map[bid] != "abstain"
        ]

        ally_names = [name_by_id[bid] for bid in allies if bid in name_by_id]
        opp_names = [name_by_id[bid] for bid in opponents if bid in name_by_id]
        my_contribution = _trim(refinement_by_agent.get(aid, ""), 240)

        parts = [f"Meeting on \"{_trim(scenario, 140)}\"."]
        if my_contribution:
            parts.append(f"Your position: {my_contribution}")
        parts.append(
            f"You voted {my_vote}" + (f" — {my_reason}" if my_reason else "") + "."
        )
        if ally_names:
            parts.append(f"Agreed with: {', '.join(ally_names)}.")
        if opp_names:
            parts.append(f"Disagreed with: {', '.join(opp_names)}.")
        if summary_trim:
            parts.append(f"Group conclusion: {summary_trim}")

        memory_content = " ".join(parts)

        await db.execute(
            "INSERT INTO memories (agent_id, memory_type, content, meeting_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (aid, "meeting", memory_content, meeting_id, now),
        )

        # Update relationship scores
        for bid in allies:
            await db.execute(
                """
                UPDATE relationships SET trust_score = MIN(1.0, trust_score + 0.1),
                interaction_count = interaction_count + 1
                WHERE agent_id = ? AND target_agent_id = ?
                """,
                (aid, bid),
            )
        for bid in opponents:
            await db.execute(
                """
                UPDATE relationships SET trust_score = MAX(-1.0, trust_score - 0.05),
                interaction_count = interaction_count + 1
                WHERE agent_id = ? AND target_agent_id = ?
                """,
                (aid, bid),
            )

    await db.commit()
