"""
LangGraph nodes for the hierarchical routing model.

Flow: route (top-down from Brain) -> debate (activated regions) -> consensus -> narrator.
Kept fully separate from the broadcast model under brain_system/nodes/.
"""
import json
import asyncio

from brain_system.config import (
    get_llm_client,
    LLM_MODEL,
    LLM_PARAMS,
    CONFIDENCE_THRESHOLD,
)
from .state import HierState
from .ontology import root_node, children_of, get_connections
from .hier_agent import HierAgent

MAX_ROUTE_CALLS = 60      # safety budget on routing LLM calls
MAX_ACTIVATIONS = 14      # cap on how many terminal regions enter the debate


# ----------------------------------------------------------------------------
# Node 1: hierarchical top-down routing
# ----------------------------------------------------------------------------
def route_node(state: HierState) -> HierState:
    query = state["query"]
    root_name, root_subtree = root_node()
    threshold = CONFIDENCE_THRESHOLD

    print(f"\n[Hierarchical Route] Query enters at '{root_name}'. Routing top-down...\n")

    routing_path = []
    activated = []
    # frontier items: {"path": [...], "subtree": {...}, "level": int, "conf": float}
    frontier = [{"path": [root_name], "subtree": root_subtree, "level": 1, "conf": 1.0}]
    budget = MAX_ROUTE_CALLS

    while frontier and budget > 0:
        internal = []  # nodes that have children and need a routing decision
        for item in frontier:
            kids = children_of(item["subtree"])
            if not kids:
                activated.append({"name": item["path"][-1], "path": item["path"], "confidence": item["conf"]})
            else:
                internal.append({**item, "kids": kids})

        if not internal:
            break

        budget -= len(internal)

        async def run_level():
            tasks = []
            for node in internal:
                agent = HierAgent(node["path"][-1], node["path"])
                child_names = [c[0] for c in node["kids"]]
                tasks.append(agent.route(query, child_names))
            return await asyncio.gather(*tasks)

        level_results = asyncio.run(run_level())

        next_frontier = []
        for node, decisions in zip(internal, level_results):
            node_name = node["path"][-1]
            kid_map = {c[0].strip().lower(): c[1] for c in node["kids"]}
            relevant = [
                d for d in decisions
                if d.get("relevant") and d.get("confidence", 0.0) > threshold
            ]

            if not relevant:
                # Region is relevant (its parent routed here) but no sub-part is more apt.
                activated.append({"name": node_name, "path": node["path"], "confidence": node["conf"]})
                print(f"  * ACTIVATE  {' -> '.join(node['path'])}  (no sub-region more apt)")
                continue

            for d in relevant:
                child = d["child"]
                conf = d.get("confidence", 0.0)
                routing_path.append({
                    "parent": node_name,
                    "child": child,
                    "confidence": conf,
                    "reason": d.get("reason", ""),
                    "level": node["level"],
                })
                print(f"  -> {node_name}  routes to  {child}  (conf={conf:.2f})")
                subtree = kid_map.get(child.strip().lower(), {})
                next_frontier.append({
                    "path": node["path"] + [child],
                    "subtree": subtree,
                    "level": node["level"] + 1,
                    "conf": conf,
                })
        frontier = next_frontier

    # Budget exhausted but nodes still pending -> activate them where they stand.
    for item in frontier:
        activated.append({"name": item["path"][-1], "path": item["path"], "confidence": item["conf"]})

    # Dedupe by full path, cap, prefer higher confidence.
    seen, deduped = set(), []
    for a in sorted(activated, key=lambda x: -x.get("confidence", 0.0)):
        key = tuple(a["path"])
        if key not in seen:
            seen.add(key)
            deduped.append(a)
    deduped = deduped[:MAX_ACTIVATIONS]

    print(f"\n[Hierarchical Route] {len(deduped)} region(s) activated.\n")
    return {**state, "routing_path": routing_path, "activated_regions": deduped}


