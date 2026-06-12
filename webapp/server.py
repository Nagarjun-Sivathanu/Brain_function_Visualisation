"""
Web backend for the Brain Region multi-agent system.

Wraps BOTH reasoning models and exposes them over JSON only, so the frontend
(and any future production frontend with its own animations) talks to the brain
purely through a JSON contract:

  POST /api/run     {query, mode}  -> full result JSON (one shot)
  GET  /api/stream  ?query&mode    -> Server-Sent Events, one JSON snapshot per
                                       graph node, then a final {event:"done"}.

mode is "broadcast" or "hierarchy". Neither core model is modified; this layer
only adapts their final/intermediate state into a single normalized schema.
"""
import io
import json
import contextlib
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from brain_system.graph import build_graph
from brain_system.hierarchy.graph import build_hierarchy_graph

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Brain Function Visualisation")

# Compile both graphs once at startup.
_broadcast_graph = build_graph()
_hierarchy_graph = build_hierarchy_graph()


def _initial_state(query: str, mode: str) -> dict:
    if mode == "hierarchy":
        return {
            "query": query,
            "routing_path": [],
            "activated_regions": [],
            "region_reports": {},
            "debate_messages": [],
            "cross_connections": {},
            "consensus": {},
            "final_answer": "",
        }
    return {
        "query": query,
        "region_votes": {},
        "active_regions": [],
        "interaction_messages": [],
        "consensus": {},
        "final_answer": "",
    }


def _graph_for(mode: str):
    return _hierarchy_graph if mode == "hierarchy" else _broadcast_graph


def normalize(mode: str, state: dict) -> dict:
    """Convert a model's state into the unified schema the frontend consumes."""
    if mode == "hierarchy":
        return _normalize_hierarchy(state)
    return _normalize_broadcast(state)


def _normalize_broadcast(state: dict) -> dict:
    votes = state.get("region_votes", {}) or {}
    active = set(state.get("active_regions", []) or [])
    regions = []
    for name, v in votes.items():
        regions.append({
            "name": name,
            "confidence": round(float(v.get("confidence", 0.0) or 0.0), 3),
            "involved": bool(v.get("involved", False)),
            "activated": name in active,
            "reasoning": v.get("reasoning", ""),
            "functions": v.get("functions", []),
        })
    regions.sort(key=lambda r: (-r["confidence"], r["name"]))
    return {
        "mode": "broadcast",
        "query": state.get("query", ""),
        "regions": regions,
        "active_regions": list(active),
        "consensus": state.get("consensus", {}),
        "final_answer": state.get("final_answer", ""),
    }


def _normalize_hierarchy(state: dict) -> dict:
    routing = state.get("routing_path", []) or []
    activated = state.get("activated_regions", []) or []
    reports = state.get("region_reports", {}) or {}

    # Confidence lookup by (parent, child) name pair from routing edges.
    edge_conf = {(e.get("parent"), e.get("child")): e.get("confidence", 0.0) for e in routing}

    # Build tree nodes from each activated region's full path (unique id = joined path).
    nodes = {}
    edges = []
    for a in activated:
        path = a.get("path", [])
        for i, name in enumerate(path):
            node_id = " / ".join(path[: i + 1])
            if node_id not in nodes:
                parent_name = path[i - 1] if i > 0 else None
                conf = edge_conf.get((parent_name, name), 1.0 if i == 0 else a.get("confidence", 0.0))
                nodes[node_id] = {
                    "id": node_id,
                    "name": name,
                    "level": i + 1,
                    "root": path[1] if len(path) > 1 else name,
                    "confidence": round(float(conf or 0.0), 3),
                    "terminal": False,
                    "report": "",
                }
            if i > 0:
                edges.append({
                    "from": " / ".join(path[:i]),
                    "to": " / ".join(path[: i + 1]),
                })
        # Mark terminal + attach report.
        if path:
            term_id = " / ".join(path)
            nodes[term_id]["terminal"] = True
            rep = reports.get(path[-1], {})
            nodes[term_id]["report"] = rep.get("contribution", "") or rep.get("role", "")

    # Dedupe edges.
    seen, uniq_edges = set(), []
    for e in edges:
        key = (e["from"], e["to"])
        if key not in seen:
            seen.add(key)
            uniq_edges.append(e)

    return {
        "mode": "hierarchy",
        "query": state.get("query", ""),
        "nodes": list(nodes.values()),
        "edges": uniq_edges,
        "routing_path": routing,
        "activated_regions": [
            {"name": a.get("name"), "path": a.get("path", []), "confidence": a.get("confidence", 0.0)}
            for a in activated
        ],
        "consensus": state.get("consensus", {}),
        "final_answer": state.get("final_answer", ""),
    }


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
class RunRequest(BaseModel):
    query: str
    mode: str = "broadcast"


@app.post("/api/run")
def run(req: RunRequest):
    """One-shot: run the whole graph, return the full normalized JSON + transcript."""
    graph = _graph_for(req.mode)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        final_state = graph.invoke(_initial_state(req.query, req.mode))
    result = normalize(req.mode, final_state)
    result["transcript"] = buf.getvalue()
    return JSONResponse(result)


@app.get("/api/stream")
def stream(query: str, mode: str = "broadcast"):
    """SSE: emit a normalized snapshot after each graph node, then a final result."""

    # Friendly labels for the terminal pane.
    node_labels = {
        "broadcast": "Broadcasting query to all regions",
        "parallel_eval": "Regions self-evaluating in parallel",
        "vote_collector": "Collecting region votes",
        "region_selector": "Selecting active regions",
        "interaction": "Active regions interacting",
        "consensus": "Forming consensus",
        "narrator": "Narrating final answer",
        "route": "Routing query top-down through the hierarchy",
        "debate": "Activated regions debating",
    }

    def event_gen():
        graph = _graph_for(mode)
        acc = _initial_state(query, mode)
        try:
            for update in graph.stream(_initial_state(query, mode), stream_mode="updates"):
                for node_name, delta in update.items():
                    if isinstance(delta, dict):
                        acc.update(delta)
                    snapshot = normalize(mode, acc)
                    payload = {
                        "event": "step",
                        "node": node_name,
                        "label": node_labels.get(node_name, node_name),
                        "snapshot": snapshot,
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
            done = {"event": "done", "result": normalize(mode, acc)}
            yield f"data: {json.dumps(done)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
