"""
HierAgent: a single node in the hierarchical routing tree.

Two jobs:
  1. route()  -> given the query and this node's children, decide which children
                 should receive the query (top-down routing decision).
  2. report() -> when this node is the deepest relevant region (it activates),
                 explain its functional contribution.

Rich content (the 13 authored regions) is loaded from the existing
*_agent_prompt.md / *_summary.md files. Deeper anatomical nodes that have no
authored file fall back to a generic prompt built from the name + tree path.
"""
import json
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from brain_system.config import get_llm_client, LLM_MODEL, LLM_PARAMS
from brain_system.region_loader import load_region_content

_executor = ThreadPoolExecutor(max_workers=16)

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _discover_regions() -> dict:
    """Normalized clean name -> (folder, file_prefix), discovered by scanning the
    repo for any folder containing a *_summary.md. Drop in a region folder and
    the hierarchy model finds it automatically — no hardcoded list."""
    out: dict[str, tuple[str, str]] = {}
    for entry in _REPO_ROOT.iterdir():
        if not entry.is_dir():
            continue
        try:
            summaries = [f.name for f in entry.iterdir() if f.name.endswith("_summary.md")]
        except OSError:
            continue
        if not summaries:
            continue
        prefix = summaries[0][: -len("_summary.md")]
        out[entry.name.lower().replace("_", " ")] = (entry.name, prefix)
    return out


# Normalized clean name -> (folder, file_prefix) for every authored region.
KNOWN_REGIONS = _discover_regions()

ROUTE_SCHEMA = """{
  "decisions": [
    {"child": "<exact child name>", "relevant": true or false, "confidence": 0.0 to 1.0, "reason": "short biological reason"}
  ]
}"""

REPORT_SCHEMA = """{
  "region": "<this region name>",
  "involved": true or false,
  "confidence": 0.0 to 1.0,
  "role": "<the functional role this region plays for the query>",
  "contribution": "<specific contribution to answering the query>",
  "connections_used": ["<connected regions you rely on, if any>"]
}"""


def _load_node_content(clean_name: str) -> dict:
    info = KNOWN_REGIONS.get(clean_name.strip().lower())
    if info:
        folder, prefix = info
        return load_region_content(folder, prefix)
    return {"agent_prompt": "", "summary": ""}


class HierAgent:
    def __init__(self, clean_name: str, path: list):
        self.name = clean_name
        self.path = path  # list of clean names from root to this node
        content = _load_node_content(clean_name)
        self.agent_prompt = content["agent_prompt"]
        self.summary = content["summary"]

    # -- LLM plumbing -------------------------------------------------------
    def _call(self, system_prompt: str, user_message: str) -> str:
        client = get_llm_client()
        completion = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            **LLM_PARAMS,
        )
        return completion.choices[0].message.content

    @staticmethod
    def _parse_json(raw: str) -> dict:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())

    def _identity(self) -> str:
        route = " -> ".join(self.path) if self.path else self.name
        parts = []
        if self.agent_prompt:
            parts.append(self.agent_prompt)
        else:
            parts.append(
                f"You are the brain region '{self.name}', an anatomical region of the "
                f"human brain. Reason strictly from real neuroanatomy and physiology."
            )
        if self.summary:
            parts.append(f"\n## Functional Summary\n{self.summary}")
        parts.append(f"\n## Your position in the brain hierarchy\n{route}")
        parts.append("\nIMPORTANT: reply ONLY with valid JSON. No prose, no markdown fences.")
        return "\n".join(parts)

    # -- routing ------------------------------------------------------------
    def route_sync(self, query: str, children: list) -> list:
        """Decide which child regions should receive the query."""
        system_prompt = self._identity()
        child_list = "\n".join(f"- {c}" for c in children)
        user_message = (
            f"A query has been routed to you. Based on real brain function, decide which of "
            f"your direct sub-regions are involved in handling it. Only pass it down to a child "
            f"if that child's function is genuinely engaged.\n\n"
            f"Query: {query}\n\n"
            f"Your direct sub-regions:\n{child_list}\n\n"
            f"Reply ONLY with JSON matching this schema:\n{ROUTE_SCHEMA}"
        )
        try:
            result = self._parse_json(self._call(system_prompt, user_message))
            decisions = result.get("decisions", [])
            valid = {c.strip().lower(): c for c in children}
            out = []
            for d in decisions:
                child_raw = str(d.get("child", "")).strip().lower()
                if child_raw in valid:
                    out.append({
                        "child": valid[child_raw],
                        "relevant": bool(d.get("relevant", False)),
                        "confidence": float(d.get("confidence", 0.0) or 0.0),
                        "reason": d.get("reason", ""),
                    })
            return out
        except Exception:
            return []

    # -- activation report --------------------------------------------------
    def report_sync(self, query: str, connections: list) -> dict:
        system_prompt = self._identity()
        conn_text = ", ".join(connections) if connections else "none on record"
        user_message = (
            f"You are the deepest relevant region for this query — it activates you.\n\n"
            f"Query: {query}\n\n"
            f"Atlas-derived connections you may draw on: {conn_text}\n\n"
            f"Explain your functional role and contribution. "
            f"Reply ONLY with JSON matching this schema:\n{REPORT_SCHEMA}"
        )
        try:
            result = self._parse_json(self._call(system_prompt, user_message))
            result.setdefault("region", self.name)
            result.setdefault("involved", True)
            result.setdefault("confidence", 0.0)
            result.setdefault("role", "")
            result.setdefault("contribution", "")
            result.setdefault("connections_used", [])
            return result
        except Exception:
            return {
                "region": self.name,
                "involved": True,
                "confidence": 0.0,
                "role": "",
                "contribution": "Failed to parse LLM response.",
                "connections_used": [],
            }

    def refine_sync(self, query: str, own_report: dict, peer_reports: list) -> dict:
        """Debate round: refine contribution after seeing peers."""
        system_prompt = self._identity()
        peers_text = "\n".join(
            f"- {r.get('region')}: {r.get('contribution', '')}"
            for r in peer_reports if r.get("region") != self.name
        ) or "No other active regions."
        user_message = (
            f"The active brain network is debating this query.\n\n"
            f"Query: {query}\n\n"
            f"Your current contribution: {own_report.get('contribution', '')}\n\n"
            f"Other active regions said:\n{peers_text}\n\n"
            f"Refine your contribution, resolve overlaps, and sharpen your role. "
            f"Reply ONLY with JSON matching this schema:\n{REPORT_SCHEMA}"
        )
        try:
            result = self._parse_json(self._call(system_prompt, user_message))
            result.setdefault("region", self.name)
            result.setdefault("confidence", own_report.get("confidence", 0.0))
            result.setdefault("role", own_report.get("role", ""))
            result.setdefault("contribution", own_report.get("contribution", ""))
            result.setdefault("connections_used", own_report.get("connections_used", []))
            return result
        except Exception:
            return own_report

    # -- async wrappers -----------------------------------------------------
    async def route(self, query: str, children: list) -> list:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self.route_sync, query, children)

    async def report(self, query: str, connections: list) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self.report_sync, query, connections)

    async def refine(self, query: str, own_report: dict, peer_reports: list) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self.refine_sync, query, own_report, peer_reports)