# ----------------------------------------------------------------------------
# Node 2: debate among activated regions
# ----------------------------------------------------------------------------
def debate_node(state: HierState) -> HierState:
    activated = state["activated_regions"]
    if not activated:
        print("[Debate] No activated regions — skipping.\n")
        return {**state, "region_reports": {}, "debate_messages": [], "cross_connections": {}}

    print(f"[Debate] {len(activated)} active regions reporting and debating...\n")

    agents = {a["name"]: HierAgent(a["name"], a["path"]) for a in activated}
    cross_connections = {name: get_connections(name) for name in agents}

    # Round 1: each region reports its contribution.
    async def run_reports():
        tasks = [agents[a["name"]].report(state["query"], cross_connections[a["name"]]) for a in activated]
        return await asyncio.gather(*tasks)

    reports_list = asyncio.run(run_reports())
    reports = {r.get("region", a["name"]): r for a, r in zip(activated, reports_list)}
    for name, r in reports.items():
        print(f"  [{name}] {r.get('contribution', '')[:110]}")
    print()

    # Round 2: each region refines after seeing peers.
    print("[Debate] Refinement round...\n")
    peer_list = list(reports.values())

    async def run_refine():
        tasks = []
        names = []
        for name, agent in agents.items():
            own = reports.get(name, {})
            tasks.append(agent.refine(state["query"], own, peer_list))
            names.append(name)
        results = await asyncio.gather(*tasks)
        return dict(zip(names, results))

    refined = asyncio.run(run_refine())
    debate_messages = [{"round": 2, "region": n, "contribution": r.get("contribution", "")}
                       for n, r in refined.items()]
    for name, r in refined.items():
        reports[name] = r
        print(f"  [{name}] {r.get('contribution', '')[:110]}")
    print()

    return {
        **state,
        "region_reports": reports,
        "debate_messages": debate_messages,
        "cross_connections": cross_connections,
    }


# ----------------------------------------------------------------------------
# Node 3: consensus generator
# ----------------------------------------------------------------------------
CONSENSUS_SCHEMA = """{
  "active_regions": ["list of region names"],
  "regional_roles": {"<region>": "<role>"},
  "network_decision": {"answer": "<answer to the query>", "reasoning": "<how the network decided>"},
  "confidence": 0.0
}"""


def consensus_node(state: HierState) -> HierState:
    print("[Consensus] Aggregating hierarchical network activity...")

    reports_text = json.dumps(
        {n: {"role": r.get("role", ""), "contribution": r.get("contribution", ""),
             "confidence": r.get("confidence", 0.0)}
         for n, r in state["region_reports"].items()},
        indent=2,
    )
    route_text = " ; ".join(
        f"{e['parent']}->{e['child']}({e['confidence']:.2f})" for e in state["routing_path"]
    ) or "no routing edges"

    system_prompt = (
        "You are the consensus generator for a hierarchical brain simulation. You receive the "
        "top-down routing path and the reports of the activated regions, and synthesize a final "
        "network decision. Reply ONLY with valid JSON."
    )
    user_message = (
        f"Original query: {state['query']}\n\n"
        f"Routing path taken: {route_text}\n\n"
        f"Activated region reports:\n{reports_text}\n\n"
        f"Produce a consensus JSON matching this schema:\n{CONSENSUS_SCHEMA}"
    )

    try:
        raw = get_llm_client().chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            **LLM_PARAMS,
        ).choices[0].message.content
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        consensus = json.loads(raw.strip())
    except Exception as e:
        consensus = {
            "active_regions": list(state["region_reports"].keys()),
            "regional_roles": {n: r.get("role", "") for n, r in state["region_reports"].items()},
            "network_decision": {"answer": "Could not generate consensus.", "reasoning": str(e)},
            "confidence": 0.0,
        }

    print(f"  Answer: {consensus.get('network_decision', {}).get('answer', '')}\n")
    return {**state, "consensus": consensus}


# ----------------------------------------------------------------------------
# Node 4: final narrator
# ----------------------------------------------------------------------------
def narrator_node(state: HierState) -> HierState:
    print("[Narrator] Generating human-readable explanation...")

    route_lines = "\n".join(
        f"  {e['parent']} -> {e['child']} (confidence {e['confidence']:.2f}): {e['reason']}"
        for e in state["routing_path"]
    ) or "  (no routing path)"

    system_prompt = (
        "You are a neuroscience narrator. Translate the hierarchical brain simulation below into "
        "clear human-readable prose. Describe the path the query took down the brain hierarchy, "
        "which regions activated, what each contributed, and the final answer. Plain English."
    )
    user_message = (
        f"Query: {state['query']}\n\n"
        f"Routing path (top-down):\n{route_lines}\n\n"
        f"Consensus:\n{json.dumps(state['consensus'], indent=2)}\n\n"
        "Write the final narrative."
    )

    try:
        narrative = get_llm_client().chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            **LLM_PARAMS,
        ).choices[0].message.content
    except Exception as e:
        narrative = f"[Narrator failed: {e}]"

    return {**state, "final_answer": narrative}
